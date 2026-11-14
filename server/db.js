import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backfillProductAssignments } from "./products.js";

export const DATA_DIR = path.resolve(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "supportiq.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'it', 'admin')),
  company TEXT,
  title TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  escalated_ticket_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  assignee_id INTEGER REFERENCES users(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  channel TEXT NOT NULL DEFAULT 'portal' CHECK (channel IN ('portal', 'assistant')),
  bot_conversation_id INTEGER REFERENCES bot_conversations(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  first_response_at TEXT,
  resolved_at TEXT,
  closed_at TEXT,
  response_due_at TEXT NOT NULL,
  resolve_due_at TEXT NOT NULL,
  resolution_summary TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  rating_comment TEXT,
  rated_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  admin_help_requested_at TEXT,
  admin_help_reason TEXT,
  reopened_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'it', 'admin', 'bot', 'system')),
  body TEXT NOT NULL DEFAULT '',
  is_internal INTEGER NOT NULL DEFAULT 0,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  flag_reason TEXT,
  flag_details TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  uploader_id INTEGER NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (user_id, ticket_id)
);

CREATE TABLE IF NOT EXISTS canned_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES bot_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'bot')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS internal_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  title TEXT,
  direct_key TEXT UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (type != 'direct' OR (direct_key IS NOT NULL AND title IS NULL)),
  CHECK (type != 'group' OR (direct_key IS NULL AND length(trim(title)) > 0))
);

CREATE TABLE IF NOT EXISTS internal_chat_members (
  chat_id INTEGER NOT NULL REFERENCES internal_chats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  last_read_at TEXT,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS internal_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES internal_chats(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'issue' CHECK (type IN ('product', 'client', 'issue', 'general')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_tags (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, tag_id)
);

CREATE TABLE IF NOT EXISTS customer_tags (
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);

CREATE TABLE IF NOT EXISTS bot_buttons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  action TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bot_conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_value TEXT,
  action_type TEXT NOT NULL,
  action_value TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bot_failures (
  conversation_id INTEGER PRIMARY KEY REFERENCES bot_conversations(id) ON DELETE CASCADE,
  failed_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_schedule (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  schedule_json TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reminder', 'solved_check', 'survey')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'dismissed')),
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  completed_at TEXT,
  response TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  caller_id INTEGER NOT NULL REFERENCES users(id),
  callee_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'video' CHECK (kind IN ('video', 'audio')),
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'active', 'ended', 'declined', 'missed', 'cancelled')),
  created_at TEXT NOT NULL,
  answered_at TEXT,
  ended_at TEXT,
  ended_by INTEGER REFERENCES users(id)
);

-- Customer-consented remote support sessions driven by the native SupportIQ
-- Agent. The agent holds a per-device token; no screen or input data is stored.
CREATE TABLE IF NOT EXISTS remote_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  device_id TEXT,
  agent_device_id INTEGER,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'ready', 'active', 'ended', 'declined', 'expired')),
  created_at TEXT NOT NULL,
  ready_at TEXT,
  approved_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  ended_by INTEGER REFERENCES users(id),
  ended_reason TEXT,
  started_with TEXT,
  last_frame_at TEXT,
  expires_at TEXT NOT NULL,
  privacy_mode INTEGER NOT NULL DEFAULT 0
);

-- A paired Windows computer that belongs to a customer. The bearer token is
-- only stored as a SHA-256 hash; the plaintext is returned once at pairing.
CREATE TABLE IF NOT EXISTS agent_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'windows',
  agent_version TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  unattended_enabled INTEGER NOT NULL DEFAULT 0,
  unattended_password_hash TEXT,
  unattended_updated_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS agent_pairing_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_ticket ON activity(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_bot_messages_conversation ON bot_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_internal_chat_members_user ON internal_chat_members(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_internal_chat_messages_chat ON internal_chat_messages(chat_id, id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_ticket ON ticket_tags(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_tag ON ticket_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_customer ON customer_tags(customer_id);
CREATE INDEX IF NOT EXISTS idx_calls_ticket ON calls(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_remote_sessions_ticket ON remote_sessions(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_remote_sessions_status ON remote_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_devices_user ON agent_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_pairing_codes_hash ON agent_pairing_codes(code_hash);
`);

for (const [table, column] of [["tickets", "product_id"], ["bot_conversations", "product_id"]]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER REFERENCES products(id)`);
  }
}

for (const [column, def] of [
  ["approved_at", "TEXT"],
  ["rejected_at", "TEXT"],
  ["rejection_reason", "TEXT"],
  ["admin_help_requested_at", "TEXT"],
  ["admin_help_reason", "TEXT"],
]) {
  const columns = db.prepare("PRAGMA table_info(tickets)").all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE tickets ADD COLUMN ${column} ${def}`);
  }
}

for (const [column, def] of [
  ["is_flagged", "INTEGER NOT NULL DEFAULT 0"],
  ["flag_reason", "TEXT"],
  ["flag_details", "TEXT"],
]) {
  const columns = db.prepare("PRAGMA table_info(messages)").all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${def}`);
  }
}

// Older remote_sessions tables were created for the RustDesk flow. Add the
// native-agent columns in place so existing databases keep their history.
for (const [column, def] of [
  ["agent_device_id", "INTEGER"],
  ["approved_at", "TEXT"],
  ["ended_reason", "TEXT"],
  ["started_with", "TEXT"],
  ["last_frame_at", "TEXT"],
  // Privacy mode shows the customer a full-screen "secure session" animation
  // while the technician works on the real desktop underneath.
  ["privacy_mode", "INTEGER NOT NULL DEFAULT 0"],
]) {
  const columns = db.prepare("PRAGMA table_info(remote_sessions)").all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE remote_sessions ADD COLUMN ${column} ${def}`);
  }
}

// Unattended access is opt-in per paired computer. Only the password hash is
// stored, so neither the portal nor the API can read the customer's password.
for (const [column, def] of [
  ["unattended_enabled", "INTEGER NOT NULL DEFAULT 0"],
  ["unattended_password_hash", "TEXT"],
  ["unattended_updated_at", "TEXT"],
]) {
  const columns = db.prepare("PRAGMA table_info(agent_devices)").all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE agent_devices ADD COLUMN ${column} ${def}`);
  }
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_tickets_product ON tickets(product_id);
CREATE INDEX IF NOT EXISTS idx_bot_conversations_product ON bot_conversations(product_id);
UPDATE tickets SET product_id = (
  SELECT p.id FROM ticket_tags tt
  JOIN tags tag ON tag.id = tt.tag_id AND tag.type = 'product'
  JOIN products p ON p.name = tag.name
  WHERE tt.ticket_id = tickets.id
  LIMIT 1
) WHERE product_id IS NULL;
UPDATE bot_conversations SET product_id = (
  SELECT t.product_id FROM tickets t WHERE t.bot_conversation_id = bot_conversations.id LIMIT 1
) WHERE product_id IS NULL;
`);

export const DEFAULT_SETTINGS = {
  bot_enabled: "1",
  bot_greeting:
    "Hi {first_name}, I'm the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What's happening today?",
  bot_fallback:
    "I can't confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.",
  bot_escalation:
    "I'll connect you with the IT support team. Create a support request from this chat and the conversation comes with it, so you won't need to repeat yourself.",
  bot_guardrail:
    "I'm the support assistant, so I can only help with support issues. I can't discuss sales, pricing, or promotions. If something in your account isn't working, tell me and I'll help or connect you with IT.",
  auto_ack:
    "Thanks {first_name}, request {ticket_ref} is in the IT support queue. A support agent will review it. Your target first response is {response_target}. You can follow every update right here in SupportIQ.",
  auto_ack_alt:
    "We received your request. Ticket #{ticket_ref}. Our IT team will reply within 2 hrs",
  sla: JSON.stringify({
    low: { response_hours: 24, resolve_hours: 72 },
    normal: { response_hours: 8, resolve_hours: 24 },
    high: { response_hours: 2, resolve_hours: 8 },
    urgent: { response_hours: 1, resolve_hours: 4 },
  }),
  bot_welcome_buttons: JSON.stringify([
    "Login problem",
    "Report a bug",
    "Billing",
    "How to use",
    "Talk to IT Support",
  ]),
  bot_guided_questions_enabled: "1",
  support_schedule_message: "Our support team is available Monday-Friday, 9:00 AM - 6:00 PM. Outside of these hours, your ticket will still be created and queued for the next business day.",
};

const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  insertSetting.run(key, value);
}

// Initialize products
const productCount = db.prepare("SELECT COUNT(*) as c FROM products").get();
if (Number(productCount?.c || 0) === 0) {
  const insertProduct = db.prepare("INSERT INTO products (name, enabled, created_at) VALUES (?, 1, ?)");
  const now = nowIso();
  for (const product of ["Payro", "Eduvia", "Vaulta", "Finara", "VendiX POS"])
    insertProduct.run(product, now);
}

// Give existing tickets and conversations a product where the text makes it clear.
backfillProductAssignments(db);

// Initialize bot buttons
const buttonCount = db.prepare("SELECT COUNT(*) as c FROM bot_buttons").get();
if (Number(buttonCount?.c || 0) === 0) {
  const insertButton = db.prepare("INSERT INTO bot_buttons (label, action, sort_order, enabled) VALUES (?, ?, ?, 1)");
  const buttons = [
    ["Login problem", "login_problem", 1],
    ["Report a bug", "report_bug", 2],
    ["Billing", "billing", 3],
    ["How to use", "how_to_use", 4],
    ["Talk to IT Support", "talk_to_it", 5],
  ];
  for (const [label, action, order] of buttons) insertButton.run(label, action, order);
}

const conditionCount = db.prepare("SELECT COUNT(*) as c FROM bot_conditions").get();
if (Number(conditionCount?.c || 0) === 0) {
  db.prepare(
    `INSERT INTO bot_conditions (name, trigger_type, trigger_value, action_type, action_value, priority, enabled)
     VALUES ('Urgent requests go to IT', 'urgent', '', 'route_to_it', '', 100, 1)`,
  ).run();
}

// Initialize support schedule
const schedCount = db.prepare("SELECT COUNT(*) as c FROM support_schedule").get();
if (Number(schedCount?.c || 0) === 0) {
  db.prepare("INSERT INTO support_schedule (id, enabled, schedule_json, message) VALUES (1, 1, ?, ?)").run(
    JSON.stringify({
      monday: { enabled: true, start: "09:00", end: "18:00" },
      tuesday: { enabled: true, start: "09:00", end: "18:00" },
      wednesday: { enabled: true, start: "09:00", end: "18:00" },
      thursday: { enabled: true, start: "09:00", end: "18:00" },
      friday: { enabled: true, start: "09:00", end: "18:00" },
      saturday: { enabled: false, start: "09:00", end: "13:00" },
      sunday: { enabled: false, start: "09:00", end: "13:00" },
    }),
    "Our support team is available Monday-Friday, 9:00 AM - 6:00 PM. Outside of these hours, your ticket will still be created and queued for the next business day.",
  );
}

const selectSetting = db.prepare("SELECT value FROM settings WHERE key = ?");

export function getSetting(key) {
  const row = selectSetting.get(key);
  return row ? row.value : (DEFAULT_SETTINGS[key] ?? "");
}

export function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, String(value));
}

export function getSla() {
  try {
    const parsed = JSON.parse(getSetting("sla"));
    const fallback = JSON.parse(DEFAULT_SETTINGS.sla);
    const output = {};
    for (const priority of Object.keys(fallback)) {
      const item = parsed?.[priority] ?? {};
      output[priority] = {
        response_hours: clampNumber(item.response_hours, 0.25, 720, fallback[priority].response_hours),
        resolve_hours: clampNumber(item.resolve_hours, 0.25, 2160, fallback[priority].resolve_hours),
      };
    }
    return output;
  } catch {
    return JSON.parse(DEFAULT_SETTINGS.sla);
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function nowIso() {
  return new Date().toISOString();
}

export function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

export const PRIORITIES = ["low", "normal", "high", "urgent"];
export const STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
export const CATEGORIES = [
  "Account access",
  "Technical issue",
  "Billing & invoices",
  "Device & hardware",
  "Data & exports",
  "How-to question",
  "Feature request",
  "Other",
];
