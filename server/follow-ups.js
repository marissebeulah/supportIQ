import { addHours, db, nowIso } from "./db.js";
import { publish, ticketAudience } from "./realtime.js";

const FOLLOW_UP_MESSAGES = {
  reminder: "We're waiting for your response. Reply here when you can, and IT will continue helping with this request.",
  solved_check: "Was your problem solved? If it still needs attention, reply here and IT can reopen the conversation. You can also confirm the resolution and rate the service.",
  survey: "How was your support experience? You can leave a rating on this request.",
};

export function queueTicketFollowUp(ticketId, type, scheduledAt) {
  const now = nowIso();
  db.prepare(
    `UPDATE follow_ups SET status = 'dismissed', completed_at = ?
     WHERE ticket_id = ? AND type = ? AND status = 'pending'`,
  ).run(now, ticketId, type);
  db.prepare(
    `INSERT INTO follow_ups (ticket_id, type, status, scheduled_at)
     VALUES (?, ?, 'pending', ?)`,
  ).run(ticketId, type, scheduledAt);
}

export function dismissTicketFollowUps(ticketId) {
  db.prepare(
    `UPDATE follow_ups SET status = 'dismissed', completed_at = ?
     WHERE ticket_id = ? AND status = 'pending'`,
  ).run(nowIso(), ticketId);
}

export function processDueFollowUps(now = nowIso()) {
  const due = db
    .prepare(
      `SELECT f.id, f.ticket_id, f.type, t.status AS ticket_status, t.rating,
        t.customer_id, t.assignee_id
       FROM follow_ups f
       JOIN tickets t ON t.id = f.ticket_id
       WHERE f.status = 'pending' AND f.scheduled_at <= ?
       ORDER BY f.scheduled_at, f.id
       LIMIT 100`,
    )
    .all(now);
  let sentCount = 0;

  for (const followUp of due) {
    const expectedStatus =
      followUp.type === "reminder" ? "waiting_customer" :
        followUp.type === "solved_check" ? "resolved" : "closed";
    if (followUp.ticket_status !== expectedStatus || (followUp.type === "survey" && followUp.rating != null)) {
      db.prepare("UPDATE follow_ups SET status = 'dismissed', completed_at = ? WHERE id = ? AND status = 'pending'")
        .run(now, followUp.id);
      continue;
    }

    const sentAt = nowIso();
    db.exec("BEGIN IMMEDIATE");
    try {
      const updated = db.prepare(
        "UPDATE follow_ups SET status = 'sent', sent_at = ?, completed_at = ? WHERE id = ? AND status = 'pending'",
      ).run(sentAt, sentAt, followUp.id);
      if (updated.changes) {
        db.prepare(
          `INSERT INTO messages (ticket_id, sender_id, sender_role, body, is_internal, created_at)
           VALUES (?, NULL, 'bot', ?, 0, ?)`,
        ).run(followUp.ticket_id, FOLLOW_UP_MESSAGES[followUp.type], sentAt);
        db.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").run(sentAt, followUp.ticket_id);
      }
      db.exec("COMMIT");
      if (updated.changes) {
        publish(
          "ticket:updated",
          { ticketId: followUp.ticket_id },
          ticketAudience({ customerId: followUp.customer_id, assigneeId: followUp.assignee_id }),
        );
        sentCount += 1;
      }
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return sentCount;
}

export function scheduleWaitingCustomerReminder(ticketId, baseTime = nowIso()) {
  queueTicketFollowUp(ticketId, "reminder", addHours(baseTime, 24));
}

export function scheduleSolvedCheck(ticketId, baseTime = nowIso()) {
  queueTicketFollowUp(ticketId, "solved_check", addHours(baseTime, 24));
}

export function scheduleClosedSurvey(ticketId, baseTime = nowIso()) {
  queueTicketFollowUp(ticketId, "survey", baseTime);
}