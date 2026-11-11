import crypto from "node:crypto";
import express from "express";
import { requireAuth, requireRole } from "../auth.js";
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  addHours,
  db,
  getSetting,
  getSla,
  nowIso,
} from "../db.js";
import { formatHours, renderTemplate } from "../format.js";
import { canAccessTicket, getTicketDetail, listTickets } from "../serialize.js";
import { publish, ticketAudience } from "../realtime.js";
import { firstMatchingCondition } from "../routing.js";
import { inferProduct } from "../products.js";
import { inspectMessage } from "../moderation.js";
import {
  dismissTicketFollowUps,
  scheduleClosedSurvey,
  scheduleSolvedCheck,
  scheduleWaitingCustomerReminder,
} from "../follow-ups.js";

const router = express.Router();

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function cleanText(value, max = 5000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function parseId(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function assigneeForCondition(condition) {
  if (!condition || !["route_to_it", "handoff"].includes(condition.action_type)) return null;
  const requestedId = parseId(condition.action_value);
  if (requestedId) {
    const requested = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'it' AND active = 1").get(requestedId);
    if (requested) return requested;
  }
  return db
    .prepare(
      `SELECT u.id, u.name, COUNT(CASE WHEN t.status NOT IN ('resolved', 'closed') THEN 1 END) AS active_load
       FROM users u
       LEFT JOIN tickets t ON t.assignee_id = u.id
       WHERE u.role = 'it' AND u.active = 1
       GROUP BY u.id
       ORDER BY active_load, u.id
       LIMIT 1`,
    )
    .get() ?? null;
}

function attachmentIds(value) {
  if (!Array.isArray(value)) return [];
  const unique = [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  return unique.slice(0, 5);
}

function linkAttachments(ids, uploaderId, ticketId, messageId) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id FROM attachments
       WHERE ticket_id IS NULL AND uploader_id = ? AND id IN (${placeholders})`,
    )
    .all(uploaderId, ...ids);
  if (rows.length !== ids.length) {
    const error = new Error("One or more attachments couldn't be added. Please upload them again.");
    error.status = 400;
    throw error;
  }
  db.prepare(`UPDATE attachments SET ticket_id = ?, message_id = ? WHERE id IN (${placeholders})`).run(
    ticketId,
    messageId,
    ...ids,
  );
}

function transaction(work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }
    throw error;
  }
}

function notifyTicket(ticketId, type = "ticket:updated") {
  const ticket = db
    .prepare("SELECT id, customer_id, assignee_id FROM tickets WHERE id = ?")
    .get(ticketId);
  if (!ticket) return;
  publish(type, { ticketId }, ticketAudience({ customerId: ticket.customer_id, assigneeId: ticket.assignee_id }));
}

function notifyAdminsHelpRequest(ticketId, agentName, reason) {
  const ticket = db.prepare("SELECT id, ref, subject FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) return;
  publish(
    "ticket:admin-help",
    {
      ticketId: ticket.id,
      ref: ticket.ref,
      subject: ticket.subject,
      agentName,
      reason,
    },
    (user) => user.role === "admin",
  );
}

function notifyStaffDecision(ticketId, decision, reason = null) {
  const ticket = db
    .prepare(
      `SELECT t.id, t.ref, t.subject, c.name AS customer_name
       FROM tickets t JOIN users c ON c.id = t.customer_id
       WHERE t.id = ?`,
    )
    .get(ticketId);
  if (!ticket) return;
  publish(
    "ticket:approval",
    {
      ticketId: ticket.id,
      decision,
      ref: ticket.ref,
      subject: ticket.subject,
      customerName: ticket.customer_name,
      reason,
    },
    (user) => user.role === "admin" || user.role === "it",
  );
}

function loadTicket(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    fail(res, 404, "Request not found.");
    return null;
  }
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!ticket) {
    fail(res, 404, "Request not found.");
    return null;
  }
  if (!canAccessTicket(ticket, req.user)) {
    fail(res, 403, "You don't have access to this request.");
    return null;
  }
  return ticket;
}

function respondWithTicket(res, ticketId, status = 200) {
  const detail = getTicketDetail(ticketId, res.req.user);
  if (!detail) return res.status(404).json({ error: "Request not found." });
  if (detail.forbidden) return res.status(403).json({ error: "You don't have access to this request." });
  return res.status(status).json(detail);
}

function addStatusActivity(ticketId, actorId, from, to) {
  db.prepare(
    "INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, created_at) VALUES (?, ?, 'status', ?, ?, ?)",
  ).run(ticketId, actorId, from, to, nowIso());
}

router.use(requireAuth);

router.get("/tickets", (req, res) => {
  const tickets = listTickets(req.user, {
    scope: req.query.scope,
    status: req.query.status,
    priority: req.query.priority,
    productId: req.query.productId,
    assignee: req.query.assignee,
    q: req.query.q,
    late: req.query.late,
    limit: req.query.limit,
  });
  res.json({ tickets });
});

router.get("/ticket-products", requireRole("it", "admin"), (_req, res) => {
  const products = db.prepare("SELECT id, name FROM products WHERE enabled = 1 ORDER BY name").all();
  res.json({ products });
});

router.post("/tickets", requireRole("customer", "admin"), (req, res) => {
  const subject = cleanText(req.body?.subject, 160);
  const description = cleanText(req.body?.description, 5000);
  if (subject.length < 4) return fail(res, 400, "Add a subject with at least 4 characters.");
  if (description.length < 3) return fail(res, 400, "Describe the issue so IT can help.");

  const createdByAdmin = req.user.role === "admin";
  const customerId = createdByAdmin ? parseId(req.body?.customerId) : req.user.id;
  if (!customerId) return fail(res, 400, "Choose the customer this request is for.");
  const customer = createdByAdmin
    ? db.prepare("SELECT id, name, company FROM users WHERE id = ? AND role = 'customer' AND active = 1").get(customerId)
    : req.user;
  if (!customer) return fail(res, 404, "That customer account isn't available.");

  const category = CATEGORIES.includes(req.body?.category) ? req.body.category : "Other";
  const priority = PRIORITIES.includes(req.body?.priority) ? req.body.priority : "normal";
  const ids = attachmentIds(req.body?.attachmentIds);
  const botConversationId = parseId(req.body?.botConversationId);

  let conversation = null;
  if (botConversationId) {
    conversation = db
      .prepare("SELECT * FROM bot_conversations WHERE id = ? AND customer_id = ?")
      .get(botConversationId, req.user.id);
    if (!conversation) return fail(res, 400, "That assistant conversation wasn't found.");
    if (conversation.escalated_ticket_id) {
      return fail(res, 409, "A request has already been created from that conversation.");
    }
  }

  const productProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, "productId");
  const rawProductId = req.body?.productId;
  const explicitNone =
    rawProductId === null || rawProductId === undefined || rawProductId === "" || rawProductId === "none";
  const requestedProductId = explicitNone ? null : parseId(rawProductId);
  if (!explicitNone && !requestedProductId) {
    return fail(res, 400, "Choose a valid product.");
  }
  // An explicit "not sure / not listed" clears the product instead of falling
  // back to whatever the assistant conversation had detected.
  const productId = productProvided ? requestedProductId : conversation?.product_id ?? null;
  let product = productId ? db.prepare("SELECT id, name, enabled FROM products WHERE id = ?").get(productId) : null;
  if (productId && (!product || (requestedProductId && !product.enabled))) {
    return fail(res, 404, "That product isn't available.");
  }

  const routingProducts = db.prepare("SELECT id, name FROM products WHERE enabled = 1").all();
  let effectiveProductId = productId;
  let effectiveProduct = product;
  if (!effectiveProductId) {
    const inferred = inferProduct(`${subject} ${description}`, routingProducts);
    if (inferred) {
      effectiveProductId = inferred.id;
      effectiveProduct = inferred;
    }
  }

  const routingCondition = firstMatchingCondition(
    db.prepare("SELECT * FROM bot_conditions WHERE enabled = 1 ORDER BY priority DESC, id").all(),
    { text: `${effectiveProduct?.name ?? ""} ${subject} ${description}`, category, priority, products: routingProducts },
  );
  const autoAssignee = assigneeForCondition(routingCondition);

  const sla = getSla()[priority];
  const createdAt = nowIso();
  const responseDueAt = addHours(createdAt, sla.response_hours);
  const resolveDueAt = addHours(createdAt, sla.resolve_hours);

  try {
    const result = transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO tickets (
            ref, customer_id, assignee_id, subject, description, category, priority, status, channel, product_id,
            bot_conversation_id, created_at, updated_at, response_due_at, resolve_due_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `TMP-${crypto.randomUUID()}`,
          customerId,
          autoAssignee?.id ?? null,
          subject,
          description,
          category,
          priority,
          conversation ? "assistant" : "portal",
          effectiveProductId,
          conversation?.id ?? null,
          createdAt,
          createdAt,
          responseDueAt,
          resolveDueAt,
        );
      const ticketId = Number(info.lastInsertRowid);
      const ref = `SIQ-${1000 + ticketId}`;
      db.prepare("UPDATE tickets SET ref = ? WHERE id = ?").run(ref, ticketId);

      const messageInfo = db
        .prepare(
          `INSERT INTO messages (ticket_id, sender_id, sender_role, body, is_internal, created_at)
           VALUES (?, ?, ?, ?, 0, ?)`,
        )
        .run(ticketId, req.user.id, createdByAdmin ? "admin" : "customer", description, createdAt);
      linkAttachments(ids, req.user.id, ticketId, Number(messageInfo.lastInsertRowid));

      const acknowledgement = renderTemplate(getSetting("auto_ack"), {
        first_name: String(customer.name).split(" ")[0],
        ticket_ref: ref,
        response_target: formatHours(sla.response_hours),
      });
      db.prepare(
        `INSERT INTO messages (ticket_id, sender_id, sender_role, body, is_internal, created_at)
         VALUES (?, NULL, 'bot', ?, 0, ?)`,
      ).run(ticketId, acknowledgement, new Date(Date.now() + 1000).toISOString());

      // Auto-tagging based on product/category/issue type
      try {
        const text = `${subject} ${description}`.toLowerCase();
        const inferredProduct = effectiveProduct ?? routingProducts.find((entry) => text.includes(entry.name.toLowerCase()));
        if (inferredProduct) {
          let productTag = db.prepare("SELECT id FROM tags WHERE name = ?").get(inferredProduct.name);
          if (!productTag) {
            const info = db.prepare("INSERT INTO tags (name, type, created_at) VALUES (?, 'product', ?)")
              .run(inferredProduct.name, nowIso());
            productTag = { id: Number(info.lastInsertRowid) };
          }
          db.prepare("INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)").run(ticketId, productTag.id);
          db.prepare("INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)").run(customerId, productTag.id);
        }
        // Tag by category
        let catTag = db.prepare("SELECT id FROM tags WHERE name = ?").get(category);
        if (!catTag) {
          const tinfo = db.prepare("INSERT INTO tags (name, type, created_at) VALUES (?, 'issue', ?)").run(category, nowIso());
          catTag = { id: Number(tinfo.lastInsertRowid) };
        }
        db.prepare("INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)").run(ticketId, catTag.id);
        if (customer.company) {
          let clientTag = db.prepare("SELECT id FROM tags WHERE name = ?").get(customer.company);
          if (!clientTag) {
            const info = db.prepare("INSERT INTO tags (name, type, created_at) VALUES (?, 'client', ?)")
              .run(customer.company, nowIso());
            clientTag = { id: Number(info.lastInsertRowid) };
          }
          db.prepare("INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)").run(ticketId, clientTag.id);
          db.prepare("INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)").run(customerId, clientTag.id);
        }

        if (routingCondition?.action_type === "tag") {
          const tagName = cleanText(routingCondition.action_value, 80);
          if (tagName) {
            let conditionTag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName);
            if (!conditionTag) {
              const info = db.prepare("INSERT INTO tags (name, type, created_at) VALUES (?, 'general', ?)")
                .run(tagName, nowIso());
              conditionTag = { id: Number(info.lastInsertRowid) };
            }
            db.prepare("INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)").run(ticketId, conditionTag.id);
            db.prepare("INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)").run(customerId, conditionTag.id);
          }
        }
      } catch (e) {
        // ignore tagging errors
      }

      db.prepare(
        "INSERT INTO activity (ticket_id, actor_id, type, to_value, created_at) VALUES (?, ?, 'created', 'open', ?)",
      ).run(ticketId, req.user.id, createdAt);
      if (effectiveProduct) {
        db.prepare(
          `INSERT INTO activity (ticket_id, actor_id, type, to_value, created_at)
           VALUES (?, ?, 'product', ?, ?)`,
        ).run(ticketId, req.user.id, effectiveProduct.name, createdAt);
      }
      if (autoAssignee) {
        db.prepare(
          `INSERT INTO activity (ticket_id, actor_id, type, to_value, created_at)
           VALUES (?, ?, 'assigned', ?, ?)`,
        ).run(ticketId, req.user.id, autoAssignee.name, createdAt);
      }

      if (conversation) {
        const transcriptMessages = db
          .prepare("SELECT role, body FROM bot_messages WHERE conversation_id = ? ORDER BY created_at, id")
          .all(conversation.id);
        const transcript = [
          "Assistant conversation — captured when this request was created",
          ...transcriptMessages.map(
            (message) =>
              `${message.role === "customer" ? "Customer" : "SupportIQ Assistant"}: ${message.body}`,
          ),
        ]
          .join("\n\n")
          .slice(0, 8000);
        db.prepare(
          `INSERT INTO messages (ticket_id, sender_id, sender_role, body, is_internal, created_at)
           VALUES (?, NULL, 'system', ?, 1, ?)`,
        ).run(ticketId, transcript, new Date(Date.now() + 2000).toISOString());
        db.prepare(
          "INSERT INTO activity (ticket_id, actor_id, type, created_at) VALUES (?, ?, 'assistant', ?)",
        ).run(ticketId, req.user.id, createdAt);
        db.prepare("UPDATE bot_conversations SET escalated_ticket_id = ?, updated_at = ? WHERE id = ?").run(
          ticketId,
          createdAt,
          conversation.id,
        );
      }

      db.prepare(
        `INSERT OR REPLACE INTO ticket_reads (user_id, ticket_id, last_read_at) VALUES (?, ?, ?)`,
      ).run(req.user.id, ticketId, createdAt);

      return ticketId;
    });

    notifyTicket(result, "ticket:created");
    return respondWithTicket(res, result, 201);
  } catch (error) {
    return fail(res, error.status || 500, error.message || "Could not create the request.");
  }
});

router.get("/tickets/:id", (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;
  return respondWithTicket(res, ticket.id);
});

router.post("/tickets/:id/messages", (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;

  const body = cleanText(req.body?.body, 6000);
  const ids = attachmentIds(req.body?.attachmentIds);
  const isInternal = Boolean(req.body?.isInternal) && req.user.role !== "customer";

  if (!body && ids.length === 0) {
    return fail(res, 400, "Write a message or add an attachment.");
  }
  if (isInternal && !body) {
    return fail(res, 400, "Internal notes need some text.");
  }

  const now = nowIso();
  const moderation = inspectMessage(body);
  try {
    const messageId = transaction(() => {
      const firstAdminMessage =
        req.user.role === "admin" &&
        !isInternal &&
        !db
          .prepare(
            "SELECT 1 FROM messages WHERE ticket_id = ? AND sender_role = 'admin' AND is_internal = 0 LIMIT 1",
          )
          .get(ticket.id);
      const info = db
        .prepare(
          `INSERT INTO messages (ticket_id, sender_id, sender_role, body, is_internal, is_flagged, flag_reason, flag_details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ticket.id,
          req.user.id,
          req.user.role,
          body,
          isInternal ? 1 : 0,
          moderation.isFlagged ? 1 : 0,
          moderation.reasonText,
          moderation.isFlagged ? JSON.stringify(moderation.details) : null,
          now,
        );
      const newMessageId = Number(info.lastInsertRowid);
      linkAttachments(ids, req.user.id, ticket.id, newMessageId);

      if (moderation.isFlagged) {
        db.prepare(
          `INSERT INTO activity (ticket_id, actor_id, type, to_value, note, created_at)
           VALUES (?, ?, 'flagged_message', ?, ?, ?)`,
        ).run(ticket.id, req.user.id, moderation.reasons.join(", "), moderation.summary, now);
      }

      const updates = ["updated_at = ?"];
      const params = [now];
      let newStatus = ticket.status;
      let firstResponseAt = ticket.first_response_at;

      if (!isInternal && ["it", "admin"].includes(req.user.role) && !firstResponseAt) {
        firstResponseAt = now;
        updates.push("first_response_at = ?");
        params.push(now);
      }

      const resolvesAdminHelp = req.user.role === "admin" && Boolean(ticket.admin_help_requested_at);
      if (resolvesAdminHelp) {
        updates.push("admin_help_requested_at = NULL", "admin_help_reason = NULL");
      }

      if (req.user.role === "customer" && ["resolved", "closed"].includes(ticket.status)) {
        newStatus = "open";
        updates.push("status = ?", "resolved_at = NULL", "closed_at = NULL", "reopened_count = reopened_count + 1");
        params.push(newStatus);
        updates.push("rating = NULL", "rating_comment = NULL", "rated_at = NULL", "approved_at = NULL");
        const sla = getSla()[ticket.priority];
        const resolveDueAt = addHours(now, sla.resolve_hours);
        updates.push("resolve_due_at = ?");
        params.push(resolveDueAt);
        if (!firstResponseAt) {
          const responseDueAt = addHours(now, sla.response_hours);
          updates.push("response_due_at = ?");
          params.push(responseDueAt);
        }
        db.prepare(
          `INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, note, created_at)
           VALUES (?, ?, 'reopened', ?, 'open', ?, ?)`,
        ).run(
          ticket.id,
          req.user.id,
          ticket.status,
          ticket.rating ? `Previous rating was ${ticket.rating}/5` : null,
          now,
        );
      } else if (
        req.user.role === "customer" &&
        ticket.status === "waiting_customer"
      ) {
        newStatus = "in_progress";
        updates.push("status = ?");
        params.push(newStatus);
      } else if (
        !isInternal &&
        ["it", "admin"].includes(req.user.role) &&
        ["open", "waiting_customer"].includes(ticket.status)
      ) {
        newStatus = "in_progress";
        updates.push("status = ?");
        params.push(newStatus);
      }

      if (newStatus !== ticket.status) {
        addStatusActivity(ticket.id, req.user.id, ticket.status, newStatus);
      }

      db.prepare(`UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`).run(...params, ticket.id);

      if (firstAdminMessage) {
        db.prepare(
          `INSERT INTO activity (ticket_id, actor_id, type, note, created_at)
           VALUES (?, ?, 'admin_joined', ?, ?)`,
        ).run(ticket.id, req.user.id, "Admin joined the conversation", now);
      }

      return newMessageId;
    });

    if (req.user.role === "customer") dismissTicketFollowUps(ticket.id);
    notifyTicket(ticket.id);
    const detail = getTicketDetail(ticket.id, req.user);
    return res.status(201).json({ ...detail, messageId });
  } catch (error) {
    return fail(res, error.status || 500, error.message || "Could not send the message.");
  }
});

router.post("/tickets/:id/messages/:messageId/dismiss-flag", requireRole("it", "admin"), (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;

  const messageId = parseId(req.params.messageId);
  if (!messageId) return fail(res, 400, "Invalid message ID.");

  const msg = db.prepare("SELECT * FROM messages WHERE id = ? AND ticket_id = ?").get(messageId, ticket.id);
  if (!msg) return fail(res, 404, "Message not found.");

  const now = nowIso();
  transaction(() => {
    db.prepare("UPDATE messages SET is_flagged = 0 WHERE id = ?").run(messageId);
    db.prepare(
      "INSERT INTO activity (ticket_id, actor_id, type, note, created_at) VALUES (?, ?, 'dismissed_flag', 'Message flag reviewed and dismissed', ?)",
    ).run(ticket.id, req.user.id, now);
  });

  notifyTicket(ticket.id);
  const detail = getTicketDetail(ticket.id, req.user);
  return res.json(detail);
});

router.patch("/tickets/:id/status", requireRole("it", "admin"), (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;

  const status = String(req.body?.status ?? "");
  if (!STATUSES.includes(status)) return fail(res, 400, "Choose a valid status.");
  const summary = cleanText(req.body?.resolutionSummary, 2000);
  if (status === "resolved" && summary.length < 3 && !ticket.resolution_summary) {
    return fail(res, 400, "Add a short resolution summary before resolving.");
  }

  const now = nowIso();
  const updates = ["status = ?", "updated_at = ?"];
  const params = [status, now];

  if (status === "resolved") {
    updates.push(
      "resolved_at = ?",
      "closed_at = NULL",
      "approved_at = NULL",
      "rejected_at = NULL",
      "rejection_reason = NULL",
      "admin_help_requested_at = NULL",
      "admin_help_reason = NULL",
    );
    params.push(now);
    if (summary) {
      updates.push("resolution_summary = ?");
      params.push(summary);
    }
  } else if (status === "closed") {
    updates.push("closed_at = ?", "admin_help_requested_at = NULL", "admin_help_reason = NULL");
    params.push(now);
    if (!ticket.resolved_at) {
      updates.push("resolved_at = ?");
      params.push(now);
    }
    if (summary) {
      updates.push("resolution_summary = ?");
      params.push(summary);
    }
  } else {
    updates.push("closed_at = NULL");
    if (["resolved", "closed"].includes(ticket.status)) {
      updates.push("resolved_at = NULL", "reopened_count = reopened_count + 1");
      updates.push(
        "rating = NULL",
        "rating_comment = NULL",
        "rated_at = NULL",
        "approved_at = NULL",
        "rejected_at = NULL",
        "rejection_reason = NULL",
      );
      const sla = getSla()[ticket.priority];
      updates.push("resolve_due_at = ?");
      params.push(addHours(now, sla.resolve_hours));
    }
  }

  transaction(() => {
    db.prepare(`UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`).run(...params, ticket.id);
    addStatusActivity(ticket.id, req.user.id, ticket.status, status);
    if (["resolved", "closed"].includes(ticket.status) && !["resolved", "closed"].includes(status)) {
      db.prepare(
        `INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, created_at)
         VALUES (?, ?, 'reopened', ?, ?, ?)`,
      ).run(ticket.id, req.user.id, ticket.status, status, now);
    }
  });

  if (status !== ticket.status) {
    dismissTicketFollowUps(ticket.id);
    if (status === "waiting_customer") scheduleWaitingCustomerReminder(ticket.id, now);
    if (status === "resolved") scheduleSolvedCheck(ticket.id, now);
    if (status === "closed") scheduleClosedSurvey(ticket.id, now);
  }

  notifyTicket(ticket.id);
  return respondWithTicket(res, ticket.id);
});

router.patch("/tickets/:id/assign", requireRole("admin"), (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;

  const raw = req.body?.assigneeId;
  const assigneeId = raw === null || raw === undefined || raw === "" ? null : parseId(raw);
  if (raw !== null && raw !== undefined && raw !== "" && !assigneeId) {
    return fail(res, 400, "Choose a valid support agent.");
  }

  let agent = null;
  if (assigneeId) {
    agent = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'it' AND active = 1").get(assigneeId);
    if (!agent) return fail(res, 400, "That agent is not available.");
  }

  const now = nowIso();
  transaction(() => {
    db.prepare("UPDATE tickets SET assignee_id = ?, updated_at = ? WHERE id = ?").run(assigneeId, now, ticket.id);
    db.prepare(
      `INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, created_at)
       VALUES (?, ?, 'assigned', ?, ?, ?)`,
    ).run(
      ticket.id,
      req.user.id,
      ticket.assignee_id ? String(ticket.assignee_id) : null,
      agent ? agent.name : null,
      now,
    );
  });

  notifyTicket(ticket.id);
  return respondWithTicket(res, ticket.id);
});

router.post("/tickets/:id/request-admin", requireRole("it"), (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;
  if (["resolved", "closed"].includes(ticket.status)) {
    return fail(res, 409, "Admin help can only be requested while this request is active.");
  }
  if (ticket.admin_help_requested_at) {
    return fail(res, 409, "Admin help has already been requested for this request.");
  }

  const reason = cleanText(req.body?.reason, 1000);
  if (reason.length < 3) return fail(res, 400, "Briefly explain what you need help with.");

  const now = nowIso();
  transaction(() => {
    db.prepare(
      "UPDATE tickets SET admin_help_requested_at = ?, admin_help_reason = ?, updated_at = ? WHERE id = ?",
    ).run(now, reason, now, ticket.id);
    db.prepare(
      `INSERT INTO activity (ticket_id, actor_id, type, note, created_at)
       VALUES (?, ?, 'admin_help', ?, ?)`,
    ).run(ticket.id, req.user.id, reason, now);
  });

  notifyTicket(ticket.id);
  notifyAdminsHelpRequest(ticket.id, req.user.name, reason);
  return respondWithTicket(res, ticket.id);
});

router.patch("/tickets/:id/product", (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;

  const raw = req.body?.productId;
  const clearing = raw === null || raw === undefined || raw === "" || raw === "none";
  const productId = clearing ? null : parseId(raw);
  if (!clearing && !productId) return fail(res, 400, "Choose a valid product.");

  let product = null;
  if (productId) {
    product = db.prepare("SELECT id, name, enabled FROM products WHERE id = ?").get(productId);
    if (!product) return fail(res, 404, "That product isn't available.");
    if (!product.enabled && productId !== ticket.product_id) {
      return fail(res, 400, "That product is no longer available.");
    }
  }

  if ((ticket.product_id ?? null) === productId) return respondWithTicket(res, ticket.id);

  const previous = ticket.product_id
    ? db.prepare("SELECT name FROM products WHERE id = ?").get(ticket.product_id)
    : null;
  const now = nowIso();

  transaction(() => {
    db.prepare("UPDATE tickets SET product_id = ?, updated_at = ? WHERE id = ?").run(productId, now, ticket.id);
    db.prepare(
      `INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, created_at)
       VALUES (?, ?, 'product', ?, ?, ?)`,
    ).run(ticket.id, req.user.id, previous?.name ?? null, product?.name ?? null, now);
  });

  notifyTicket(ticket.id);
  return respondWithTicket(res, ticket.id);
});

router.patch("/tickets/:id/priority", requireRole("it", "admin"), (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;

  const priority = String(req.body?.priority ?? "");
  if (!PRIORITIES.includes(priority)) return fail(res, 400, "Choose a valid priority.");
  if (priority === ticket.priority) return respondWithTicket(res, ticket.id);

  const sla = getSla()[priority];
  const responseDueAt = addHours(ticket.created_at, sla.response_hours);
  const resolveDueAt = addHours(ticket.created_at, sla.resolve_hours);
  const now = nowIso();

  transaction(() => {
    db.prepare(
      `UPDATE tickets SET priority = ?, response_due_at = ?, resolve_due_at = ?, updated_at = ? WHERE id = ?`,
    ).run(priority, responseDueAt, resolveDueAt, now, ticket.id);
    db.prepare(
      `INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, created_at)
       VALUES (?, ?, 'priority', ?, ?, ?)`,
    ).run(ticket.id, req.user.id, ticket.priority, priority, now);
  });

  notifyTicket(ticket.id);
  return respondWithTicket(res, ticket.id);
});

router.post("/tickets/:id/rating", requireRole("customer"), (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;
  if (ticket.customer_id !== req.user.id) return fail(res, 403, "Only the requester can rate this request.");
  if (!["resolved", "closed"].includes(ticket.status)) {
    return fail(res, 409, "You can rate the service once the request is resolved.");
  }
  if (ticket.rating != null) return fail(res, 409, "This request has already been rated.");

  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return fail(res, 400, "Choose a rating from 1 to 5.");
  }
  const comment = cleanText(req.body?.comment, 1000);
  const now = nowIso();

  transaction(() => {
    db.prepare(
      "UPDATE tickets SET rating = ?, rating_comment = ?, rated_at = ?, updated_at = ? WHERE id = ?",
    ).run(rating, comment || null, now, now, ticket.id);
    db.prepare(
      `INSERT INTO activity (ticket_id, actor_id, type, to_value, note, created_at)
       VALUES (?, ?, 'rated', ?, ?, ?)`,
    ).run(ticket.id, req.user.id, String(rating), comment || null, now);
  });

  dismissTicketFollowUps(ticket.id);
  notifyTicket(ticket.id);
  return respondWithTicket(res, ticket.id);
});

router.post("/tickets/:id/approve", requireRole("customer"), (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;
  if (ticket.customer_id !== req.user.id) {
    return fail(res, 403, "Only the requester can approve this resolution.");
  }
  if (ticket.approved_at) {
    return fail(res, 409, "This resolution has already been approved.");
  }
  if (ticket.status !== "resolved") {
    return fail(res, 409, "This request isn't awaiting your approval yet.");
  }

  const now = nowIso();
  transaction(() => {
    db.prepare(
      "UPDATE tickets SET status = 'closed', approved_at = ?, closed_at = ?, updated_at = ? WHERE id = ?",
    ).run(now, now, now, ticket.id);
    db.prepare(
      `INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, created_at)
       VALUES (?, ?, 'approved', 'resolved', 'closed', ?)`,
    ).run(ticket.id, req.user.id, now);
  });

  dismissTicketFollowUps(ticket.id);
  scheduleClosedSurvey(ticket.id, now);
  notifyTicket(ticket.id);
  notifyStaffDecision(ticket.id, "approved");
  return respondWithTicket(res, ticket.id);
});

router.post("/tickets/:id/reject", requireRole("customer"), (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;
  if (ticket.customer_id !== req.user.id) {
    return fail(res, 403, "Only the requester can reject this resolution.");
  }
  if (ticket.approved_at) {
    return fail(res, 409, "This resolution has already been approved.");
  }
  if (ticket.status !== "resolved") {
    return fail(res, 409, "This request isn't awaiting your approval yet.");
  }

  const reason = cleanText(req.body?.reason, 2000);
  if (reason.length < 3) return fail(res, 400, "Tell IT what still needs fixing.");

  const now = nowIso();
  const nextStatus = ticket.assignee_id ? "in_progress" : "open";
  const resolveDueAt = addHours(now, getSla()[ticket.priority].resolve_hours);

  transaction(() => {
    db.prepare(
      `UPDATE tickets
       SET status = ?, resolved_at = NULL, closed_at = NULL, approved_at = NULL,
           rejected_at = ?, rejection_reason = ?, rating = NULL, rating_comment = NULL, rated_at = NULL,
           reopened_count = reopened_count + 1, resolve_due_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(nextStatus, now, reason, resolveDueAt, now, ticket.id);
    db.prepare(
      `INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, note, created_at)
       VALUES (?, ?, 'rejected', 'resolved', ?, ?, ?)`,
    ).run(ticket.id, req.user.id, nextStatus, reason, now);
  });

  dismissTicketFollowUps(ticket.id);
  notifyTicket(ticket.id);
  notifyStaffDecision(ticket.id, "rejected", reason);
  return respondWithTicket(res, ticket.id);
});

router.post("/tickets/:id/read", (req, res) => {
  const ticket = loadTicket(req, res);
  if (!ticket) return;
  db.prepare(
    `INSERT INTO ticket_reads (user_id, ticket_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, ticket_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
  ).run(req.user.id, ticket.id, nowIso());
  res.status(204).end();
});

router.get("/canned-replies", requireRole("it", "admin"), (_req, res) => {
  const replies = db.prepare("SELECT id, title, body FROM canned_replies ORDER BY title").all();
  res.json({ replies });
});

export default router;
