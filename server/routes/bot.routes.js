import express from "express";
import { requireRole, rateLimit } from "../auth.js";
import { db, getSetting, getSettings, nowIso } from "../db.js";
import {
  BOT_GREETING_SUGGESTIONS,
  botSuggestions,
  generateBotReply,
} from "../bot.js";
import { renderTemplate } from "../format.js";
import { publish } from "../realtime.js";
import { firstMatchingCondition } from "../routing.js";
import { inferProduct } from "../products.js";

const router = express.Router();
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function isWithinSupportHours(schedule, now = new Date()) {
  const day = schedule?.[WEEKDAYS[now.getDay()]];
  if (!day?.enabled) return false;
  const parseMinutes = (value) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
  };
  const start = parseMinutes(day.start);
  const end = parseMinutes(day.end);
  if (start === null || end === null || end <= start) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= start && current < end;
}

function getKb() {
  return db
    .prepare("SELECT id, question, answer, keywords, category, enabled FROM kb_entries WHERE enabled = 1 ORDER BY id")
    .all();
}

function getBotButtons() {
  const buttons = db.prepare("SELECT label, action FROM bot_buttons WHERE enabled = 1 ORDER BY sort_order, id").all();
  if (buttons.length) return buttons.map((b) => b.label);
  try {
    const stored = getSetting("bot_welcome_buttons");
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return ["Login problem", "Report a bug", "Billing", "How to use", "Talk to IT Support"];
}

function createConversation(user) {
  const now = nowIso();
  const info = db
    .prepare("INSERT INTO bot_conversations (customer_id, created_at, updated_at) VALUES (?, ?, ?)")
    .run(user.id, now, now);
  const conversationId = Number(info.lastInsertRowid);
  const greeting = renderTemplate(getSetting("bot_greeting"), {
    first_name: String(user.name).split(" ")[0],
  });
  db.prepare(
    "INSERT INTO bot_messages (conversation_id, role, body, created_at) VALUES (?, 'bot', ?, ?)",
  ).run(conversationId, greeting, now);
  try {
    db.prepare("INSERT OR IGNORE INTO bot_failures (conversation_id, failed_count, updated_at) VALUES (?, 0, ?)").run(conversationId, now);
  } catch {}
  return conversationId;
}

function activeConversation(user, { create = true } = {}) {
  const existing = db
    .prepare(
      `SELECT * FROM bot_conversations
       WHERE customer_id = ? AND escalated_ticket_id IS NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .get(user.id);
  if (existing) return existing;
  if (!create) return null;
  const id = createConversation(user);
  return db.prepare("SELECT * FROM bot_conversations WHERE id = ?").get(id);
}

function conversationPayload(conversation, user) {
  const messages = db
    .prepare("SELECT id, role, body, created_at FROM bot_messages WHERE conversation_id = ? ORDER BY created_at, id")
    .all(conversation.id)
    .map((message) => ({
      id: message.id,
      role: message.role,
      body: message.body,
      createdAt: message.created_at,
    }));
  const kb = getKb();
  const settings = getSettings();
  const product = conversation.product_id
    ? db.prepare("SELECT id, name FROM products WHERE id = ?").get(conversation.product_id)
    : null;
  const customerMessages = messages.filter((message) => message.role === "customer");
  const guidedQuestionsEnabled = settings.bot_guided_questions_enabled !== "0";
  return {
    conversationId: conversation.id,
    product: product ? { id: product.id, name: product.name } : null,
    needsProduct: !product,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    messages,
    enabled: settings.bot_enabled === "1",
    suggestions: customerMessages.length === 0 && guidedQuestionsEnabled ? getBotButtons() : botSuggestions(kb, 3),
    guidedQuestionsEnabled,
    recommendTicket: false,
    firstName: String(user.name).split(" ")[0],
  };
}

/**
 * If the customer typed a product name or a strong product hint, remember it on
 * the conversation so the eventual request is segregated correctly.
 */
function detectConversationProduct(conversation, text) {
  if (conversation.product_id) {
    const product = db.prepare("SELECT id, name FROM products WHERE id = ?").get(conversation.product_id);
    return { conversation, product: product ?? null, detected: false };
  }

  const inferred = inferProduct(text, db.prepare("SELECT id, name FROM products WHERE enabled = 1").all());
  if (!inferred) return { conversation, product: null, detected: false };

  db.prepare("UPDATE bot_conversations SET product_id = ?, updated_at = ? WHERE id = ?")
    .run(inferred.id, nowIso(), conversation.id);
  return {
    conversation: { ...conversation, product_id: inferred.id },
    product: { id: inferred.id, name: inferred.name },
    detected: true,
  };
}

router.use(requireRole("customer"));

router.get("/products", (_req, res) => {
  const products = db.prepare("SELECT id, name FROM products WHERE enabled = 1 ORDER BY name").all();
  res.json({ products });
});

router.get("/schedule", (_req, res) => {
  try {
    const row = db.prepare("SELECT * FROM support_schedule WHERE id = 1").get();
    if (!row || !row.enabled) return res.json({ enabled: false });
    const schedule = JSON.parse(row.schedule_json);
    return res.json({ enabled: !isWithinSupportHours(schedule), message: row.message });
  } catch {
    return res.json({ enabled: false });
  }
});

router.get("/conversation", (req, res) => {
  const conversation = activeConversation(req.user);
  res.json(conversationPayload(conversation, req.user));
});

router.patch("/conversation/product", (req, res) => {
  const rawProductId = req.body?.productId;
  const productId = rawProductId === null || rawProductId === undefined || rawProductId === ""
    ? null
    : Number(rawProductId);
  if (productId !== null && (!Number.isInteger(productId) || productId < 1)) {
    return res.status(400).json({ error: "Choose a valid product." });
  }
  if (productId !== null) {
    const product = db.prepare("SELECT id FROM products WHERE id = ? AND enabled = 1").get(productId);
    if (!product) return res.status(404).json({ error: "That product isn't available." });
  }
  const conversation = activeConversation(req.user);
  const updatedAt = nowIso();
  db.prepare("UPDATE bot_conversations SET product_id = ?, updated_at = ? WHERE id = ?")
    .run(productId, updatedAt, conversation.id);
  res.json({ conversation: conversationPayload({ ...conversation, product_id: productId, updated_at: updatedAt }, req.user) });
});

router.post(
  "/messages",
  rateLimit({ limit: 40, windowMs: 60 * 1000, message: "Please slow down a little and try again." }),
  (req, res) => {
    const text = String(req.body?.message ?? "").replace(/\u0000/g, "").trim();
    if (!text) return res.status(400).json({ error: "Type a message for the assistant." });
    if (text.length > 1500) return res.status(400).json({ error: "Keep assistant messages under 1,500 characters." });

    const settings = getSettings();
    if (settings.bot_enabled !== "1") {
      return res.status(409).json({
        error: "The support assistant is currently unavailable. You can still create a support request.",
        code: "bot_disabled",
      });
    }

    let conversation = activeConversation(req.user);
    const productDetection = detectConversationProduct(conversation, text);
    conversation = productDetection.conversation;
    const detectedProduct = productDetection.product;
    const priorMessages = db
      .prepare("SELECT role FROM bot_messages WHERE conversation_id = ?")
      .all(conversation.id);
    const hasPriorBotAnswer =
      priorMessages.filter((message) => message.role === "bot").length > 1 ||
      priorMessages.some((message) => message.role === "customer");

    // Check for failed answers count
    let failedCount = 0;
    try {
      const failureRow = db.prepare("SELECT failed_count FROM bot_failures WHERE conversation_id = ?").get(conversation.id);
      failedCount = Number(failureRow?.failed_count || 0);
    } catch {}

    // Check for "Talk to IT Support" button press
    const normalizedText = text.toLowerCase();
    if (normalizedText.includes("talk to it support") || normalizedText.includes("talk to it") || normalizedText === "talk to it support") {
      const now = nowIso();
      const customerInfo = db
        .prepare(
          "INSERT INTO bot_messages (conversation_id, role, body, created_at) VALUES (?, 'customer', ?, ?)",
        )
        .run(conversation.id, text, now);
      const escalationMsg = settings.bot_escalation || "I'll connect you with the IT support team. Create a support request from this chat and the conversation comes with it, so you won't need to repeat yourself.";
      const botAt = new Date(Date.now() + 350).toISOString();
      const botInfo = db
        .prepare(
          "INSERT INTO bot_messages (conversation_id, role, body, created_at) VALUES (?, 'bot', ?, ?)",
        )
        .run(conversation.id, escalationMsg, botAt);
      db.prepare("UPDATE bot_conversations SET updated_at = ? WHERE id = ?").run(botAt, conversation.id);
      try {
        db.prepare("INSERT INTO bot_failures (conversation_id, failed_count, updated_at) VALUES (?, 1, ?) ON CONFLICT(conversation_id) DO UPDATE SET failed_count = failed_count + 1, updated_at = excluded.updated_at").run(conversation.id, botAt);
      } catch {}
      publish(
        "bot:message",
        { conversationId: conversation.id, customerId: req.user.id },
        (user) => user.role === "admin" || user.id === req.user.id,
      );
      return res.json({
        conversationId: conversation.id,
        messages: [
          { id: Number(customerInfo.lastInsertRowid), role: "customer", body: text, createdAt: now },
          { id: Number(botInfo.lastInsertRowid), role: "bot", body: escalationMsg, createdAt: botAt },
        ],
        suggestions: ["Create a support request", "What should I include?"],
        recommendTicket: true,
        intent: "handoff",
        enabled: true,
        product: detectedProduct ? { id: detectedProduct.id, name: detectedProduct.name } : null,
        needsProduct: !detectedProduct,
        productDetected: productDetection.detected,
      });
    }

    const now = nowIso();
    const customerInfo = db
      .prepare(
        "INSERT INTO bot_messages (conversation_id, role, body, created_at) VALUES (?, 'customer', ?, ?)",
      )
      .run(conversation.id, text, now);

    // If 2 or more failed bot answers, automatic handoff
    if (failedCount >= 2) {
      const escalationMsg = settings.bot_escalation || "I'll connect you with the IT support team. Create a support request from this chat and the conversation comes with it, so you won't need to repeat yourself.";
      const botAt = new Date(Date.now() + 350).toISOString();
      const botInfo = db
        .prepare(
          "INSERT INTO bot_messages (conversation_id, role, body, created_at) VALUES (?, 'bot', ?, ?)",
        )
        .run(conversation.id, escalationMsg, botAt);
      db.prepare("UPDATE bot_conversations SET updated_at = ? WHERE id = ?").run(botAt, conversation.id);
      try {
        db.prepare("INSERT INTO bot_failures (conversation_id, failed_count, updated_at) VALUES (?, ?, ?) ON CONFLICT(conversation_id) DO UPDATE SET failed_count = excluded.failed_count + 1, updated_at = excluded.updated_at").run(conversation.id, failedCount + 1, botAt);
      } catch {}
      publish(
        "bot:message",
        { conversationId: conversation.id, customerId: req.user.id },
        (user) => user.role === "admin" || user.id === req.user.id,
      );
      return res.json({
        conversationId: conversation.id,
        messages: [
          { id: Number(customerInfo.lastInsertRowid), role: "customer", body: text, createdAt: now },
          { id: Number(botInfo.lastInsertRowid), role: "bot", body: escalationMsg, createdAt: botAt },
        ],
        suggestions: ["Create a support request", "What should I include?"],
        recommendTicket: true,
        intent: "handoff",
        enabled: true,
        product: detectedProduct ? { id: detectedProduct.id, name: detectedProduct.name } : null,
        needsProduct: !detectedProduct,
        productDetected: productDetection.detected,
      });
    }

    let reply = generateBotReply({
      text,
      kb: getKb(),
      settings,
      firstName: String(req.user.name).split(" ")[0],
      hasPriorBotAnswer,
    });

    // Apply smart routing conditions
    try {
      const conditions = db.prepare("SELECT * FROM bot_conditions WHERE enabled = 1 ORDER BY priority DESC").all();
      const condition = firstMatchingCondition(conditions, {
        text,
        products: db.prepare("SELECT name FROM products WHERE enabled = 1").all(),
      });
      if (condition && ["escalate", "handoff", "route_to_it"].includes(condition.action_type)) {
        reply = {
          ...reply,
          body: settings.bot_escalation,
          intent: "handoff",
          recommendTicket: true,
          suggestions: ["Create a support request", "What should I include?"],
        };
      }
    } catch (e) {
      // ignore condition errors
    }

    const botAt = new Date(Date.now() + 350).toISOString();
    const botInfo = db
      .prepare(
        "INSERT INTO bot_messages (conversation_id, role, body, created_at) VALUES (?, 'bot', ?, ?)",
      )
      .run(conversation.id, reply.body, botAt);

    db.prepare("UPDATE bot_conversations SET updated_at = ? WHERE id = ?").run(botAt, conversation.id);

    // Track failed answers - count fallback, guardrail leading to ticket, or when no good match
    if (reply.intent === "fallback" || (reply.intent === "guardrail" && reply.recommendTicket) || reply.intent === "handoff") {
      try {
        db.prepare("INSERT INTO bot_failures (conversation_id, failed_count, updated_at) VALUES (?, 1, ?) ON CONFLICT(conversation_id) DO UPDATE SET failed_count = failed_count + 1, updated_at = excluded.updated_at").run(conversation.id, botAt);
      } catch {}
    }

    publish(
      "bot:message",
      { conversationId: conversation.id, customerId: req.user.id },
      (user) => user.role === "admin" || user.id === req.user.id,
    );

    res.json({
      conversationId: conversation.id,
      messages: [
        { id: Number(customerInfo.lastInsertRowid), role: "customer", body: text, createdAt: now },
        { id: Number(botInfo.lastInsertRowid), role: "bot", body: reply.body, createdAt: botAt },
      ],
      suggestions: reply.suggestions,
      recommendTicket: Boolean(reply.recommendTicket),
      intent: reply.intent,
      enabled: true,
      product: detectedProduct ? { id: detectedProduct.id, name: detectedProduct.name } : null,
      needsProduct: !detectedProduct,
      productDetected: productDetection.detected,
    });
  },
);

router.post("/reset", (req, res) => {
  const current = activeConversation(req.user, { create: false });
  if (current) {
    const customerCount = db
      .prepare("SELECT COUNT(*) AS count FROM bot_messages WHERE conversation_id = ? AND role = 'customer'")
      .get(current.id);
    if (Number(customerCount.count) === 0) {
      return res.json(conversationPayload(current, req.user));
    }
  }
  const id = createConversation(req.user);
  const conversation = db.prepare("SELECT * FROM bot_conversations WHERE id = ?").get(id);
  res.status(201).json(conversationPayload(conversation, req.user));
});

router.get("/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  const conversation = db
    .prepare("SELECT * FROM bot_conversations WHERE id = ? AND customer_id = ?")
    .get(id, req.user.id);
  if (!conversation) return res.status(404).json({ error: "Assistant conversation not found." });
  res.json(conversationPayload(conversation, req.user));
});

export default router;
