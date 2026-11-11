import express from "express";
import { requireAuth } from "../auth.js";
import { db, nowIso } from "../db.js";
import { isUserOnline, publish } from "../realtime.js";
import { canAccessTicket } from "../serialize.js";

const router = express.Router();

const RING_TIMEOUT_MS = 60 * 1000;
const ACTIVE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const CALL_KINDS = new Set(["video", "audio"]);
const SIGNAL_TYPES = new Set(["offer", "answer", "ice", "state"]);
const MAX_SIGNAL_BYTES = 200_000;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function fail(res, status, message) {
  res.status(status).json({ error: message });
  return null;
}

const callSelect = `
  SELECT c.*, t.ref AS ticket_ref,
    caller.name AS caller_name, caller.role AS caller_role,
    callee.name AS callee_name, callee.role AS callee_role
  FROM calls c
  JOIN tickets t ON t.id = c.ticket_id
  JOIN users caller ON caller.id = c.caller_id
  JOIN users callee ON callee.id = c.callee_id
`;

function getCallRow(callId) {
  return db.prepare(`${callSelect} WHERE c.id = ?`).get(callId);
}

function serializeCall(row) {
  if (!row) return null;
  const answeredMs = row.answered_at ? new Date(row.answered_at).getTime() : null;
  const endedMs = row.ended_at ? new Date(row.ended_at).getTime() : null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    ticketRef: row.ticket_ref ?? null,
    kind: row.kind,
    status: row.status,
    caller: { id: row.caller_id, name: row.caller_name, role: row.caller_role },
    callee: { id: row.callee_id, name: row.callee_name, role: row.callee_role },
    createdAt: row.created_at,
    answeredAt: row.answered_at ?? null,
    endedAt: row.ended_at ?? null,
    durationSeconds:
      answeredMs && endedMs ? Math.max(0, Math.round((endedMs - answeredMs) / 1000)) : null,
  };
}

function participants(call) {
  return (user) => user.id === call.caller_id || user.id === call.callee_id;
}

/** Closes ringing calls nobody answered and abandoned active calls. */
function expireStaleCalls() {
  const now = nowIso();
  const stale = db
    .prepare(
      `SELECT id FROM calls
       WHERE (status = 'ringing' AND created_at < ?)
          OR (status = 'active' AND COALESCE(answered_at, created_at) < ?)`,
    )
    .all(
      new Date(Date.now() - RING_TIMEOUT_MS).toISOString(),
      new Date(Date.now() - ACTIVE_TIMEOUT_MS).toISOString(),
    );
  if (!stale.length) return;
  const update = db.prepare(
    "UPDATE calls SET status = 'missed', ended_at = COALESCE(ended_at, ?) WHERE id = ? AND status IN ('ringing', 'active')",
  );
  for (const item of stale) {
    const changed = update.run(now, item.id);
    if (!changed.changes) continue;
    const row = getCallRow(item.id);
    if (!row) continue;
    publish(
      "call:ended",
      { callId: row.id, reason: "missed", call: serializeCall(row) },
      participants(row),
    );
  }
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

function loadCall(req, res) {
  const callId = parseId(req.params.id);
  if (!callId) return fail(res, 404, "Call not found.");
  const call = getCallRow(callId);
  if (!call) return fail(res, 404, "Call not found.");
  if (call.caller_id !== req.user.id && call.callee_id !== req.user.id) {
    return fail(res, 403, "You aren't part of this call.");
  }
  return call;
}

router.use(requireAuth);

/** Recent calls for a request, visible to everyone who can open that request. */
router.get("/calls/ticket/:ticketId", (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) return fail(res, 404, "Request not found.");
  const ticket = loadTicket(ticketId, req.user, res);
  if (!ticket) return;
  expireStaleCalls();
  const rows = db
    .prepare(`${callSelect} WHERE c.ticket_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 25`)
    .all(ticketId);
  return res.json({ calls: rows.map(serializeCall) });
});

/** Start a call from a request. Customers call their assigned agent; staff call the customer. */
/** Tells the caller whether the other participant is connected right now. */
router.get("/calls/availability/:ticketId", (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) return fail(res, 404, "Request not found.");
  const ticket = loadTicket(ticketId, req.user, res);
  if (!ticket) return;

  const peerId = req.user.role === "customer" ? ticket.assignee_id : ticket.customer_id;
  if (!peerId) {
    return res.json({ peer: null, online: false, available: false, reason: "No IT agent is assigned yet." });
  }
  const peer = db.prepare("SELECT id, name, role, active FROM users WHERE id = ?").get(peerId);
  return res.json({
    peer: peer ? { id: peer.id, name: peer.name, role: peer.role } : null,
    online: Boolean(peer?.active) && isUserOnline(peerId),
    available: Boolean(peer?.active),
  });
});

router.post("/calls", (req, res) => {
  expireStaleCalls();
  const ticketId = parseId(req.body?.ticketId);
  if (!ticketId) return fail(res, 400, "Choose a request to call about.");
  const ticket = loadTicket(ticketId, req.user, res);
  if (!ticket) return;

  const kind = CALL_KINDS.has(req.body?.kind) ? req.body.kind : "video";

  let calleeId;
  if (req.user.role === "customer") {
    calleeId = ticket.assignee_id;
    if (!calleeId) {
      return fail(res, 400, "No IT agent is assigned to this request yet. Please reply in the thread.");
    }
  } else {
    calleeId = ticket.customer_id;
  }

  if (!calleeId || calleeId === req.user.id) {
    return fail(res, 400, "There isn't anyone to call on this request yet.");
  }

  const callee = db.prepare("SELECT id, name, active FROM users WHERE id = ?").get(calleeId);
  if (!callee || !callee.active) {
    return fail(res, 409, "The person you're trying to reach is unavailable right now.");
  }

  const existing = db
    .prepare(
      `SELECT id, caller_id, callee_id FROM calls
       WHERE ticket_id = ? AND status IN ('ringing', 'active')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(ticketId);
  if (existing) {
    const isParticipant = existing.caller_id === req.user.id || existing.callee_id === req.user.id;
    if (!isParticipant) {
      return fail(res, 409, "A call is already in progress for this request.");
    }
    // A reloaded or abandoned call must not block a fresh one.
    db.prepare(
      "UPDATE calls SET status = 'ended', ended_at = ?, ended_by = ? WHERE id = ? AND status IN ('ringing', 'active')",
    ).run(nowIso(), req.user.id, existing.id);
    const endedRow = getCallRow(existing.id);
    if (endedRow) {
      publish(
        "call:ended",
        { callId: endedRow.id, reason: "ended", call: serializeCall(endedRow) },
        participants(endedRow),
      );
    }
  }

  const info = db
    .prepare(
      `INSERT INTO calls (ticket_id, caller_id, callee_id, kind, status, created_at)
       VALUES (?, ?, ?, ?, 'ringing', ?)`,
    )
    .run(ticketId, req.user.id, calleeId, kind, nowIso());
  const row = getCallRow(Number(info.lastInsertRowid));
  const call = serializeCall(row);
  const delivered = publish("call:incoming", { call }, (user) => user.id === calleeId);
  if (!delivered) {
    // Nobody is listening, so ringing would fail silently. Cancel and explain why.
    db.prepare("UPDATE calls SET status = 'cancelled', ended_at = ?, ended_by = ? WHERE id = ?").run(
      nowIso(),
      req.user.id,
      call.id,
    );
    return fail(
      res,
      409,
      `${callee.name} isn't connected to SupportIQ right now, so the call couldn't reach them. Ask them to open SupportIQ, then try again.`,
    );
  }
  return res.status(201).json({ call, receiverOnline: true });
});

router.post("/calls/:id/accept", (req, res) => {
  const call = loadCall(req, res);
  if (!call) return;
  if (call.callee_id !== req.user.id) return fail(res, 403, "Only the person being called can answer.");
  if (call.status !== "ringing") return fail(res, 409, "This call is no longer ringing.");

  db.prepare("UPDATE calls SET status = 'active', answered_at = ? WHERE id = ? AND status = 'ringing'").run(
    nowIso(),
    call.id,
  );
  const row = getCallRow(call.id);
  const payload = serializeCall(row);
  publish("call:accepted", { callId: row.id, call: payload }, participants(row));
  return res.json({ call: payload });
});

router.post("/calls/:id/decline", (req, res) => {
  const call = loadCall(req, res);
  if (!call) return;
  if (call.callee_id !== req.user.id) return fail(res, 403, "Only the person being called can decline.");
  if (call.status !== "ringing") return fail(res, 409, "This call is no longer ringing.");

  db.prepare("UPDATE calls SET status = 'declined', ended_at = ?, ended_by = ? WHERE id = ?").run(
    nowIso(),
    req.user.id,
    call.id,
  );
  const row = getCallRow(call.id);
  const payload = serializeCall(row);
  publish("call:declined", { callId: row.id, call: payload }, participants(row));
  return res.json({ call: payload });
});

router.post("/calls/:id/end", (req, res) => {
  const call = loadCall(req, res);
  if (!call) return;
  if (!["ringing", "active"].includes(call.status)) {
    return res.json({ call: serializeCall(call) });
  }

  const status =
    call.status === "ringing" && call.caller_id === req.user.id ? "cancelled" : "ended";
  db.prepare("UPDATE calls SET status = ?, ended_at = ?, ended_by = ? WHERE id = ?").run(
    status,
    nowIso(),
    req.user.id,
    call.id,
  );
  const row = getCallRow(call.id);
  const payload = serializeCall(row);
  publish("call:ended", { callId: row.id, reason: status, call: payload }, participants(row));
  return res.json({ call: payload });
});

/** Relays WebRTC offers, answers, and ICE candidates between the two participants. */
router.post("/calls/:id/signal", (req, res) => {
  const call = loadCall(req, res);
  if (!call) return;
  if (!["ringing", "active"].includes(call.status)) {
    return fail(res, 409, "This call has already ended.");
  }
  const type = String(req.body?.type ?? "");
  if (!SIGNAL_TYPES.has(type)) return fail(res, 400, "Unknown call signal.");
  const payload = req.body?.payload;
  if (payload == null) return fail(res, 400, "Missing call signal payload.");
  let size = 0;
  try {
    size = JSON.stringify(payload).length;
  } catch {
    return fail(res, 400, "Invalid call signal payload.");
  }
  if (size > MAX_SIGNAL_BYTES) return fail(res, 413, "Call signal is too large.");

  const otherId = req.user.id === call.caller_id ? call.callee_id : call.caller_id;
  publish(
    "call:signal",
    { callId: call.id, fromUserId: req.user.id, signalType: type, payload },
    (user) => user.id === otherId,
  );
  return res.json({ ok: true });
});

export default router;
