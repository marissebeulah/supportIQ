import express from "express";
import { hashPassword, requireAuth, verifyPassword } from "../auth.js";
import { db, nowIso } from "../db.js";
import { publish } from "../realtime.js";
import { canAccessTicket } from "../serialize.js";
import { getFrame, notifyUser, queueInput } from "../remote-hub.js";
import {
  ACTIVE_TTL_MS,
  OPEN_STATUSES,
  REQUEST_TTL_MS,
  audience,
  canControl,
  canViewScreen,
  closeSession,
  expireStaleSessions,
  getSessionRow,
  isParticipant,
  listSessionRowsForTicket,
  serializeDevice,
  serializeSession,
} from "../remote-sessions.js";

const router = express.Router();

const INPUT_TYPES = new Set(["m", "md", "mu", "w", "kd", "ku"]);

const UNATTENDED_WINDOW_MS = 10 * 60 * 1000;
const UNATTENDED_MAX_FAILURES = 5;
const unattendedFailures = new Map();

function unattendedBlockedFor(key) {
  const entry = unattendedFailures.get(key);
  if (!entry) return 0;
  if (Date.now() > entry.resetAt) {
    unattendedFailures.delete(key);
    return 0;
  }
  if (entry.count < UNATTENDED_MAX_FAILURES) return 0;
  return Math.ceil((entry.resetAt - Date.now()) / 1000);
}

function recordUnattendedFailure(key) {
  const now = Date.now();
  const entry = unattendedFailures.get(key);
  if (!entry || now > entry.resetAt) {
    unattendedFailures.set(key, { count: 1, resetAt: now + UNATTENDED_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function fail(res, status, message) {
  res.status(status).json({ error: message });
  return null;
}

function expiresFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function loadTicket(ticketId, viewer, res) {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) {
    fail(res, 404, "Request not found.");
    return null;
  }
  if (!canAccessTicket(ticket, viewer)) {
    fail(res, 403, "You don't have access to this request.");
    return null;
  }
  return ticket;
}

function loadSession(req, res) {
  const sessionId = parseId(req.params.id);
  if (!sessionId) return fail(res, 404, "Remote session not found.");
  const session = getSessionRow(sessionId);
  if (!session) return fail(res, 404, "Remote session not found.");
  if (!isParticipant(session, req.user)) {
    return fail(res, 403, "You aren't part of this remote session.");
  }
  return session;
}

function sanitizeInputEvents(value) {
  if (!Array.isArray(value)) return [];
  const events = [];
  for (const entry of value.slice(0, 100)) {
    if (!entry || typeof entry !== "object" || !INPUT_TYPES.has(entry.t)) continue;
    if (entry.t === "m") {
      const x = Number(entry.x);
      const y = Number(entry.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      events.push({ t: "m", x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
      continue;
    }
    if (entry.t === "md" || entry.t === "mu") {
      const button = Number(entry.b);
      if (!Number.isInteger(button) || button < 0 || button > 2) continue;
      events.push({ t: entry.t, b: button });
      continue;
    }
    if (entry.t === "w") {
      const delta = Number(entry.d);
      if (!Number.isFinite(delta)) continue;
      events.push({ t: "w", d: Math.sign(delta) });
      continue;
    }
    const key = String(entry.k ?? "");
    if (!key || key.length > 32) continue;
    const code = typeof entry.c === "string" && entry.c.length <= 32 ? entry.c : undefined;
    events.push(code ? { t: entry.t, k: key, c: code } : { t: entry.t, k: key });
  }
  return events;
}

router.use(requireAuth);

/** Remote session history for a request, visible to everyone who can open it. */
router.get("/remote-sessions/ticket/:ticketId", (req, res) => {
  expireStaleSessions();
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) return fail(res, 404, "Request not found.");
  const ticket = loadTicket(ticketId, req.user, res);
  if (!ticket) return;
  return res.json({
    remoteSessions: listSessionRowsForTicket(ticketId).map(serializeSession),
  });
});

/** Paired computers for a request's customer, used by IT's unattended connect picker. */
router.get("/remote-sessions/ticket/:ticketId/devices", (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) return fail(res, 404, "Request not found.");
  const ticket = loadTicket(ticketId, req.user, res);
  if (!ticket) return;
  if (!ticket.customer_id) return res.json({ devices: [] });
  const rows = db
    .prepare(
      `SELECT * FROM agent_devices WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC`,
    )
    .all(ticket.customer_id);
  return res.json({ devices: rows.map(serializeDevice) });
});

/**
 * The technician saves the connect-anytime password for one of this request's
 * customer PCs. After that they can start a session with that password without
 * the customer clicking Allow, while the agent keeps its visible red bar and
 * Stop button, and the customer can turn it off from their portal.
 */
router.put("/remote-sessions/ticket/:ticketId/devices/:deviceId/unattended", (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  const deviceId = parseId(req.params.deviceId);
  if (!ticketId || !deviceId) return fail(res, 404, "Paired computer not found.");
  const ticket = loadTicket(ticketId, req.user, res);
  if (!ticket) return;
  if (req.user.role === "customer") {
    return fail(res, 403, "Only IT support can save this password from a request.");
  }
  if (!ticket.customer_id) return fail(res, 400, "This request has no customer account.");

  const device = db
    .prepare(
      `SELECT * FROM agent_devices
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .get(deviceId, ticket.customer_id);
  if (!device) return fail(res, 404, "That PC isn't paired to this customer.");

  if (req.body?.enabled !== true) {
    db.prepare(
      `UPDATE agent_devices
       SET unattended_enabled = 0, unattended_password_hash = NULL, unattended_updated_at = ?
       WHERE id = ?`,
    ).run(nowIso(), device.id);
    const cleared = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(device.id);
    return res.json({ device: serializeDevice(cleared) });
  }

  const password = String(req.body?.password ?? "");
  if (password.length < 8 || password.length > 128) {
    return fail(res, 400, "Use a connect-anytime password of 8 to 128 characters.");
  }
  db.prepare(
    `UPDATE agent_devices
     SET unattended_enabled = 1, unattended_password_hash = ?, unattended_updated_at = ?
     WHERE id = ?`,
  ).run(hashPassword(password), nowIso(), device.id);
  notifyUser(device.user_id);
  const saved = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(device.id);
  return res.json({ device: serializeDevice(saved) });
});

/** IT support asks the customer for a remote session. The customer must allow it in the agent. */
router.post("/remote-sessions", (req, res) => {
  expireStaleSessions();
  const ticketId = parseId(req.body?.ticketId);
  if (!ticketId) return fail(res, 400, "Choose a request to connect to.");
  const ticket = loadTicket(ticketId, req.user, res);
  if (!ticket) return;
  if (req.user.role === "customer") {
    return fail(res, 403, "Only IT support can request a remote session.");
  }
  if (!ticket.customer_id) return fail(res, 400, "This request has no customer account.");

  const existing = db
    .prepare(
      `SELECT * FROM remote_sessions WHERE ticket_id = ?
       AND status IN ('requested', 'ready', 'active')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(ticketId);
  if (existing) {
    return res.json({ remoteSession: serializeSession(getSessionRow(existing.id)), reused: true });
  }

  const info = db
    .prepare(
      `INSERT INTO remote_sessions (ticket_id, requested_by, customer_id, status, created_at, expires_at)
       VALUES (?, ?, ?, 'requested', ?, ?)`,
    )
    .run(ticketId, req.user.id, ticket.customer_id, nowIso(), expiresFromNow(REQUEST_TTL_MS));
  const row = getSessionRow(Number(info.lastInsertRowid));
  const session = serializeSession(row);
  publish("remote:requested", { sessionId: row.id, remoteSession: session }, audience(row));
  // Wake a paired agent so the customer sees the prompt immediately.
  notifyUser(row.customer_id);
  return res.status(201).json({ remoteSession: session });
});

/**
 * Connects with the password the customer saved for one of their paired PCs.
 * This skips the per-session Allow click but keeps the agent's visible red bar,
 * the customer's Stop button, and the same transient frame/input relay.
 */
router.post("/remote-sessions/unattended", (req, res) => {
  expireStaleSessions();
  const ticketId = parseId(req.body?.ticketId);
  if (!ticketId) return fail(res, 400, "Choose a request to connect to.");
  const ticket = loadTicket(ticketId, req.user, res);
  if (!ticket) return;
  if (req.user.role === "customer") {
    return fail(res, 403, "Only IT support can start a remote session.");
  }
  if (!ticket.customer_id) return fail(res, 400, "This request has no customer account.");

  const deviceId = parseId(req.body?.deviceId);
  if (!deviceId) return fail(res, 400, "Choose the customer's PC.");
  const device = db
    .prepare(
      `SELECT * FROM agent_devices
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .get(deviceId, ticket.customer_id);
  if (!device) return fail(res, 404, "That PC isn't paired to this customer.");
  if (Number(device.unattended_enabled) !== 1 || !device.unattended_password_hash) {
    return fail(res, 409, "Unattended access isn't turned on for that PC.");
  }

  const attemptKey = `${device.id}:${req.user.id}`;
  const blockedFor = unattendedBlockedFor(attemptKey);
  if (blockedFor > 0) {
    const minutes = Math.max(1, Math.ceil(blockedFor / 60));
    return fail(res, 429, `Too many incorrect passwords. Try again in ${minutes} minutes.`);
  }
  if (!verifyPassword(String(req.body?.password ?? ""), device.unattended_password_hash)) {
    recordUnattendedFailure(attemptKey);
    return fail(res, 401, "That unattended access password isn't correct.");
  }
  unattendedFailures.delete(attemptKey);

  const existing = db
    .prepare(
      `SELECT * FROM remote_sessions WHERE ticket_id = ?
       AND status IN ('requested', 'ready', 'active')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(ticketId);
  if (existing && existing.status === "active") {
    if (existing.agent_device_id === device.id) {
      return res.json({
        remoteSession: serializeSession(getSessionRow(existing.id)),
        reused: true,
      });
    }
    return fail(res, 409, "This request already has a live session on another PC.");
  }

  const now = nowIso();
  const expiresAt = expiresFromNow(ACTIVE_TTL_MS);
  let sessionId;
  if (existing) {
    // Supersede a pending consent prompt on the same request.
    db.prepare(
      `UPDATE remote_sessions
       SET status = 'active', approved_at = ?, started_at = ?, ready_at = COALESCE(ready_at, ?),
         agent_device_id = ?, expires_at = ?, started_with = 'password'
       WHERE id = ? AND status IN ('requested', 'ready')`,
    ).run(now, now, now, device.id, expiresAt, existing.id);
    sessionId = existing.id;
  } else {
    const info = db
      .prepare(
        `INSERT INTO remote_sessions
          (ticket_id, requested_by, customer_id, agent_device_id, status, created_at, ready_at,
           approved_at, started_at, expires_at, started_with)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 'password')`,
      )
      .run(ticketId, req.user.id, ticket.customer_id, device.id, now, now, now, now, expiresAt);
    sessionId = Number(info.lastInsertRowid);
  }

  const row = getSessionRow(sessionId);
  const payload = serializeSession(row);
  publish("remote:active", { sessionId: row.id, remoteSession: payload }, audience(row));
  notifyUser(row.customer_id);
  notifyUser(row.requested_by);
  return res.status(existing ? 200 : 201).json({ remoteSession: payload });
});

/** The customer refuses the request from the ticket page before the agent answers. */
router.post("/remote-sessions/:id/decline", (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  if (session.customer_id !== req.user.id) {
    return fail(res, 403, "Only the customer can decline this request.");
  }
  if (session.status !== "requested") {
    return fail(res, 409, "This remote session is no longer waiting for an answer.");
  }
  const row = closeSession(session, "declined", {
    userId: req.user.id,
    reason: "declined_by_customer",
    event: "remote:declined",
  });
  return res.json({ remoteSession: serializeSession(row) });
});

/** Either participant (or an admin) can end the session immediately. */
router.post("/remote-sessions/:id/end", (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  if (!OPEN_STATUSES.includes(session.status)) {
    return res.json({ remoteSession: serializeSession(session) });
  }
  const reason =
    req.user.id === session.customer_id ? "stopped_by_customer" : "stopped_by_agent";
  const row = closeSession(session, "ended", { userId: req.user.id, reason });
  return res.json({ remoteSession: serializeSession(row) });
});

/** Lightweight state poll used by the browser while a session is open. */
router.get("/remote-sessions/:id/status", (req, res) => {
  expireStaleSessions();
  const session = loadSession(req, res);
  if (!session) return;
  return res.json({ remoteSession: serializeSession(getSessionRow(session.id)) });
});

/** Latest JPEG frame from the agent. Only participants can read it. */
router.get("/remote-sessions/:id/frame", (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  if (!canViewScreen(session, req.user) || session.status !== "active") {
    return res.status(204).end();
  }
  const frame = getFrame(session.id);
  if (!frame) return res.status(204).end();
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Length", String(frame.buffer.length));
  return res.end(frame.buffer);
});

/** Mouse/keyboard input from the technician, queued for the customer's agent. */
router.post("/remote-sessions/:id/input", (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  if (!canControl(session, req.user)) {
    return fail(res, 403, "Only the assigned technician can control this computer.");
  }
  if (session.status !== "active") {
    return fail(res, 409, "The remote session isn't active.");
  }
  const events = sanitizeInputEvents(req.body?.events);
  if (events.length === 0) return fail(res, 400, "No valid input events were sent.");
  queueInput(session.id, events);
  notifyUser(session.customer_id);
  return res.status(202).json({ queued: events.length });
});

/** Keep the active session window alive for the full duration after approval. */
router.post("/remote-sessions/:id/keepalive", (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  if (!canViewScreen(session, req.user) || session.status !== "active") {
    return res.status(204).end();
  }
  db.prepare("UPDATE remote_sessions SET expires_at = ? WHERE id = ? AND status = 'active'").run(
    expiresFromNow(ACTIVE_TTL_MS),
    session.id,
  );
  return res.status(204).end();
});

export default router;
