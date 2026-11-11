import express from "express";
import { hashPassword, requireRole } from "../auth.js";
import { PRIORITIES, db, getSettings, getSla, nowIso } from "../db.js";
import { getOverview } from "../metrics.js";

const router = express.Router();

router.use(requireRole("admin"));

function automationPayload() {
  const settings = getSettings();
  return {
    settings: {
      bot_enabled: settings.bot_enabled === "1",
      bot_greeting: settings.bot_greeting,
      bot_fallback: settings.bot_fallback,
      bot_escalation: settings.bot_escalation,
      bot_guardrail: settings.bot_guardrail,
      auto_ack: settings.auto_ack,
      auto_ack_alt: settings.auto_ack_alt,
      bot_welcome_buttons: (() => {
        try {
          return JSON.parse(settings.bot_welcome_buttons || "[]");
        } catch {
          return ["Login problem", "Report a bug", "Billing", "How to use", "Talk to IT Support"];
        }
      })(),
      bot_guided_questions_enabled: settings.bot_guided_questions_enabled !== "0",
      support_schedule_message: settings.support_schedule_message || "",
    },
    sla: getSla(),
    kb: db.prepare("SELECT * FROM kb_entries ORDER BY category, question").all().map(kbRow),
    cannedReplies: db
      .prepare("SELECT id, title, body, created_at AS createdAt, updated_at AS updatedAt FROM canned_replies ORDER BY title")
      .all(),
    products: db.prepare("SELECT id, name, enabled FROM products ORDER BY name").all().map((p) => ({ ...p, enabled: Boolean(p.enabled) })),
    tags: db.prepare("SELECT id, name, type FROM tags ORDER BY type, name").all(),
    botButtons: db.prepare("SELECT id, label, action, sort_order, enabled FROM bot_buttons ORDER BY sort_order, id").all().map((b) => ({ ...b, enabled: Boolean(b.enabled) })),
    botConditions: db.prepare("SELECT * FROM bot_conditions ORDER BY priority DESC, id").all().map((c) => ({ ...c, enabled: Boolean(c.enabled) })),
    supportSchedule: (() => {
      const row = db.prepare("SELECT * FROM support_schedule WHERE id = 1").get();
      if (!row) return { enabled: false, schedule: {}, message: "" };
      try {
        return { enabled: Boolean(row.enabled), schedule: JSON.parse(row.schedule_json), message: row.message };
      } catch {
        return { enabled: Boolean(row.enabled), schedule: {}, message: row.message };
      }
    })(),
  };
}

function kbRow(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    keywords: row.keywords,
    category: row.category,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clean(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

router.get("/overview", (_req, res) => {
  res.json(getOverview());
});

router.get("/team", (_req, res) => {
  res.json({ agents: getOverview().agents });
});

function customerAccountRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    active: Boolean(row.active),
    createdAt: row.created_at,
    ticketCount: Number(row.ticket_count || 0),
    openCount: Number(row.open_count || 0),
    resolvedCount: Number(row.resolved_count || 0),
    conversationCount: Number(row.conversation_count || 0),
    lastActivityAt: row.last_activity_at,
  };
}

const customerAccountSelect = `
  SELECT u.id, u.name, u.email, u.company, u.active, u.created_at,
    (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = u.id) AS ticket_count,
    (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = u.id AND t.status NOT IN ('resolved', 'closed')) AS open_count,
    (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = u.id AND t.status IN ('resolved', 'closed')) AS resolved_count,
    (SELECT COUNT(*) FROM bot_conversations bc WHERE bc.customer_id = u.id) AS conversation_count,
    COALESCE((SELECT MAX(t.updated_at) FROM tickets t WHERE t.customer_id = u.id), u.created_at) AS last_activity_at
  FROM users u
`;

function customerEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.get("/customers", (req, res) => {
  const includeInactive = String(req.query.includeInactive ?? "") === "1";
  const customers = db
    .prepare(
      `${customerAccountSelect}
       WHERE u.role = 'customer' ${includeInactive ? "" : "AND u.active = 1"}
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all()
    .map(customerAccountRow);
  res.json({ customers });
});

router.get("/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid customer ID." });

  const row = db.prepare(`${customerAccountSelect} WHERE u.id = ? AND u.role = 'customer'`).get(id);
  if (!row) return res.status(404).json({ error: "Customer account not found." });

  const tickets = db
    .prepare(
      `SELECT id, ref, subject, status, priority, created_at, updated_at
       FROM tickets WHERE customer_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 10`,
    )
    .all(id)
    .map((ticket) => ({
      id: ticket.id,
      ref: ticket.ref,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    }));

  return res.json({ customer: { ...customerAccountRow(row), tickets } });
});

router.post("/customers", (req, res) => {
  const name = clean(req.body?.name, 80);
  const email = customerEmail(req.body?.email);
  const company = clean(req.body?.company, 120) || null;
  const password = String(req.body?.password ?? "");

  if (name.length < 2) return res.status(400).json({ error: "Enter a name with at least 2 characters." });
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Use an initial password between 8 and 128 characters." });
  }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, company, active, created_at)
         VALUES (?, ?, ?, 'customer', ?, 1, ?)`,
      )
      .run(name, email, hashPassword(password), company, nowIso());
    const row = db
      .prepare(`${customerAccountSelect} WHERE u.id = ?`)
      .get(Number(result.lastInsertRowid));
    return res.status(201).json({ customer: customerAccountRow(row) });
  } catch (error) {
    if (String(error?.code ?? "").includes("CONSTRAINT_UNIQUE")) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    throw error;
  }
});

router.patch("/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid customer ID." });

  const current = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'customer'").get(id);
  if (!current) return res.status(404).json({ error: "Customer account not found." });

  const updates = [];
  const params = [];
  let signOut = false;

  if (req.body?.name !== undefined) {
    const name = clean(req.body.name, 80);
    if (name.length < 2) return res.status(400).json({ error: "Enter a name with at least 2 characters." });
    updates.push("name = ?");
    params.push(name);
  }

  if (req.body?.email !== undefined) {
    const email = customerEmail(req.body.email);
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (db.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(email, id)) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    updates.push("email = ?");
    params.push(email);
  }

  if (req.body?.company !== undefined) {
    updates.push("company = ?");
    params.push(clean(req.body.company, 120) || null);
  }

  if (req.body?.active !== undefined) {
    const active = req.body.active ? 1 : 0;
    if (current.id === req.user.id && !active) {
      return res.status(400).json({ error: "You cannot deactivate your own account." });
    }
    updates.push("active = ?");
    params.push(active);
    if (!active) signOut = true;
  }

  if (req.body?.password !== undefined && String(req.body.password).length > 0) {
    const password = String(req.body.password);
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "Use a password between 8 and 128 characters." });
    }
    updates.push("password_hash = ?");
    params.push(hashPassword(password));
    signOut = true;
  }

  if (!updates.length) return res.status(400).json({ error: "Nothing to update." });

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params, id);
    if (signOut) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const row = db.prepare(`${customerAccountSelect} WHERE u.id = ?`).get(id);
  return res.json({ customer: customerAccountRow(row) });
});

router.post("/team", (req, res) => {
  const name = clean(req.body?.name, 80);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const title = clean(req.body?.title, 120) || null;
  const password = String(req.body?.password ?? "");

  if (name.length < 2) return res.status(400).json({ error: "Enter a name with at least 2 characters." });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid work email address." });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Use an initial password between 8 and 128 characters." });
  }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, title, active, created_at)
         VALUES (?, ?, ?, 'it', ?, 1, ?)`,
      )
      .run(name, email, hashPassword(password), title, nowIso());
    return res.status(201).json({
      agent: {
        id: Number(result.lastInsertRowid),
        name,
        email,
        role: "it",
        title,
      },
    });
  } catch (error) {
    if (String(error?.code ?? "").includes("CONSTRAINT_UNIQUE")) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    throw error;
  }
});

router.patch("/team/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid ID." });

  const member = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'it'").get(id);
  if (!member) return res.status(404).json({ error: "IT staff member not found." });

  const password = String(req.body?.password ?? "");
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Use a password between 8 and 128 characters." });
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return res.json({ ok: true });
});

// Pending password resets count
router.get("/password-resets", (_req, res) => {
  const pending = db.prepare("SELECT pr.id, pr.user_id, pr.created_at, u.name, u.email, u.role FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE pr.used_at IS NULL ORDER BY pr.created_at DESC").all();
  res.json({ pending });
});

// Mark resets as used for a user (called after admin manually resets their password)
router.delete("/password-resets/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  db.prepare("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(new Date().toISOString(), userId);
  res.json({ ok: true });
});

router.get("/conversations", (req, res) => {
  const where = [];
  const params = [];
  const productFilter = String(req.query.productId ?? "");
  if (productFilter === "none") {
    where.push("bc.product_id IS NULL");
  } else if (/^\d+$/.test(productFilter)) {
    where.push("bc.product_id = ?");
    params.push(Number(productFilter));
  }

  const conversations = db
    .prepare(
      `SELECT bc.*, u.name AS customer_name, u.company AS customer_company, u.email AS customer_email,
        p.name AS product_name,
        t.ref AS ticket_ref,
        (SELECT body FROM bot_messages WHERE conversation_id = bc.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_body,
        (SELECT role FROM bot_messages WHERE conversation_id = bc.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_role,
        (SELECT COUNT(*) FROM bot_messages WHERE conversation_id = bc.id) AS message_count,
        (SELECT COUNT(*) FROM bot_messages WHERE conversation_id = bc.id AND role = 'customer') AS customer_count
       FROM bot_conversations bc
       JOIN users u ON u.id = bc.customer_id
       LEFT JOIN products p ON p.id = bc.product_id
       LEFT JOIN tickets t ON t.id = bc.escalated_ticket_id
      ORDER BY bc.updated_at DESC`,
    )
    .all(...params)
    .map((row) => ({
      id: row.id,
      customer: { id: row.customer_id, name: row.customer_name, company: row.customer_company, email: row.customer_email },
      product: row.product_id ? { id: row.product_id, name: row.product_name } : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: Number(row.message_count || 0),
      customerMessageCount: Number(row.customer_count || 0),
      lastMessage: row.last_body ? { body: row.last_body, role: row.last_role } : null,
      escalatedTicketId: row.escalated_ticket_id,
      ticketRef: row.ticket_ref,
    }));
  const escalated = conversations.filter((conversation) => conversation.escalatedTicketId).length;
  res.json({ conversations, stats: { total: conversations.length, escalated, assisted: conversations.length - escalated } });
});

router.get("/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  const conversation = db
    .prepare(
      `SELECT bc.*, u.name AS customer_name, u.company AS customer_company, u.email AS customer_email,
        p.name AS product_name,
        t.ref AS ticket_ref
       FROM bot_conversations bc
       JOIN users u ON u.id = bc.customer_id
       LEFT JOIN products p ON p.id = bc.product_id
       LEFT JOIN tickets t ON t.id = bc.escalated_ticket_id
       WHERE bc.id = ?`,
    )
    .get(id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  const messages = db
    .prepare("SELECT id, role, body, created_at FROM bot_messages WHERE conversation_id = ? ORDER BY created_at, id")
    .all(id)
    .map((message) => ({
      id: message.id,
      role: message.role,
      body: message.body,
      createdAt: message.created_at,
    }));
  res.json({
    conversation: {
      id: conversation.id,
      customer: {
        id: conversation.customer_id,
        name: conversation.customer_name,
        company: conversation.customer_company,
        email: conversation.customer_email,
      },
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      product: conversation.product_id
        ? { id: conversation.product_id, name: conversation.product_name }
        : null,
      escalatedTicketId: conversation.escalated_ticket_id,
      ticketRef: conversation.ticket_ref,
    },
    messages,
  });
});

router.get("/settings", (_req, res) => {
  res.json(automationPayload());
});

router.put("/settings", (req, res) => {
  const body = req.body ?? {};
  const stringFields = {
    bot_greeting: 2000,
    bot_fallback: 2000,
    bot_escalation: 2000,
    bot_guardrail: 2000,
    auto_ack: 2000,
    auto_ack_alt: 2000,
    support_schedule_message: 1000,
  };

  const updates = [];
  if (typeof body.bot_enabled === "boolean") {
    updates.push(["bot_enabled", body.bot_enabled ? "1" : "0"]);
  }
  if (typeof body.bot_guided_questions_enabled === "boolean") {
    updates.push(["bot_guided_questions_enabled", body.bot_guided_questions_enabled ? "1" : "0"]);
  }
  for (const [key, max] of Object.entries(stringFields)) {
    if (body[key] !== undefined) {
      const value = clean(body[key], max);
      if (value.length < 5 && key !== "support_schedule_message") {
        return res.status(400).json({ error: "Automated messages need at least 5 characters." });
      }
      updates.push([key, value]);
    }
  }

  if (body.bot_welcome_buttons !== undefined) {
    if (Array.isArray(body.bot_welcome_buttons)) {
      updates.push(["bot_welcome_buttons", JSON.stringify(body.bot_welcome_buttons)]);
    }
  }

  if (body.sla !== undefined) {
    if (typeof body.sla !== "object" || body.sla === null) {
      return res.status(400).json({ error: "SLA targets are invalid." });
    }
    const normalized = {};
    for (const priority of PRIORITIES) {
      const entry = body.sla[priority];
      const response = Number(entry?.response_hours);
      const resolve = Number(entry?.resolve_hours);
      if (!Number.isFinite(response) || !Number.isFinite(resolve) || response < 0.25 || response > 720 || resolve < 0.25 || resolve > 2160) {
        return res.status(400).json({ error: "Each SLA target must be between 15 minutes and 90 days." });
      }
      if (resolve < response) {
        return res.status(400).json({ error: "Resolution targets must be at least as long as response targets." });
      }
      normalized[priority] = { response_hours: response, resolve_hours: resolve };
    }
    updates.push(["sla", JSON.stringify(normalized)]);
  }

  if (body.supportSchedule !== undefined) {
    const schedule = body.supportSchedule;
    try {
      db.prepare("INSERT INTO support_schedule (id, enabled, schedule_json, message) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, schedule_json = excluded.schedule_json, message = excluded.message")
        .run(
          schedule.enabled ? 1 : 0,
          JSON.stringify(schedule.schedule || {}),
          clean(body.support_schedule_message ?? schedule.message ?? getSettings().support_schedule_message, 1000),
        );
    } catch (e) {
      // ignore
    }
  }

  if (!updates.length && body.supportSchedule === undefined) return res.status(400).json({ error: "Nothing to update." });

  if (updates.length) {
    const statement = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [key, value] of updates) statement.run(key, value);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  res.json(automationPayload());
});

router.post("/kb", (req, res) => {
  const question = clean(req.body?.question, 200);
  const answer = clean(req.body?.answer, 4000);
  const keywords = clean(req.body?.keywords, 500);
  const category = clean(req.body?.category, 60) || "General";
  if (question.length < 4) return res.status(400).json({ error: "Add a clear question." });
  if (answer.length < 5) return res.status(400).json({ error: "Add an answer for the assistant to use." });
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO kb_entries (question, answer, keywords, category, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(question, answer, keywords, category, now, now);
  const row = db.prepare("SELECT * FROM kb_entries WHERE id = ?").get(Number(info.lastInsertRowid));
  res.status(201).json({ entry: kbRow(row) });
});

router.patch("/kb/:id", (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM kb_entries WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Knowledge entry not found." });
  const question = req.body?.question !== undefined ? clean(req.body.question, 200) : current.question;
  const answer = req.body?.answer !== undefined ? clean(req.body.answer, 4000) : current.answer;
  const keywords = req.body?.keywords !== undefined ? clean(req.body.keywords, 500) : current.keywords;
  const category = req.body?.category !== undefined ? clean(req.body.category, 60) || "General" : current.category;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : current.enabled;
  if (question.length < 4 || answer.length < 5) {
    return res.status(400).json({ error: "Question and answer can't be empty." });
  }
  db.prepare(
    `UPDATE kb_entries SET question = ?, answer = ?, keywords = ?, category = ?, enabled = ?, updated_at = ? WHERE id = ?`,
  ).run(question, answer, keywords, category, enabled, nowIso(), id);
  const row = db.prepare("SELECT * FROM kb_entries WHERE id = ?").get(id);
  res.json({ entry: kbRow(row) });
});

router.delete("/kb/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM kb_entries WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Knowledge entry not found." });
  res.status(204).end();
});

router.get("/canned-replies", (_req, res) => {
  res.json({
    replies: db
      .prepare("SELECT id, title, body, created_at AS createdAt, updated_at AS updatedAt FROM canned_replies ORDER BY title")
      .all(),
  });
});

router.post("/canned-replies", (req, res) => {
  const title = clean(req.body?.title, 120);
  const body = clean(req.body?.body, 3000);
  if (title.length < 3 || body.length < 5) {
    return res.status(400).json({ error: "Add a title and reply text." });
  }
  const now = nowIso();
  const info = db
    .prepare("INSERT INTO canned_replies (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(title, body, now, now);
  const reply = db
    .prepare("SELECT id, title, body, created_at AS createdAt, updated_at AS updatedAt FROM canned_replies WHERE id = ?")
    .get(Number(info.lastInsertRowid));
  res.status(201).json({ reply });
});

router.patch("/canned-replies/:id", (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM canned_replies WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Saved reply not found." });
  const title = req.body?.title !== undefined ? clean(req.body.title, 120) : current.title;
  const body = req.body?.body !== undefined ? clean(req.body.body, 3000) : current.body;
  if (title.length < 3 || body.length < 5) {
    return res.status(400).json({ error: "Add a title and reply text." });
  }
  db.prepare("UPDATE canned_replies SET title = ?, body = ?, updated_at = ? WHERE id = ?").run(
    title,
    body,
    nowIso(),
    id,
  );
  const reply = db
    .prepare("SELECT id, title, body, created_at AS createdAt, updated_at AS updatedAt FROM canned_replies WHERE id = ?")
    .get(id);
  res.json({ reply });
});

router.delete("/canned-replies/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM canned_replies WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Saved reply not found." });
  res.status(204).end();
});

// Products
router.get("/products", (_req, res) => {
  res.json({ products: db.prepare("SELECT id, name, enabled FROM products ORDER BY name").all().map((p) => ({ ...p, enabled: Boolean(p.enabled) })) });
});
router.post("/products", (req, res) => {
  const name = clean(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: "Enter a product name." });
  try {
    const info = db.prepare("INSERT INTO products (name, enabled, created_at) VALUES (?, 1, ?)").run(name, nowIso());
    res.status(201).json({ product: { id: Number(info.lastInsertRowid), name, enabled: true } });
  } catch (e) {
    return res.status(409).json({ error: "Product already exists." });
  }
});
router.patch("/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Product not found." });
  if (req.body?.name !== undefined) {
    const name = clean(req.body.name, 80);
    if (!name) return res.status(400).json({ error: "Enter a product name." });
    db.prepare("UPDATE products SET name = ? WHERE id = ?").run(name, id);
  }
  if (req.body?.enabled !== undefined) {
    db.prepare("UPDATE products SET enabled = ? WHERE id = ?").run(req.body.enabled ? 1 : 0, id);
  }
  const row = db.prepare("SELECT id, name, enabled FROM products WHERE id = ?").get(id);
  res.json({ product: { ...row, enabled: Boolean(row.enabled) } });
});
router.delete("/products/:id", (req, res) => {
  const info = db.prepare("DELETE FROM products WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Product not found." });
  res.status(204).end();
});

// Tags
router.get("/tags", (_req, res) => {
  res.json({ tags: db.prepare("SELECT id, name, type FROM tags ORDER BY type, name").all() });
});
router.post("/tags", (req, res) => {
  const name = clean(req.body?.name, 80);
  const type = clean(req.body?.type, 20) || "general";
  if (!name) return res.status(400).json({ error: "Enter a tag name." });
  if (!["product", "client", "issue", "general"].includes(type)) {
    return res.status(400).json({ error: "Choose a valid tag type." });
  }
  try {
    const info = db.prepare("INSERT INTO tags (name, type, created_at) VALUES (?, ?, ?)").run(name, type, nowIso());
    res.status(201).json({ tag: { id: Number(info.lastInsertRowid), name, type } });
  } catch (e) {
    return res.status(409).json({ error: "Tag already exists." });
  }
});
router.patch("/tags/:id", (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT id, name, type FROM tags WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Tag not found." });
  const name = req.body?.name !== undefined ? clean(req.body.name, 80) : current.name;
  const type = req.body?.type !== undefined ? clean(req.body.type, 20) : current.type;
  if (!name) return res.status(400).json({ error: "Enter a tag name." });
  if (!["product", "client", "issue", "general"].includes(type)) {
    return res.status(400).json({ error: "Choose a valid tag type." });
  }
  try {
    db.prepare("UPDATE tags SET name = ?, type = ? WHERE id = ?").run(name, type, id);
    if (name !== current.name) {
      db.prepare("UPDATE bot_conditions SET action_value = ? WHERE action_type = 'tag' AND action_value = ?")
        .run(name, current.name);
    }
  } catch {
    return res.status(409).json({ error: "Tag already exists." });
  }
  res.json({ tag: { id, name, type } });
});
router.delete("/tags/:id", (req, res) => {
  const info = db.prepare("DELETE FROM tags WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Tag not found." });
  res.status(204).end();
});

// Bot buttons
router.get("/bot-buttons", (_req, res) => {
  res.json({ buttons: db.prepare("SELECT id, label, action, sort_order, enabled FROM bot_buttons ORDER BY sort_order, id").all().map((b) => ({ ...b, enabled: Boolean(b.enabled) })) });
});
router.post("/bot-buttons", (req, res) => {
  const label = clean(req.body?.label, 80);
  const action = clean(req.body?.action, 80);
  const sort_order = Number(req.body?.sort_order) || 0;
  if (!label) return res.status(400).json({ error: "Enter a button label." });
  const info = db.prepare("INSERT INTO bot_buttons (label, action, sort_order, enabled) VALUES (?, ?, ?, 1)").run(label, action, sort_order);
  res.status(201).json({ button: { id: Number(info.lastInsertRowid), label, action, sort_order, enabled: true } });
});
router.patch("/bot-buttons/:id", (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM bot_buttons WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Button not found." });
  const label = req.body?.label !== undefined ? clean(req.body.label, 80) : current.label;
  const action = req.body?.action !== undefined ? clean(req.body.action, 80) : current.action;
  const sort_order = req.body?.sort_order !== undefined ? Number(req.body.sort_order) : current.sort_order;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : current.enabled;
  db.prepare("UPDATE bot_buttons SET label = ?, action = ?, sort_order = ?, enabled = ? WHERE id = ?").run(label, action, sort_order, enabled, id);
  const row = db.prepare("SELECT * FROM bot_buttons WHERE id = ?").get(id);
  res.json({ button: { ...row, enabled: Boolean(row.enabled) } });
});
router.delete("/bot-buttons/:id", (req, res) => {
  const info = db.prepare("DELETE FROM bot_buttons WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Button not found." });
  res.status(204).end();
});

// Bot conditions
router.get("/bot-conditions", (_req, res) => {
  res.json({ conditions: db.prepare("SELECT * FROM bot_conditions ORDER BY priority DESC, id").all().map((c) => ({ ...c, enabled: Boolean(c.enabled) })) });
});
router.post("/bot-conditions", (req, res) => {
  const name = clean(req.body?.name, 80);
  const trigger_type = clean(req.body?.trigger_type, 40);
  const trigger_value = clean(req.body?.trigger_value, 200);
  const action_type = clean(req.body?.action_type, 40);
  const action_value = clean(req.body?.action_value, 200);
  const priority = Number(req.body?.priority) || 0;
  if (!name) return res.status(400).json({ error: "Enter a condition name." });
  const info = db.prepare("INSERT INTO bot_conditions (name, trigger_type, trigger_value, action_type, action_value, priority, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)").run(name, trigger_type, trigger_value, action_type, action_value, priority);
  res.status(201).json({ condition: { id: Number(info.lastInsertRowid), name, trigger_type, trigger_value, action_type, action_value, priority, enabled: true } });
});
router.patch("/bot-conditions/:id", (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM bot_conditions WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Condition not found." });
  const updates = [];
  const values = [];
  for (const key of ["name", "trigger_type", "trigger_value", "action_type", "action_value"])
    if (req.body?.[key] !== undefined) { updates.push(`${key} = ?`); values.push(clean(req.body[key], key === "name" ? 80 : 200)); }
  if (req.body?.priority !== undefined) { updates.push("priority = ?"); values.push(Number(req.body.priority)); }
  if (req.body?.enabled !== undefined) { updates.push("enabled = ?"); values.push(req.body.enabled ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update." });
  values.push(id);
  db.prepare(`UPDATE bot_conditions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const row = db.prepare("SELECT * FROM bot_conditions WHERE id = ?").get(id);
  res.json({ condition: { ...row, enabled: Boolean(row.enabled) } });
});
router.delete("/bot-conditions/:id", (req, res) => {
  const info = db.prepare("DELETE FROM bot_conditions WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Condition not found." });
  res.status(204).end();
});

// Support schedule
router.get("/support-schedule", (_req, res) => {
  const row = db.prepare("SELECT * FROM support_schedule WHERE id = 1").get();
  if (!row) return res.json({ enabled: false, schedule: {}, message: "" });
  try {
    res.json({ enabled: Boolean(row.enabled), schedule: JSON.parse(row.schedule_json), message: row.message });
  } catch {
    res.json({ enabled: Boolean(row.enabled), schedule: {}, message: row.message });
  }
});

export default router;
