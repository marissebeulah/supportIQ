import express from "express";
import { requireRole } from "../auth.js";
import { db, nowIso } from "../db.js";
import { publish } from "../realtime.js";

const router = express.Router();
const STAFF_ROLES = ["it", "admin"];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function getMembers(chatId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.title
       FROM internal_chat_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.chat_id = ? AND u.active = 1
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(chatId);
}

function getChatSummary(chatId, viewerId) {
  const chat = db.prepare("SELECT * FROM internal_chats WHERE id = ?").get(chatId);
  if (!chat) return null;

  const members = getMembers(chatId);
  const lastMessage = db
    .prepare(
      `SELECT m.id, m.body, m.created_at AS createdAt, u.id AS senderId,
        u.name AS senderName, u.role AS senderRole
       FROM internal_chat_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ?
       ORDER BY m.id DESC LIMIT 1`,
    )
    .get(chatId);
  const membership = db
    .prepare("SELECT last_read_at FROM internal_chat_members WHERE chat_id = ? AND user_id = ?")
    .get(chatId, viewerId);
  const unreadCount = Number(
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM internal_chat_messages
         WHERE chat_id = ? AND sender_id != ? AND (? IS NULL OR created_at > ?)`,
      )
      .get(chatId, viewerId, membership.last_read_at, membership.last_read_at).count,
  );

  return {
    id: chat.id,
    type: chat.type,
    title: chat.type === "group" ? chat.title : members.find((member) => member.id !== viewerId)?.name ?? "Direct message",
    createdAt: chat.created_at,
    updatedAt: chat.updated_at,
    members,
    unreadCount,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          body: lastMessage.body,
          createdAt: lastMessage.createdAt,
          sender: { id: lastMessage.senderId, name: lastMessage.senderName, role: lastMessage.senderRole },
        }
      : null,
  };
}

function requireMembership(chatId, userId, res) {
  const membership = db
    .prepare("SELECT 1 FROM internal_chat_members WHERE chat_id = ? AND user_id = ?")
    .get(chatId, userId);
  if (membership) return true;

  const exists = db.prepare("SELECT 1 FROM internal_chats WHERE id = ?").get(chatId);
  res.status(exists ? 403 : 404).json({ error: exists ? "You don't have access to this chat." : "Chat not found." });
  return false;
}

function addMembers(chatId, userIds, joinedAt) {
  const insertMember = db.prepare(
    "INSERT OR IGNORE INTO internal_chat_members (chat_id, user_id, joined_at) VALUES (?, ?, ?)",
  );
  for (const userId of userIds) insertMember.run(chatId, userId, joinedAt);
}

router.use(requireRole(...STAFF_ROLES));

router.get("/people", (req, res) => {
  const people = db
    .prepare(
      `SELECT id, name, email, role, title
       FROM users
       WHERE active = 1 AND role IN ('it', 'admin') AND id != ?
       ORDER BY CASE role WHEN 'it' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
    )
    .all(req.user.id);
  res.json({ people });
});

router.get("/chats", (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id
       FROM internal_chats c
       JOIN internal_chat_members m ON m.chat_id = c.id
       WHERE m.user_id = ?
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT 100`,
    )
    .all(req.user.id);
  res.json({ chats: rows.map((row) => getChatSummary(row.id, req.user.id)) });
});

router.post("/direct", (req, res) => {
  const otherId = parseId(req.body?.userId);
  if (!otherId || otherId === req.user.id) {
    return res.status(400).json({ error: "Choose another IT or admin teammate." });
  }

  const person = db
    .prepare("SELECT id FROM users WHERE id = ? AND active = 1 AND role IN ('it', 'admin')")
    .get(otherId);
  if (!person) return res.status(404).json({ error: "That teammate isn't available for staff chat." });

  const userIds = [req.user.id, otherId].sort((left, right) => left - right);
  const directKey = userIds.join(":");
  const now = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO internal_chats (type, direct_key, created_by, created_at, updated_at)
     VALUES ('direct', ?, ?, ?, ?)`,
  ).run(directKey, req.user.id, now, now);
  const chat = db.prepare("SELECT id FROM internal_chats WHERE direct_key = ?").get(directKey);
  addMembers(chat.id, userIds, now);
  res.status(200).json({ chat: getChatSummary(chat.id, req.user.id) });
});

router.post("/groups", (req, res) => {
  const title = cleanText(req.body?.title, 80);
  const rawIds = req.body?.memberIds;
  if (title.length < 2) return res.status(400).json({ error: "Enter a group name with at least 2 characters." });
  if (!Array.isArray(rawIds)) return res.status(400).json({ error: "Choose at least one teammate." });

  const memberIds = [...new Set(rawIds.map(parseId).filter(Boolean))];
  if (memberIds.length > 19) return res.status(400).json({ error: "A group can include up to 20 people." });
  const userIds = [...new Set([...memberIds, req.user.id])];
  if (userIds.length < 2) return res.status(400).json({ error: "Choose at least one teammate for the group." });

  const placeholders = userIds.map(() => "?").join(", ");
  const people = db
    .prepare(`SELECT id FROM users WHERE active = 1 AND role IN ('it', 'admin') AND id IN (${placeholders})`)
    .all(...userIds);
  if (people.length !== userIds.length) {
    return res.status(400).json({ error: "Only active IT and admin teammates can join staff groups." });
  }

  const now = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare(
        `INSERT INTO internal_chats (type, title, created_by, created_at, updated_at)
         VALUES ('group', ?, ?, ?, ?)`,
      )
      .run(title, req.user.id, now, now);
    const chatId = Number(result.lastInsertRowid);
    addMembers(chatId, userIds, now);
    db.exec("COMMIT");
    return res.status(201).json({ chat: getChatSummary(chatId, req.user.id) });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
});

router.get("/chats/:id", (req, res) => {
  const chatId = parseId(req.params.id);
  if (!chatId) return res.status(404).json({ error: "Chat not found." });
  if (!requireMembership(chatId, req.user.id, res)) return;

  const chat = getChatSummary(chatId, req.user.id);
  const messages = db
    .prepare(
      `SELECT m.id, m.body, m.created_at AS createdAt, u.id AS senderId,
        u.name AS senderName, u.role AS senderRole
       FROM internal_chat_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ?
       ORDER BY m.id DESC LIMIT 100`,
    )
    .all(chatId)
    .reverse()
    .map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      sender: { id: message.senderId, name: message.senderName, role: message.senderRole },
    }));
  res.json({ chat, messages });
});

router.post("/chats/:id/messages", (req, res) => {
  const chatId = parseId(req.params.id);
  if (!chatId) return res.status(404).json({ error: "Chat not found." });
  if (!requireMembership(chatId, req.user.id, res)) return;

  const body = cleanText(req.body?.body, 4000);
  if (!body) return res.status(400).json({ error: "Write a message before sending." });

  const now = nowIso();
  const result = db
    .prepare("INSERT INTO internal_chat_messages (chat_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)")
    .run(chatId, req.user.id, body, now);
  db.prepare("UPDATE internal_chats SET updated_at = ? WHERE id = ?").run(now, chatId);
  db.prepare("UPDATE internal_chat_members SET last_read_at = ? WHERE chat_id = ? AND user_id = ?").run(
    now,
    chatId,
    req.user.id,
  );

  const message = {
    id: Number(result.lastInsertRowid),
    body,
    createdAt: now,
    sender: { id: req.user.id, name: req.user.name, role: req.user.role },
  };
  const memberIds = new Set(getMembers(chatId).map((member) => member.id));
  publish("internal-message", { chatId }, (user) => memberIds.has(user.id));
  res.status(201).json({ message });
});

router.patch("/chats/:id/read", (req, res) => {
  const chatId = parseId(req.params.id);
  if (!chatId) return res.status(404).json({ error: "Chat not found." });
  if (!requireMembership(chatId, req.user.id, res)) return;
  db.prepare("UPDATE internal_chat_members SET last_read_at = ? WHERE chat_id = ? AND user_id = ?").run(
    nowIso(),
    chatId,
    req.user.id,
  );
  res.status(204).end();
});

export default router;