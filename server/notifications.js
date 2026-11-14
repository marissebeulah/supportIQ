import { db, nowIso } from "./db.js";
import { publish } from "./realtime.js";

/**
 * Stores a notification for one user and pushes it over their realtime stream.
 * Notifications are also kept in the database so a technician who was offline
 * still finds the request when they next open the portal.
 */
export function createNotification({
  userId,
  type,
  title,
  body = null,
  ticketId = null,
  requestId = null,
}) {
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO notifications (user_id, type, title, body, ticket_id, request_id, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(userId, type, title, body, ticketId, requestId, now);

  publish(
    "notification:new",
    { notificationId: Number(info.lastInsertRowid), notificationType: type, title, body, ticketId, requestId },
    (user) => user.id === userId,
  );

  return Number(info.lastInsertRowid);
}

export function listNotifications(userId, limit = 30) {
  const rows = db
    .prepare(
      `SELECT n.*, t.ref AS ticket_ref, t.subject AS ticket_subject,
        r.status AS request_status, r.note AS request_note,
        u.name AS requester_name
       FROM notifications n
       LEFT JOIN tickets t ON t.id = n.ticket_id
       LEFT JOIN co_helper_requests r ON r.id = n.request_id
       LEFT JOIN users u ON u.id = r.requester_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ?`,
    )
    .all(userId, Math.min(100, Math.max(1, Number(limit) || 30)));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    ticketId: row.ticket_id,
    ticketRef: row.ticket_ref ?? null,
    ticketSubject: row.ticket_subject ?? null,
    requestId: row.request_id,
    requestStatus: row.request_status ?? null,
    requestNote: row.request_note ?? null,
    requesterName: row.requester_name ?? null,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export function unreadNotificationCount(userId) {
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .get(userId);
  return Number(row?.total || 0);
}

export function markNotificationRead(userId, notificationId) {
  const info = db
    .prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL")
    .run(nowIso(), notificationId, userId);
  return info.changes > 0;
}

export function markAllNotificationsRead(userId) {
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(
    nowIso(),
    userId,
  );
}

/** Marks the notification that points at a co-helper request as read. */
export function readRequestNotification(userId, requestId) {
  db.prepare(
    "UPDATE notifications SET read_at = ? WHERE user_id = ? AND request_id = ? AND read_at IS NULL",
  ).run(nowIso(), userId, requestId);
}
