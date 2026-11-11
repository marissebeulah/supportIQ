import { db } from "./db.js";
import { activityLabel, listTickets } from "./serialize.js";

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export function getOverview() {
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const counts = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('open', 'in_progress', 'waiting_customer') THEN 1 ELSE 0 END) AS open_tickets,
        SUM(CASE WHEN assignee_id IS NULL AND status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS unassigned,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed
       FROM tickets`,
    )
    .get();

  const lateRow = db
    .prepare(
      `SELECT COUNT(*) AS late FROM tickets
       WHERE (first_response_at IS NULL AND response_due_at < ?)
          OR (status IN ('open', 'in_progress') AND resolve_due_at < ?)`,
    )
    .get(nowIso, nowIso);

  const firstResponse = db
    .prepare(
      `SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 1440.0) AS avg_minutes,
        COUNT(*) AS count
       FROM tickets WHERE first_response_at IS NOT NULL AND created_at >= ?`,
    )
    .get(cutoff30);

  const resolution = db
    .prepare(
      `SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24.0) AS avg_hours,
        COUNT(*) AS count
       FROM tickets WHERE resolved_at IS NOT NULL AND resolved_at >= ?`,
    )
    .get(cutoff30);

  const csat = db
    .prepare(
      `SELECT AVG(rating) AS avg_rating, COUNT(*) AS count,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) AS positive
       FROM tickets WHERE rating IS NOT NULL AND rated_at >= ?`,
    )
    .get(cutoff30);

  const slaResponse = db
    .prepare(
      `SELECT SUM(CASE WHEN first_response_at <= response_due_at THEN 1 ELSE 0 END) AS met,
        COUNT(*) AS total
       FROM tickets WHERE first_response_at IS NOT NULL AND created_at >= ?`,
    )
    .get(cutoff30);

  const statusRows = db.prepare("SELECT status, COUNT(*) AS count FROM tickets GROUP BY status").all();
  const statusBreakdown = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count)]));

  const categoryRows = db
    .prepare(
      `SELECT category, COUNT(*) AS count FROM tickets
       WHERE created_at >= ? GROUP BY category ORDER BY count DESC`,
    )
    .all(cutoff30);

  const productRows = db
    .prepare(
      `SELECT t.product_id AS product_id, p.name AS product_name,
        COUNT(*) AS total,
        SUM(CASE WHEN t.status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN (t.first_response_at IS NULL AND t.response_due_at < ?)
          OR (t.status IN ('open', 'in_progress') AND t.resolve_due_at < ?) THEN 1 ELSE 0 END) AS late_count,
        AVG(t.rating) AS avg_csat
       FROM tickets t
       LEFT JOIN products p ON p.id = t.product_id
       GROUP BY t.product_id
       ORDER BY total DESC, product_name`,
    )
    .all(nowIso, nowIso);
  const products = productRows.map((row) => ({
    id: row.product_id ?? null,
    name: row.product_name ?? "No product selected",
    total: Number(row.total || 0),
    open: Number(row.open_count || 0),
    resolved: Number(row.resolved_count || 0),
    late: Number(row.late_count || 0),
    csatAvg: row.avg_csat == null ? null : Number(row.avg_csat),
  }));

  const csatRows = db
    .prepare("SELECT rating, COUNT(*) AS count FROM tickets WHERE rating IS NOT NULL GROUP BY rating")
    .all();
  const csatDistribution = Object.fromEntries(csatRows.map((row) => [row.rating, Number(row.count)]));

  const volumeRows = db
    .prepare("SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM tickets WHERE created_at >= ? GROUP BY day")
    .all(cutoff30);
  const resolvedRows = db
    .prepare(
      "SELECT substr(resolved_at, 1, 10) AS day, COUNT(*) AS count FROM tickets WHERE resolved_at >= ? GROUP BY day",
    )
    .all(cutoff30);
  const volumeMap = new Map(volumeRows.map((row) => [row.day, Number(row.count)]));
  const resolvedMap = new Map(resolvedRows.map((row) => [row.day, Number(row.count)]));
  const volume = [];
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - index);
    const key = dayKey(date);
    volume.push({
      date: key,
      created: volumeMap.get(key) ?? 0,
      resolved: resolvedMap.get(key) ?? 0,
    });
  }

  const agents = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.title,
        SUM(CASE WHEN t.status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS open_assigned,
        SUM(CASE WHEN t.resolved_at >= ? THEN 1 ELSE 0 END) AS resolved_30d,
        AVG(CASE WHEN t.first_response_at IS NOT NULL AND t.created_at >= ?
          THEN (julianday(t.first_response_at) - julianday(t.created_at)) * 1440.0 END) AS avg_first_response_minutes,
        AVG(CASE WHEN t.rating IS NOT NULL AND t.rated_at >= ? THEN t.rating END) AS avg_csat,
        SUM(CASE WHEN (t.first_response_at IS NULL AND t.response_due_at < ?)
          OR (t.status IN ('open', 'in_progress') AND t.resolve_due_at < ?) THEN 1 ELSE 0 END) AS late_assigned
       FROM users u
       LEFT JOIN tickets t ON t.assignee_id = u.id
       WHERE u.role = 'it' AND u.active = 1
       GROUP BY u.id
       ORDER BY open_assigned DESC, u.name`,
    )
    .all(cutoff30, cutoff30, cutoff30, nowIso, nowIso)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      title: row.title,
      openAssigned: Number(row.open_assigned || 0),
      resolved30d: Number(row.resolved_30d || 0),
      avgFirstResponseMinutes: row.avg_first_response_minutes == null ? null : Number(row.avg_first_response_minutes),
      avgCsat: row.avg_csat == null ? null : Number(row.avg_csat),
      lateAssigned: Number(row.late_assigned || 0),
    }));

  const lateTickets = listTickets({ id: 0, role: "admin" }, { late: "1", limit: 6 });

  const recentActivity = db
    .prepare(
      `SELECT a.*, u.name AS actor_name, t.ref, t.subject
       FROM activity a
       JOIN tickets t ON t.id = a.ticket_id
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 10`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      type: row.type,
      label: activityLabel(row),
      actorName: row.actor_name,
      ticket: { id: row.ticket_id, ref: row.ref, subject: row.subject },
      createdAt: row.created_at,
    }));

  const botStats = db
    .prepare(
      `SELECT COUNT(*) AS conversations,
        SUM(CASE WHEN escalated_ticket_id IS NOT NULL THEN 1 ELSE 0 END) AS escalated
       FROM bot_conversations WHERE created_at >= ?`,
    )
    .get(cutoff30);

  return {
    stats: {
      totalTickets: Number(counts.total || 0),
      openTickets: Number(counts.open_tickets || 0),
      unassigned: Number(counts.unassigned || 0),
      resolved: Number(counts.resolved || 0),
      closed: Number(counts.closed || 0),
      lateTickets: Number(lateRow.late || 0),
      avgFirstResponseMinutes: firstResponse.avg_minutes == null ? null : Number(firstResponse.avg_minutes),
      firstResponseSample: Number(firstResponse.count || 0),
      avgResolutionHours: resolution.avg_hours == null ? null : Number(resolution.avg_hours),
      resolutionSample: Number(resolution.count || 0),
      csatAvg: csat.avg_rating == null ? null : Number(csat.avg_rating),
      csatCount: Number(csat.count || 0),
      csatPositive: Number(csat.positive || 0),
      responseSlaPct:
        slaResponse.total > 0 ? Math.round((Number(slaResponse.met || 0) / Number(slaResponse.total)) * 100) : null,
      responseSlaTotal: Number(slaResponse.total || 0),
      botConversations: Number(botStats.conversations || 0),
      botEscalated: Number(botStats.escalated || 0),
    },
    volume,
    statusBreakdown,
    categories: categoryRows.map((row) => ({ category: row.category, count: Number(row.count) })),
    products,
    csatDistribution,
    agents,
    lateTickets,
    recentActivity,
  };
}

export function getTeamPerformance() {
  return getOverview().agents;
}

export function getAgentPerformance(agentId) {
  const agent = db.prepare("SELECT id, name, email, title, role FROM users WHERE id = ?").get(agentId);
  if (!agent) return null;

  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const counts = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('open', 'in_progress', 'waiting_customer') THEN 1 ELSE 0 END) AS open_tickets,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
        SUM(CASE WHEN status = 'waiting_customer' THEN 1 ELSE 0 END) AS waiting_customer_count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed
       FROM tickets
       WHERE assignee_id = ?`,
    )
    .get(agentId);

  const resolved30dRow = db
    .prepare(
      `SELECT COUNT(*) AS count FROM tickets
       WHERE assignee_id = ? AND status IN ('resolved', 'closed') AND resolved_at >= ?`,
    )
    .get(agentId, cutoff30);

  const lateRow = db
    .prepare(
      `SELECT COUNT(*) AS late FROM tickets
       WHERE assignee_id = ?
         AND ((first_response_at IS NULL AND response_due_at < ?)
           OR (status IN ('open', 'in_progress') AND resolve_due_at < ?))`,
    )
    .get(agentId, nowIso, nowIso);

  const firstResponse = db
    .prepare(
      `SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 1440.0) AS avg_minutes,
        COUNT(*) AS count
       FROM tickets WHERE assignee_id = ? AND first_response_at IS NOT NULL AND created_at >= ?`,
    )
    .get(agentId, cutoff30);

  const resolution = db
    .prepare(
      `SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24.0) AS avg_hours,
        COUNT(*) AS count
       FROM tickets WHERE assignee_id = ? AND resolved_at IS NOT NULL AND resolved_at >= ?`,
    )
    .get(agentId, cutoff30);

  const csat = db
    .prepare(
      `SELECT AVG(rating) AS avg_rating, COUNT(*) AS count,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) AS positive
       FROM tickets WHERE assignee_id = ? AND rating IS NOT NULL AND rated_at >= ?`,
    )
    .get(agentId, cutoff30);

  const slaResponse = db
    .prepare(
      `SELECT SUM(CASE WHEN first_response_at <= response_due_at THEN 1 ELSE 0 END) AS met,
        COUNT(*) AS total
       FROM tickets WHERE assignee_id = ? AND first_response_at IS NOT NULL AND created_at >= ?`,
    )
    .get(agentId, cutoff30);

  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS count FROM tickets WHERE assignee_id = ? GROUP BY status")
    .all(agentId);
  const statusBreakdown = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count)]));

  const categoryRows = db
    .prepare(
      `SELECT category, COUNT(*) AS count FROM tickets
       WHERE assignee_id = ? AND created_at >= ? GROUP BY category ORDER BY count DESC`,
    )
    .all(agentId, cutoff30);

  const csatRows = db
    .prepare("SELECT rating, COUNT(*) AS count FROM tickets WHERE assignee_id = ? AND rating IS NOT NULL GROUP BY rating")
    .all(agentId);
  const csatDistribution = Object.fromEntries(csatRows.map((row) => [row.rating, Number(row.count)]));

  const productRows = db
    .prepare(
      `SELECT t.product_id AS product_id, p.name AS product_name,
        COUNT(*) AS total,
        SUM(CASE WHEN t.status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN (t.first_response_at IS NULL AND t.response_due_at < ?)
          OR (t.status IN ('open', 'in_progress') AND t.resolve_due_at < ?) THEN 1 ELSE 0 END) AS late_count,
        AVG(t.rating) AS avg_csat
       FROM tickets t
       LEFT JOIN products p ON p.id = t.product_id
       WHERE t.assignee_id = ?
       GROUP BY t.product_id
       ORDER BY total DESC, product_name`,
    )
    .all(nowIso, nowIso, agentId);
  const products = productRows.map((row) => ({
    id: row.product_id ?? null,
    name: row.product_name ?? "No product selected",
    total: Number(row.total || 0),
    open: Number(row.open_count || 0),
    resolved: Number(row.resolved_count || 0),
    late: Number(row.late_count || 0),
    csatAvg: row.avg_csat == null ? null : Number(row.avg_csat),
  }));

  const volumeRows = db
    .prepare(
      "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM tickets WHERE assignee_id = ? AND created_at >= ? GROUP BY day",
    )
    .all(agentId, cutoff30);
  const resolvedRows = db
    .prepare(
      "SELECT substr(resolved_at, 1, 10) AS day, COUNT(*) AS count FROM tickets WHERE assignee_id = ? AND resolved_at >= ? GROUP BY day",
    )
    .all(agentId, cutoff30);
  const volumeMap = new Map(volumeRows.map((row) => [row.day, Number(row.count)]));
  const resolvedMap = new Map(resolvedRows.map((row) => [row.day, Number(row.count)]));
  const volume = [];
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - index);
    const key = dayKey(date);
    volume.push({
      date: key,
      created: volumeMap.get(key) ?? 0,
      resolved: resolvedMap.get(key) ?? 0,
    });
  }

  const feedback = db
    .prepare(
      `SELECT t.id, t.ref, t.subject, t.rating, t.rating_comment, t.rated_at, u.name AS customer_name
       FROM tickets t
       JOIN users u ON u.id = t.customer_id
       WHERE t.assignee_id = ? AND t.rating IS NOT NULL
       ORDER BY t.rated_at DESC, t.id DESC
       LIMIT 10`,
    )
    .all(agentId)
    .map((row) => ({
      ticketId: row.id,
      ref: row.ref,
      subject: row.subject,
      rating: Number(row.rating),
      comment: row.rating_comment,
      ratedAt: row.rated_at,
      customerName: row.customer_name,
    }));

  const lateTickets = listTickets({ id: agentId, role: "it" }, { late: "1", assignee: String(agentId), limit: 6 });

  const recentActivity = db
    .prepare(
      `SELECT a.*, u.name AS actor_name, t.ref, t.subject
       FROM activity a
       JOIN tickets t ON t.id = a.ticket_id
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.actor_id = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 10`,
    )
    .all(agentId)
    .map((row) => ({
      id: row.id,
      type: row.type,
      label: activityLabel(row),
      actorName: row.actor_name,
      ticket: { id: row.ticket_id, ref: row.ref, subject: row.subject },
      createdAt: row.created_at,
    }));

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      title: agent.title,
      role: agent.role,
    },
    stats: {
      totalAssigned: Number(counts.total || 0),
      openAssigned: Number(counts.open_tickets || 0),
      openCount: Number(counts.open_count || 0),
      inProgressCount: Number(counts.in_progress_count || 0),
      waitingCustomerCount: Number(counts.waiting_customer_count || 0),
      resolved30d: Number(resolved30dRow.count || 0),
      resolvedAllTime: Number(counts.resolved || 0) + Number(counts.closed || 0),
      lateAssigned: Number(lateRow.late || 0),
      avgFirstResponseMinutes: firstResponse.avg_minutes == null ? null : Number(firstResponse.avg_minutes),
      firstResponseSample: Number(firstResponse.count || 0),
      avgResolutionHours: resolution.avg_hours == null ? null : Number(resolution.avg_hours),
      resolutionSample: Number(resolution.count || 0),
      csatAvg: csat.avg_rating == null ? null : Number(csat.avg_rating),
      csatCount: Number(csat.count || 0),
      csatPositive: Number(csat.positive || 0),
      responseSlaPct:
        slaResponse.total > 0 ? Math.round((Number(slaResponse.met || 0) / Number(slaResponse.total)) * 100) : null,
      responseSlaTotal: Number(slaResponse.total || 0),
    },
    volume,
    statusBreakdown,
    categories: categoryRows.map((row) => ({ category: row.category, count: Number(row.count) })),
    products,
    csatDistribution,
    feedback,
    lateTickets,
    recentActivity,
  };
}
