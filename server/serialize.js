import { db } from "./db.js";
import { statusLabel } from "./format.js";

export function isTicketLate(ticket, now = new Date()) {
  const nowMs = now.getTime();
  if (!ticket.first_response_at && nowMs > new Date(ticket.response_due_at).getTime()) {
    return { late: true, reason: "first_response" };
  }
  if (
    ["open", "in_progress"].includes(ticket.status) &&
    nowMs > new Date(ticket.resolve_due_at).getTime()
  ) {
    return { late: true, reason: "resolution" };
  }
  return { late: false, reason: null };
}

export function summarizeTicket(row, viewer) {
  const late = isTicketLate(row);
  return {
    id: row.id,
    ref: row.ref,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    channel: row.channel,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    firstResponseAt: row.first_response_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    approvedAt: row.approved_at ?? null,
    rejectedAt: row.rejected_at ?? null,
    rejectionReason: row.rejection_reason ?? null,
    adminHelpRequestedAt: row.admin_help_requested_at ?? null,
    adminHelpReason: row.admin_help_reason ?? null,
    responseDueAt: row.response_due_at,
    resolveDueAt: row.resolve_due_at,
    rating: row.rating,
    reopenedCount: row.reopened_count,
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      company: row.customer_company ?? null,
    },
    product: row.product_id
      ? { id: row.product_id, name: row.product_name ?? null }
      : null,
    assignee: row.assignee_id
      ? { id: row.assignee_id, name: row.assignee_name }
      : null,
    coAssignee: row.co_assignee_id
      ? { id: row.co_assignee_id, name: row.co_assignee_name }
      : null,
    lastMessage: row.last_message_at
      ? {
          body: row.last_body ?? "",
          senderRole: row.last_sender_role,
          createdAt: row.last_message_at,
        }
      : null,
    unreadCount: Number(row.unread_count ?? 0),
    isLate: late.late,
    lateReason: late.reason,
    isFlagged: Number(row.flagged_count || 0) > 0,
    flaggedCount: Number(row.flagged_count || 0),
    viewerRole: viewer.role,
  };
}

function buildTicketQuery(viewer, filters = {}) {
  const where = [];
  const params = [];

  const internalClause = viewer.role === "customer" ? "m.is_internal = 0" : "1 = 1";

  if (viewer.role === "customer") {
    where.push("t.customer_id = ?");
    params.push(viewer.id);
  } else {
    if (viewer.role === "it") {
      where.push("(t.assignee_id = ? OR t.co_assignee_id = ?)");
      params.push(viewer.id, viewer.id);
    }
    const scope = filters.scope || "all";
    if (scope === "mine") {
      where.push("(t.assignee_id = ? OR t.co_assignee_id = ?)");
      params.push(viewer.id, viewer.id);
    } else if (scope === "unassigned") {
      where.push("t.assignee_id IS NULL");
      where.push("t.status NOT IN ('resolved', 'closed')");
    } else if (scope === "open") {
      where.push("t.status NOT IN ('resolved', 'closed')");
    } else if (scope === "resolved") {
      where.push("t.status IN ('resolved', 'closed')");
    }
  }

  if (filters.status) {
    const statuses = String(filters.status)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => ["open", "in_progress", "waiting_customer", "resolved", "closed"].includes(value));
    if (statuses.length) {
      where.push(`t.status IN (${statuses.map(() => "?").join(", ")})`);
      params.push(...statuses);
    }
  }

  if (filters.priority && ["low", "normal", "high", "urgent"].includes(filters.priority)) {
    where.push("t.priority = ?");
    params.push(filters.priority);
  }

  if (String(filters.productId ?? "") === "none") {
    where.push("t.product_id IS NULL");
  } else if (/^\d+$/.test(String(filters.productId ?? ""))) {
    where.push("t.product_id = ?");
    params.push(Number(filters.productId));
  }

  if (filters.assignee && viewer.role === "admin") {
    if (filters.assignee === "unassigned") {
      where.push("t.assignee_id IS NULL");
    } else if (filters.assignee === "me") {
      where.push("t.assignee_id = ?");
      params.push(viewer.id);
    } else if (/^\d+$/.test(String(filters.assignee))) {
      where.push("t.assignee_id = ?");
      params.push(Number(filters.assignee));
    }
  }

  if (filters.q) {
    const term = `%${String(filters.q).trim().slice(0, 100)}%`;
    where.push("(t.subject LIKE ? OR t.ref LIKE ? OR c.name LIKE ? OR c.company LIKE ?)");
    params.push(term, term, term, term);
  }

  if (filters.late === "1" || filters.late === "true") {
    const now = new Date().toISOString();
    where.push(
      "((t.first_response_at IS NULL AND t.response_due_at < ?) OR (t.status IN ('open', 'in_progress') AND t.resolve_due_at < ?))",
    );
    params.push(now, now);
  }

  if (filters.flagged === "1" || filters.flagged === "true") {
    where.push("(SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id AND m.is_flagged = 1) > 0");
  }

  const limit = String(filters.limit).toLowerCase() === "all"
    ? null
    : Math.min(1000, Math.max(1, Number(filters.limit) || 100));

  const sql = `
    SELECT t.*,
      c.name AS customer_name, c.company AS customer_company,
      p.name AS product_name,
      a.name AS assignee_name,
      ca.name AS co_assignee_name,
      (SELECT m.body FROM messages m WHERE m.ticket_id = t.id AND ${internalClause}
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_body,
      (SELECT m.sender_role FROM messages m WHERE m.ticket_id = t.id AND ${internalClause}
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_sender_role,
      (SELECT m.created_at FROM messages m WHERE m.ticket_id = t.id AND ${internalClause}
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id AND ${internalClause}
        AND m.created_at > COALESCE(tr.last_read_at, '')
        AND (m.sender_id IS NULL OR m.sender_id <> ?)) AS unread_count,
      (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id AND m.is_flagged = 1) AS flagged_count
    FROM tickets t
    JOIN users c ON c.id = t.customer_id
    LEFT JOIN products p ON p.id = t.product_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users ca ON ca.id = t.co_assignee_id
    LEFT JOIN ticket_reads tr ON tr.ticket_id = t.id AND tr.user_id = ?
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY t.updated_at DESC
    ${limit === null ? "" : "LIMIT ?"}
  `;

  return { sql, params: [viewer.id, viewer.id, ...params, ...(limit === null ? [] : [limit])] };
}

export function listTickets(viewer, filters = {}) {
  const { sql, params } = buildTicketQuery(viewer, filters);
  return db.prepare(sql).all(...params).map((row) => summarizeTicket(row, viewer));
}

export function canAccessTicket(ticket, viewer) {
  if (!ticket) return false;
  if (viewer.role === "admin") return true;
  if (viewer.role === "it") {
    if (ticket.assignee_id === viewer.id) return true;
    // The second technician on the ticket keeps the same access.
    if (ticket.co_assignee_id === viewer.id) return true;
    // A technician invited to help can open the ticket to accept or decline.
    const invited = db
      .prepare(
        "SELECT 1 FROM co_helper_requests WHERE ticket_id = ? AND status = 'pending' AND target_id = ? LIMIT 1",
      )
      .get(ticket.id, viewer.id);
    if (invited) return true;
    // A co-helper on a live remote session also keeps access to that ticket.
    const helping = db
      .prepare(
        "SELECT 1 FROM remote_sessions WHERE ticket_id = ? AND dual_technician_id = ? AND status IN ('requested', 'ready', 'active') LIMIT 1",
      )
      .get(ticket.id, viewer.id);
    return Boolean(helping);
  }
  return viewer.role === "customer" && ticket.customer_id === viewer.id;
}

const activityTypesForCustomer = new Set([
  "created",
  "status",
  "assigned",
  "rated",
  "approved",
  "rejected",
  "admin_joined",
  "reopened",
  "assistant",
  "product",
  "flagged_message",
  "dismissed_flag",
]);

export function getTicketDetail(ticketId, viewer) {
  const row = db
    .prepare(
      `SELECT t.*, c.name AS customer_name, c.company AS customer_company, c.email AS customer_email,
        a.name AS assignee_name, a.title AS assignee_title,
        ca.name AS co_assignee_name, ca.title AS co_assignee_title, ca.email AS co_assignee_email,
        p.name AS product_name,
        (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id AND m.is_flagged = 1) AS flagged_count
       FROM tickets t
       JOIN users c ON c.id = t.customer_id
       LEFT JOIN products p ON p.id = t.product_id
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN users ca ON ca.id = t.co_assignee_id
       WHERE t.id = ?`,
    )
    .get(ticketId);

  if (!row) return null;
  if (!canAccessTicket(row, viewer)) return { forbidden: true };

  const summary = summarizeTicket({ ...row, unread_count: 0 }, viewer);

  const messageRows = db
    .prepare(
      `SELECT m.*, u.name AS sender_name, u.role AS sender_user_role
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = ? ${viewer.role === "customer" ? "AND m.is_internal = 0" : ""}
       ORDER BY m.created_at ASC, m.id ASC`,
    )
    .all(ticketId);

  const attachmentRows = db
    .prepare("SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at ASC")
    .all(ticketId);
  const attachmentsByMessage = new Map();
  const unlinked = [];
  for (const attachment of attachmentRows) {
    const serialized = {
      id: attachment.id,
      filename: attachment.filename,
      mime: attachment.mime,
      size: attachment.size,
      createdAt: attachment.created_at,
      url: `/api/attachments/${attachment.id}`,
    };
    if (attachment.message_id == null) {
      unlinked.push(serialized);
      continue;
    }
    if (!attachmentsByMessage.has(attachment.message_id)) {
      attachmentsByMessage.set(attachment.message_id, []);
    }
    attachmentsByMessage.get(attachment.message_id).push(serialized);
  }

  const messages = messageRows.map((message) => {
    let flagDetails = null;
    if (message.flag_details) {
      try {
        flagDetails = JSON.parse(message.flag_details);
      } catch {}
    }
    return {
      id: message.id,
      body: message.body,
      isInternal: Boolean(message.is_internal),
      isFlagged: Boolean(message.is_flagged),
      flagReason: message.flag_reason || null,
      flagDetails,
      createdAt: message.created_at,
      senderRole: message.sender_role,
      sender: message.sender_id
        ? {
            id: message.sender_id,
            name: message.sender_name,
            role: message.sender_user_role,
          }
        : null,
      attachments: attachmentsByMessage.get(message.id) ?? [],
    };
  });

  const activityRows = db
    .prepare(
      `SELECT act.*, u.name AS actor_name
       FROM activity act
       LEFT JOIN users u ON u.id = act.actor_id
       WHERE act.ticket_id = ?
       ORDER BY act.created_at ASC, act.id ASC`,
    )
    .all(ticketId);

  const activity = activityRows
    .filter((event) => viewer.role !== "customer" || activityTypesForCustomer.has(event.type))
    .map((event) => ({
      id: event.id,
      type: event.type,
      from: event.from_value,
      to: event.to_value,
      note: event.note,
      actorName: event.actor_name,
      createdAt: event.created_at,
      label: activityLabel(event),
    }));

  const customerContext =
    viewer.role === "customer"
      ? null
      : db
          .prepare(
            `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS open_count
             FROM tickets WHERE customer_id = ?`,
          )
          .get(row.customer_id);

  const agents =
    viewer.role === "admin" || viewer.role === "it"
      ? db
          .prepare("SELECT id, name, email, title FROM users WHERE role = 'it' AND active = 1 ORDER BY name")
          .all()
      : [];

  const cannedReplies =
    viewer.role === "customer"
      ? []
      : db.prepare("SELECT id, title, body FROM canned_replies ORDER BY title").all();

  const products = db.prepare("SELECT id, name FROM products WHERE enabled = 1 ORDER BY name").all();
  if (row.product_id && !products.some((product) => product.id === row.product_id)) {
    const currentProduct = db.prepare("SELECT id, name FROM products WHERE id = ?").get(row.product_id);
    if (currentProduct) products.push(currentProduct);
  }

  const canRate =
    viewer.role === "customer" &&
    ["resolved", "closed"].includes(row.status) &&
    row.rating == null;

  return {
    ticket: {
      ...summary,
      description: row.description,
      resolutionSummary: row.resolution_summary,
      ratingComment: row.rating_comment,
      ratedAt: row.rated_at,
      customer: {
        id: row.customer_id,
        name: row.customer_name,
        email: row.customer_email,
        company: row.customer_company,
      },
      assignee: row.assignee_id
        ? { id: row.assignee_id, name: row.assignee_name, title: row.assignee_title }
        : null,
      coAssignee: row.co_assignee_id
        ? {
            id: row.co_assignee_id,
            name: row.co_assignee_name,
            title: row.co_assignee_title,
            email: row.co_assignee_email,
          }
        : null,
      coHelperRequest:
        viewer.role === "customer" ? null : serializeCoHelperRequest(ticketId, viewer),
      messages,
      activity,
      attachments: unlinked,
      customerContext: customerContext
        ? {
            total: Number(customerContext.total || 0),
            open: Number(customerContext.open_count || 0),
          }
        : null,
      permissions: {
        canReply: true,
        canSetInternal: viewer.role !== "customer",
        canChangeStatus: viewer.role !== "customer",
        canAssign: viewer.role === "admin",
        canReassign: viewer.role === "admin",
        canRate,
        canApprove:
          viewer.role === "customer" && row.status === "resolved" && row.approved_at == null,
        canReject:
          viewer.role === "customer" && row.status === "resolved" && row.approved_at == null,
        canRequestAdminHelp:
          viewer.role === "it" &&
          row.assignee_id === viewer.id &&
          row.admin_help_requested_at == null &&
          !["resolved", "closed"].includes(row.status),
        canRequestCoHelper:
          viewer.role === "it" &&
          row.assignee_id === viewer.id &&
          row.co_assignee_id == null &&
          !["resolved", "closed"].includes(row.status) &&
          !hasPendingCoHelperRequest(ticketId),
        canAssignCoHelper:
          viewer.role === "admin" && !["resolved", "closed"].includes(row.status),
        canRemoveCoHelper:
          (viewer.role === "admin" || row.assignee_id === viewer.id) &&
          row.co_assignee_id != null,
        canChangeProduct: viewer.role !== "customer" || row.status !== "closed",
      },
    },
    agents,
    cannedReplies,
    products,
  };
}

function hasPendingCoHelperRequest(ticketId) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM co_helper_requests WHERE ticket_id = ? AND status = 'pending' LIMIT 1")
      .get(ticketId),
  );
}

/**
 * The pending co-helper request a viewer cares about: either one they sent, or
 * one they can accept. Broadcast requests (no target) are visible to the
 * assigned technician so they can cancel their own ask.
 */
function serializeCoHelperRequest(ticketId, viewer) {
  const row = db
    .prepare(
      `SELECT r.*, u.name AS requester_name, t.name AS target_name
       FROM co_helper_requests r
       JOIN users u ON u.id = r.requester_id
       LEFT JOIN users t ON t.id = r.target_id
       WHERE r.ticket_id = ? AND r.status = 'pending'
         AND (r.requester_id = ? OR r.target_id IS NULL OR r.target_id = ?)
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 1`,
    )
    .get(ticketId, viewer.id, viewer.id);

  if (!row) return null;

  return {
    id: row.id,
    requester: { id: row.requester_id, name: row.requester_name },
    target: row.target_id ? { id: row.target_id, name: row.target_name } : null,
    note: row.note,
    createdAt: row.created_at,
    canRespond:
      viewer.role === "it" &&
      row.requester_id !== viewer.id &&
      (row.target_id == null || row.target_id === viewer.id),
    canCancel: row.requester_id === viewer.id || viewer.role === "admin",
  };
}

export function activityLabel(event) {
  const from = event.from_value ? statusLabel(event.from_value) : null;
  const to = event.to_value ? statusLabel(event.to_value) : null;
  switch (event.type) {
    case "created":
      return "Request created";
    case "status":
      return from && to ? `Status changed from ${from} to ${to}` : `Status updated to ${to ?? "a new stage"}`;
    case "assigned":
      return event.to_value ? `Assigned to ${event.to_value}` : "Assignment cleared";
    case "co_helper":
      if (event.from_value && event.to_value) {
        return `Co-helper changed from ${event.from_value} to ${event.to_value}`;
      }
      return event.to_value ? `${event.to_value} joined as co-helper` : "Co-helper removed";
    case "co_helper_request":
      return event.to_value ? `Asked ${event.to_value} to help as co-helper` : "Asked the IT team for a co-helper";
    case "priority":
      return `Priority set to ${event.to_value ?? "normal"}`;
    case "product":
      if (event.to_value) {
        return event.from_value
          ? `Product changed from ${event.from_value} to ${event.to_value}`
          : `Product set to ${event.to_value}`;
      }
      return "Product cleared";
    case "rated":
      return `Customer rated the service ${event.to_value}/5`;
    case "approved":
      return "Customer approved the resolution";
    case "rejected": {
      const reason = event.note ? String(event.note).trim() : "";
      const short = reason.length > 180 ? `${reason.slice(0, 177)}…` : reason;
      return short ? `Customer rejected the resolution — “${short}”` : "Customer rejected the resolution";
    }
    case "admin_help": {
      const reason = event.note ? String(event.note).trim() : "";
      const short = reason.length > 180 ? `${reason.slice(0, 177)}…` : reason;
      return short ? `IT support requested admin help — “${short}”` : "IT support requested admin help";
    }
    case "admin_joined":
      return "Admin joined the conversation";
    case "reopened":
      return "Request reopened";
    case "assistant":
      return "Created from a support assistant conversation";
    case "resolved":
      return "Request resolved";
    case "flagged_message":
      return `Message flagged: ${event.to_value ?? "off-platform contact attempt"}`;
    case "dismissed_flag":
      return "Message flag reviewed and dismissed";
    default:
      return event.note || "Request updated";
  }
}
