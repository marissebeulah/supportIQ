import crypto from "node:crypto";
import os from "node:os";
import { db, nowIso } from "./db.js";
import { publish } from "./realtime.js";
import { clearSession, getFrameMeta, notifyUser } from "./remote-hub.js";

export const REQUEST_TTL_MS = 15 * 60 * 1000;
export const ACTIVE_TTL_MS = 2 * 60 * 60 * 1000;
export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const OPEN_STATUSES = ["requested", "ready", "active"];

const sessionSelect = `
  SELECT r.*, t.ref AS ticket_ref,
    requester.name AS requester_name, requester.role AS requester_role,
    customer.name AS customer_name, customer.role AS customer_role,
    device.name AS agent_name,
    dual.name AS dual_technician_name, dual.role AS dual_technician_role,
    EXISTS(
      SELECT 1 FROM agent_devices paired
      WHERE paired.user_id = r.customer_id AND paired.revoked_at IS NULL
    ) AS customer_paired
  FROM remote_sessions r
  JOIN tickets t ON t.id = r.ticket_id
  JOIN users requester ON requester.id = r.requested_by
  JOIN users customer ON customer.id = r.customer_id
  LEFT JOIN agent_devices device ON device.id = r.agent_device_id
  LEFT JOIN users dual ON dual.id = r.dual_technician_id
`;

export function getSessionRow(id) {
  return db.prepare(`${sessionSelect} WHERE r.id = ?`).get(id);
}

export function listSessionRowsForTicket(ticketId) {
  return db
    .prepare(`${sessionSelect} WHERE r.ticket_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 25`)
    .all(ticketId);
}

export function listOpenSessionsForCustomer(customerId) {
  return db
    .prepare(
      `${sessionSelect} WHERE r.customer_id = ?
       AND r.status IN ('requested', 'ready', 'active')
       ORDER BY r.id ASC`,
    )
    .all(customerId);
}

export function listOpenSessionsForRequester(requesterId) {
  return db
    .prepare(
      `${sessionSelect} WHERE r.requested_by = ?
       AND r.status IN ('requested', 'ready', 'active')
       ORDER BY r.id ASC`,
    )
    .all(requesterId);
}

export function serializeSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    ticketRef: row.ticket_ref ?? null,
    status: row.status,
    requestedBy: {
      id: row.requested_by,
      name: row.requester_name,
      role: row.requester_role,
    },
    customer: { id: row.customer_id, name: row.customer_name, role: row.customer_role },
    agent: row.agent_device_id
      ? { id: row.agent_device_id, name: row.agent_name ?? "Paired PC" }
      : null,
    customerPaired: Boolean(row.customer_paired),
    createdAt: row.created_at,
    readyAt: row.ready_at ?? null,
    approvedAt: row.approved_at ?? null,
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    endedReason: row.ended_reason ?? null,
    startedWith: row.started_with ?? null,
    // The customer's screen currently shows the privacy animation.
    privacyMode: Number(row.privacy_mode) === 1,
    dualTechnician: row.dual_technician_id
      ? {
          id: row.dual_technician_id,
          name: row.dual_technician_name ?? "Co-helper",
          role: row.dual_technician_role ?? "it",
        }
      : null,
    primaryTechnicianRating: row.primary_technician_rating ?? null,
    primaryTechnicianRatingComment: row.primary_technician_rating_comment ?? null,
    primaryTechnicianRatedAt: row.primary_technician_rated_at ?? null,
    dualTechnicianRating: row.dual_technician_rating ?? null,
    dualTechnicianRatingComment: row.dual_technician_rating_comment ?? null,
    dualTechnicianRatedAt: row.dual_technician_rated_at ?? null,
    expiresAt: row.expires_at,
    frame: getFrameMeta(row.id),
  };
}

/** Public shape of a paired computer; never includes the device token or password hash. */
export function serializeDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    agentVersion: row.agent_version ?? null,
    unattendedEnabled: Number(row.unattended_enabled) === 1,
    unattendedUpdatedAt: row.unattended_updated_at ?? null,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at ?? null,
  };
}

export function audience(row) {
  return (user) =>
    user.role === "admin" || user.id === row.customer_id || user.id === row.requested_by || user.id === row.dual_technician_id;
}

export function isParticipant(row, user) {
  return (
    user.role === "admin" ||
    user.id === row.customer_id ||
    user.id === row.requested_by ||
    user.id === row.dual_technician_id
  );
}

/** Either participant (or an admin) can read the live screen. */
export function canViewScreen(row, user) {
  return isParticipant(row, user);
}

/** The requesting technician, a co-helper, or an admin can drive input. */
export function canControl(row, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.role === "it" && (user.id === row.requested_by || user.id === row.dual_technician_id);
}

export function closeSession(session, status, options = {}) {
  const { userId = null, reason = null, event = "remote:ended" } = options;
  const now = nowIso();
  const info = db
    .prepare(
      `UPDATE remote_sessions
       SET status = ?, ended_at = COALESCE(ended_at, ?), ended_by = COALESCE(?, ended_by),
         ended_reason = COALESCE(?, ended_reason)
       WHERE id = ? AND status IN ('requested', 'ready', 'active')`,
    )
    .run(status, now, userId, reason, session.id);
  const row = getSessionRow(session.id);
  if (!info.changes) return row;
  clearSession(session.id);
  notifyUser(session.customer_id);
  notifyUser(session.requested_by);
  publish(event, { sessionId: row.id, reason, remoteSession: serializeSession(row) }, audience(row));
  return row;
}

/** Expires requests nobody answered and sessions that exceeded their window. */
export function expireStaleSessions() {
  const now = nowIso();
  const stale = db
    .prepare(
      `SELECT * FROM remote_sessions
       WHERE status IN ('requested', 'ready', 'active') AND expires_at < ?`,
    )
    .all(now);
  for (const row of stale) {
    closeSession(row, "expired", { reason: "expired", event: "remote:ended" });
  }
}

export function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createPairingCode() {
  let raw = "";
  for (let index = 0; index < 8; index += 1) {
    raw += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizePairingCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * A stable address the paired agent can fall back to when the host's LAN IP
 * changes (DHCP). Windows resolves the machine name on the local network, so
 * the tray app can switch back without re-pairing.
 */
export function agentFallbackServerUrl() {
  const configured = process.env.PUBLIC_AGENT_SERVER_FALLBACK;
  if (configured) return configured.replace(/\/+$/, "");
  const name = String(os.hostname() || "").trim();
  if (!name) return null;
  const port = Number(process.env.PORT) || 3001;
  return `http://${name}:${port}`;
}

export function agentServerUrl(req) {
  const configured = process.env.PUBLIC_AGENT_SERVER;
  if (configured) return configured.replace(/\/+$/, "");
  const hostHeader = String(req.headers.host || `localhost:${process.env.PORT || 3001}`);
  const hostname = hostHeader.replace(/:\d+$/, "");
  const port = Number((hostHeader.match(/:(\d+)$/) || [])[1] || 0);
  const apiPort = Number(process.env.PORT) || 3001;
  // When the request comes through the HTTPS dev server, keep the secure origin
  // so the native agent (and the browser) can reach the API without opening
  // the API port on the firewall. Vite sets x-forwarded-proto in HTTPS mode;
  // port 5174 is kept for anyone still running the old HTTPS dev port.
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  const secure =
    forwardedProto === "https" ||
    req.protocol === "https" ||
    req.secure === true ||
    port === 5174;
  const scheme = secure ? "https" : "http";
  // The Vite dev server proxies /api, but the native agent needs the API port.
  if (!port || port === 5173 || port === 5174) {
    if (secure) {
      const httpsPort = port === 0 ? 443 : port;
      if (httpsPort === 443) return `https://${hostname}`;
      return `https://${hostname}:${httpsPort}`;
    }
    return `http://${hostname}:${apiPort}`;
  }
  return `${scheme}://${hostHeader}`;
}
