BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "activity" (
	"id"	INTEGER,
	"ticket_id"	INTEGER NOT NULL,
	"actor_id"	INTEGER,
	"type"	TEXT NOT NULL,
	"from_value"	TEXT,
	"to_value"	TEXT,
	"note"	TEXT,
	"created_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("actor_id") REFERENCES "users"("id"),
	FOREIGN KEY("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "agent_devices" (
	"id"	INTEGER,
	"user_id"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL,
	"platform"	TEXT NOT NULL DEFAULT 'windows',
	"agent_version"	TEXT,
	"token_hash"	TEXT NOT NULL UNIQUE,
	"created_at"	TEXT NOT NULL,
	"last_seen_at"	TEXT,
	"revoked_at"	TEXT,
	"unattended_enabled"	INTEGER NOT NULL DEFAULT 0,
	"unattended_password_hash"	TEXT,
	"unattended_updated_at"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "agent_pairing_codes" (
	"id"	INTEGER,
	"user_id"	INTEGER NOT NULL,
	"code_hash"	TEXT NOT NULL UNIQUE,
	"created_at"	TEXT NOT NULL,
	"expires_at"	TEXT NOT NULL,
	"used_at"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "attachments" (
	"id"	INTEGER,
	"ticket_id"	INTEGER,
	"message_id"	INTEGER,
	"uploader_id"	INTEGER NOT NULL,
	"filename"	TEXT NOT NULL,
	"stored_name"	TEXT NOT NULL,
	"mime"	TEXT NOT NULL,
	"size"	INTEGER NOT NULL,
	"created_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("message_id") REFERENCES "messages"("id") ON DELETE CASCADE,
	FOREIGN KEY("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE,
	FOREIGN KEY("uploader_id") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "bot_buttons" (
	"id"	INTEGER,
	"label"	TEXT NOT NULL,
	"action"	TEXT,
	"sort_order"	INTEGER NOT NULL DEFAULT 0,
	"enabled"	INTEGER NOT NULL DEFAULT 1,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "bot_conditions" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL,
	"trigger_type"	TEXT NOT NULL,
	"trigger_value"	TEXT,
	"action_type"	TEXT NOT NULL,
	"action_value"	TEXT,
	"priority"	INTEGER NOT NULL DEFAULT 0,
	"enabled"	INTEGER NOT NULL DEFAULT 1,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "bot_conversations" (
	"id"	INTEGER,
	"customer_id"	INTEGER NOT NULL,
	"escalated_ticket_id"	INTEGER,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT NOT NULL,
	"product_id"	INTEGER,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("customer_id") REFERENCES "users"("id") ON DELETE CASCADE,
	FOREIGN KEY("product_id") REFERENCES "products"("id")
);
CREATE TABLE IF NOT EXISTS "bot_failures" (
	"conversation_id"	INTEGER,
	"failed_count"	INTEGER NOT NULL DEFAULT 0,
	"updated_at"	TEXT NOT NULL,
	PRIMARY KEY("conversation_id"),
	FOREIGN KEY("conversation_id") REFERENCES "bot_conversations"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "bot_messages" (
	"id"	INTEGER,
	"conversation_id"	INTEGER NOT NULL,
	"role"	TEXT NOT NULL CHECK("role" IN ('customer', 'bot')),
	"body"	TEXT NOT NULL,
	"created_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("conversation_id") REFERENCES "bot_conversations"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "calls" (
	"id"	INTEGER,
	"ticket_id"	INTEGER NOT NULL,
	"caller_id"	INTEGER NOT NULL,
	"callee_id"	INTEGER NOT NULL,
	"kind"	TEXT NOT NULL DEFAULT 'video' CHECK("kind" IN ('video', 'audio')),
	"status"	TEXT NOT NULL DEFAULT 'ringing' CHECK("status" IN ('ringing', 'active', 'ended', 'declined', 'missed', 'cancelled')),
	"created_at"	TEXT NOT NULL,
	"answered_at"	TEXT,
	"ended_at"	TEXT,
	"ended_by"	INTEGER,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("callee_id") REFERENCES "users"("id"),
	FOREIGN KEY("caller_id") REFERENCES "users"("id"),
	FOREIGN KEY("ended_by") REFERENCES "users"("id"),
	FOREIGN KEY("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "canned_replies" (
	"id"	INTEGER,
	"title"	TEXT NOT NULL,
	"body"	TEXT NOT NULL,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "customer_tags" (
	"customer_id"	INTEGER NOT NULL,
	"tag_id"	INTEGER NOT NULL,
	PRIMARY KEY("customer_id","tag_id"),
	FOREIGN KEY("customer_id") REFERENCES "users"("id") ON DELETE CASCADE,
	FOREIGN KEY("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "follow_ups" (
	"id"	INTEGER,
	"ticket_id"	INTEGER NOT NULL,
	"type"	TEXT NOT NULL CHECK("type" IN ('reminder', 'solved_check', 'survey')),
	"status"	TEXT NOT NULL DEFAULT 'pending' CHECK("status" IN ('pending', 'sent', 'completed', 'dismissed')),
	"scheduled_at"	TEXT NOT NULL,
	"sent_at"	TEXT,
	"completed_at"	TEXT,
	"response"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "internal_chat_members" (
	"chat_id"	INTEGER NOT NULL,
	"user_id"	INTEGER NOT NULL,
	"joined_at"	TEXT NOT NULL,
	"last_read_at"	TEXT,
	PRIMARY KEY("chat_id","user_id"),
	FOREIGN KEY("chat_id") REFERENCES "internal_chats"("id") ON DELETE CASCADE,
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "internal_chat_messages" (
	"id"	INTEGER,
	"chat_id"	INTEGER NOT NULL,
	"sender_id"	INTEGER NOT NULL,
	"body"	TEXT NOT NULL,
	"created_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("chat_id") REFERENCES "internal_chats"("id") ON DELETE CASCADE,
	FOREIGN KEY("sender_id") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "internal_chats" (
	"id"	INTEGER,
	"type"	TEXT NOT NULL CHECK("type" IN ('direct', 'group')),
	"title"	TEXT,
	"direct_key"	TEXT UNIQUE,
	"created_by"	INTEGER NOT NULL,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("created_by") REFERENCES "users"("id"),
	CHECK("type" != 'direct' OR ("direct_key" IS NOT NULL AND "title" IS NULL)),
	CHECK("type" != 'group' OR ("direct_key" IS NULL AND length(trim("title")) > 0))
);
CREATE TABLE IF NOT EXISTS "kb_entries" (
	"id"	INTEGER,
	"question"	TEXT NOT NULL,
	"answer"	TEXT NOT NULL,
	"keywords"	TEXT NOT NULL DEFAULT '',
	"category"	TEXT NOT NULL DEFAULT 'General',
	"enabled"	INTEGER NOT NULL DEFAULT 1,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "messages" (
	"id"	INTEGER,
	"ticket_id"	INTEGER NOT NULL,
	"sender_id"	INTEGER,
	"sender_role"	TEXT NOT NULL CHECK("sender_role" IN ('customer', 'it', 'admin', 'bot', 'system')),
	"body"	TEXT NOT NULL DEFAULT '',
	"is_internal"	INTEGER NOT NULL DEFAULT 0,
	"created_at"	TEXT NOT NULL,
	"is_flagged"	INTEGER NOT NULL DEFAULT 0,
	"flag_reason"	TEXT,
	"flag_details"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("sender_id") REFERENCES "users"("id"),
	FOREIGN KEY("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "password_resets" (
	"id"	INTEGER,
	"user_id"	INTEGER NOT NULL,
	"token"	TEXT NOT NULL,
	"created_at"	TEXT NOT NULL,
	"used_at"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "products" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL UNIQUE,
	"enabled"	INTEGER NOT NULL DEFAULT 1,
	"created_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "remote_sessions" (
	"id"	INTEGER,
	"ticket_id"	INTEGER NOT NULL,
	"requested_by"	INTEGER NOT NULL,
	"customer_id"	INTEGER NOT NULL,
	"device_id"	TEXT,
	"status"	TEXT NOT NULL DEFAULT 'requested' CHECK("status" IN ('requested', 'ready', 'active', 'ended', 'declined', 'expired')),
	"created_at"	TEXT NOT NULL,
	"ready_at"	TEXT,
	"started_at"	TEXT,
	"ended_at"	TEXT,
	"ended_by"	INTEGER,
	"expires_at"	TEXT NOT NULL,
	"agent_device_id"	INTEGER,
	"approved_at"	TEXT,
	"ended_reason"	TEXT,
	"last_frame_at"	TEXT,
	"started_with"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("customer_id") REFERENCES "users"("id"),
	FOREIGN KEY("ended_by") REFERENCES "users"("id"),
	FOREIGN KEY("requested_by") REFERENCES "users"("id"),
	FOREIGN KEY("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "sessions" (
	"token"	TEXT,
	"user_id"	INTEGER NOT NULL,
	"created_at"	TEXT NOT NULL,
	"expires_at"	TEXT NOT NULL,
	PRIMARY KEY("token"),
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "settings" (
	"key"	TEXT,
	"value"	TEXT NOT NULL,
	PRIMARY KEY("key")
);
CREATE TABLE IF NOT EXISTS "support_schedule" (
	"id"	INTEGER CHECK("id" = 1),
	"enabled"	INTEGER NOT NULL DEFAULT 0,
	"schedule_json"	TEXT NOT NULL,
	"message"	TEXT NOT NULL DEFAULT '',
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "tags" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL UNIQUE,
	"type"	TEXT NOT NULL DEFAULT 'issue' CHECK("type" IN ('product', 'client', 'issue', 'general')),
	"created_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "ticket_reads" (
	"user_id"	INTEGER NOT NULL,
	"ticket_id"	INTEGER NOT NULL,
	"last_read_at"	TEXT NOT NULL,
	PRIMARY KEY("user_id","ticket_id"),
	FOREIGN KEY("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE,
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "ticket_tags" (
	"ticket_id"	INTEGER NOT NULL,
	"tag_id"	INTEGER NOT NULL,
	PRIMARY KEY("ticket_id","tag_id"),
	FOREIGN KEY("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE,
	FOREIGN KEY("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "tickets" (
	"id"	INTEGER,
	"ref"	TEXT NOT NULL UNIQUE,
	"customer_id"	INTEGER NOT NULL,
	"assignee_id"	INTEGER,
	"subject"	TEXT NOT NULL,
	"description"	TEXT NOT NULL DEFAULT '',
	"category"	TEXT NOT NULL DEFAULT 'Other',
	"priority"	TEXT NOT NULL DEFAULT 'normal' CHECK("priority" IN ('low', 'normal', 'high', 'urgent')),
	"status"	TEXT NOT NULL DEFAULT 'open' CHECK("status" IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
	"channel"	TEXT NOT NULL DEFAULT 'portal' CHECK("channel" IN ('portal', 'assistant')),
	"bot_conversation_id"	INTEGER,
	"created_at"	TEXT NOT NULL,
	"updated_at"	TEXT NOT NULL,
	"first_response_at"	TEXT,
	"resolved_at"	TEXT,
	"closed_at"	TEXT,
	"response_due_at"	TEXT NOT NULL,
	"resolve_due_at"	TEXT NOT NULL,
	"resolution_summary"	TEXT,
	"rating"	INTEGER CHECK("rating" BETWEEN 1 AND 5),
	"rating_comment"	TEXT,
	"rated_at"	TEXT,
	"reopened_count"	INTEGER NOT NULL DEFAULT 0,
	"product_id"	INTEGER,
	"approved_at"	TEXT,
	"rejected_at"	TEXT,
	"rejection_reason"	TEXT,
	"admin_help_requested_at"	TEXT,
	"admin_help_reason"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("assignee_id") REFERENCES "users"("id"),
	FOREIGN KEY("bot_conversation_id") REFERENCES "bot_conversations"("id"),
	FOREIGN KEY("customer_id") REFERENCES "users"("id"),
	FOREIGN KEY("product_id") REFERENCES "products"("id")
);
CREATE TABLE IF NOT EXISTS "users" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL,
	"email"	TEXT NOT NULL UNIQUE COLLATE NOCASE,
	"password_hash"	TEXT NOT NULL,
	"role"	TEXT NOT NULL CHECK("role" IN ('customer', 'it', 'admin')),
	"company"	TEXT,
	"title"	TEXT,
	"active"	INTEGER NOT NULL DEFAULT 1,
	"created_at"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT)
);
INSERT INTO "activity" VALUES (1,1,5,'created',NULL,'open',NULL,'2026-11-04T01:24:33.051Z');
INSERT INTO "activity" VALUES (2,2,6,'created',NULL,'open',NULL,'2026-11-02T21:24:33.082Z');
INSERT INTO "activity" VALUES (3,2,6,'assistant',NULL,NULL,NULL,'2026-11-02T21:26:33.082Z');
INSERT INTO "activity" VALUES (4,2,1,'assigned',NULL,'Alex Rivera',NULL,'2026-11-02T21:26:33.082Z');
INSERT INTO "activity" VALUES (5,2,2,'status','open','in_progress',NULL,'2026-11-02T22:54:33.082Z');
INSERT INTO "activity" VALUES (6,3,7,'created',NULL,'open',NULL,'2026-10-31T04:24:33.160Z');
INSERT INTO "activity" VALUES (7,3,1,'assigned',NULL,'Priya Nair',NULL,'2026-10-31T04:26:33.160Z');
INSERT INTO "activity" VALUES (8,3,3,'status','open','in_progress',NULL,'2026-10-31T09:24:33.160Z');
INSERT INTO "activity" VALUES (9,3,3,'status','in_progress','resolved',NULL,'2026-11-01T00:24:33.160Z');
INSERT INTO "activity" VALUES (10,3,7,'rated',NULL,'5',NULL,'2026-11-01T04:24:33.160Z');
INSERT INTO "activity" VALUES (11,4,5,'created',NULL,'open',NULL,'2026-11-02T04:24:33.230Z');
INSERT INTO "activity" VALUES (12,4,1,'assigned',NULL,'Priya Nair',NULL,'2026-11-02T04:26:33.230Z');
INSERT INTO "activity" VALUES (13,4,3,'status','open','in_progress',NULL,'2026-11-02T05:04:33.230Z');
INSERT INTO "activity" VALUES (14,4,3,'status','in_progress','waiting_customer',NULL,'2026-11-04T00:24:33.230Z');
INSERT INTO "activity" VALUES (15,5,6,'created',NULL,'open',NULL,'2026-11-03T22:24:33.294Z');
INSERT INTO "activity" VALUES (16,6,7,'created',NULL,'open',NULL,'2026-11-02T04:24:33.321Z');
INSERT INTO "activity" VALUES (17,6,1,'assigned',NULL,'Alex Rivera',NULL,'2026-11-02T04:26:33.321Z');
INSERT INTO "activity" VALUES (18,6,2,'status','open','in_progress',NULL,'2026-11-02T04:49:33.321Z');
INSERT INTO "activity" VALUES (19,6,2,'status','in_progress','resolved',NULL,'2026-11-02T06:49:33.321Z');
INSERT INTO "activity" VALUES (20,6,7,'rated',NULL,'4',NULL,'2026-11-02T07:24:33.321Z');
INSERT INTO "activity" VALUES (21,7,5,'created',NULL,'open',NULL,'2026-11-04T03:59:33.381Z');
INSERT INTO "activity" VALUES (22,8,6,'created',NULL,'open',NULL,'2026-10-29T04:24:33.406Z');
INSERT INTO "activity" VALUES (23,8,1,'assigned',NULL,'Marcus Lee',NULL,'2026-10-29T04:26:33.406Z');
INSERT INTO "activity" VALUES (24,8,4,'status','open','in_progress',NULL,'2026-10-29T06:24:33.406Z');
INSERT INTO "activity" VALUES (25,8,4,'status','in_progress','resolved',NULL,'2026-10-31T06:24:33.406Z');
INSERT INTO "activity" VALUES (26,8,6,'rated',NULL,'3',NULL,'2026-11-01T04:24:33.406Z');
INSERT INTO "activity" VALUES (27,9,7,'created',NULL,'open',NULL,'2026-11-02T04:24:33.471Z');
INSERT INTO "activity" VALUES (28,9,1,'assigned',NULL,'Marcus Lee',NULL,'2026-11-02T04:26:33.471Z');
INSERT INTO "activity" VALUES (29,9,4,'status','open','in_progress',NULL,'2026-11-02T13:24:33.471Z');
INSERT INTO "activity" VALUES (30,10,5,'created',NULL,'open',NULL,'2026-10-23T04:24:33.530Z');
INSERT INTO "activity" VALUES (31,10,1,'assigned',NULL,'Priya Nair',NULL,'2026-10-23T04:26:33.530Z');
INSERT INTO "activity" VALUES (32,10,3,'status','open','in_progress',NULL,'2026-10-23T07:24:33.530Z');
INSERT INTO "activity" VALUES (33,10,3,'status','in_progress','resolved',NULL,'2026-10-24T04:24:33.530Z');
INSERT INTO "activity" VALUES (34,10,5,'rated',NULL,'5',NULL,'2026-10-26T03:44:33.530Z');
INSERT INTO "activity" VALUES (35,11,6,'created',NULL,'open',NULL,'2026-10-17T04:24:33.586Z');
INSERT INTO "activity" VALUES (36,11,1,'assigned',NULL,'Alex Rivera',NULL,'2026-10-17T04:26:33.586Z');
INSERT INTO "activity" VALUES (37,11,2,'status','open','in_progress',NULL,'2026-10-17T10:24:33.586Z');
INSERT INTO "activity" VALUES (38,11,2,'status','in_progress','resolved',NULL,'2026-10-20T04:24:33.586Z');
INSERT INTO "activity" VALUES (39,11,2,'status','resolved','closed',NULL,'2026-10-22T04:24:33.586Z');
INSERT INTO "activity" VALUES (40,11,6,'rated',NULL,'2',NULL,'2026-10-22T16:24:33.586Z');
INSERT INTO "activity" VALUES (41,12,7,'created',NULL,'open',NULL,'2026-11-02T22:24:33.657Z');
INSERT INTO "activity" VALUES (42,12,1,'assigned',NULL,'Alex Rivera',NULL,'2026-11-02T22:26:33.657Z');
INSERT INTO "activity" VALUES (43,12,2,'status','open','in_progress',NULL,'2026-11-03T01:24:33.657Z');
INSERT INTO "activity" VALUES (44,13,5,'created',NULL,'open',NULL,'2026-11-04T00:24:33.712Z');
INSERT INTO "activity" VALUES (45,13,1,'assigned',NULL,'Priya Nair',NULL,'2026-11-04T00:26:33.712Z');
INSERT INTO "activity" VALUES (46,13,3,'status','open','in_progress',NULL,'2026-11-04T00:54:33.712Z');
INSERT INTO "activity" VALUES (47,14,6,'created',NULL,'open',NULL,'2026-11-02T04:24:33.767Z');
INSERT INTO "activity" VALUES (48,14,1,'assigned',NULL,'Marcus Lee',NULL,'2026-11-02T04:26:33.767Z');
INSERT INTO "activity" VALUES (49,14,4,'status','open','in_progress',NULL,'2026-11-02T05:09:33.767Z');
INSERT INTO "activity" VALUES (50,14,4,'status','in_progress','waiting_customer',NULL,'2026-11-03T23:44:33.767Z');
INSERT INTO "activity" VALUES (51,15,7,'created',NULL,'open',NULL,'2026-10-27T04:24:33.828Z');
INSERT INTO "activity" VALUES (52,15,1,'assigned',NULL,'Priya Nair',NULL,'2026-10-27T04:26:33.828Z');
INSERT INTO "activity" VALUES (53,15,3,'status','open','in_progress',NULL,'2026-10-27T08:24:33.828Z');
INSERT INTO "activity" VALUES (54,15,3,'status','in_progress','resolved',NULL,'2026-10-28T10:24:33.828Z');
INSERT INTO "activity" VALUES (55,15,7,'rated',NULL,'4',NULL,'2026-10-28T22:24:33.828Z');
INSERT INTO "activity" VALUES (56,16,5,'created',NULL,'open',NULL,'2026-10-26T04:24:33.897Z');
INSERT INTO "activity" VALUES (57,16,1,'assigned',NULL,'Alex Rivera',NULL,'2026-10-26T04:26:33.897Z');
INSERT INTO "activity" VALUES (58,16,2,'status','open','in_progress',NULL,'2026-10-26T06:24:33.897Z');
INSERT INTO "activity" VALUES (59,16,2,'status','in_progress','resolved',NULL,'2026-10-26T10:24:33.897Z');
INSERT INTO "activity" VALUES (60,16,5,'rated',NULL,'5',NULL,'2026-10-26T20:24:33.897Z');
INSERT INTO "activity" VALUES (61,17,6,'created',NULL,'open',NULL,'2026-10-30T04:24:33.951Z');
INSERT INTO "activity" VALUES (62,17,1,'assigned',NULL,'Marcus Lee',NULL,'2026-10-30T04:26:33.951Z');
INSERT INTO "activity" VALUES (63,17,4,'status','open','in_progress',NULL,'2026-10-30T05:24:33.951Z');
INSERT INTO "activity" VALUES (64,17,4,'status','in_progress','resolved',NULL,'2026-10-30T10:44:33.951Z');
INSERT INTO "activity" VALUES (65,17,6,'rated',NULL,'5',NULL,'2026-10-30T12:44:33.951Z');
INSERT INTO "activity" VALUES (66,18,7,'created',NULL,'open',NULL,'2026-10-22T04:24:34.013Z');
INSERT INTO "activity" VALUES (67,18,1,'assigned',NULL,'Priya Nair',NULL,'2026-10-22T04:26:34.013Z');
INSERT INTO "activity" VALUES (68,18,3,'status','open','in_progress',NULL,'2026-10-22T09:24:34.013Z');
INSERT INTO "activity" VALUES (69,18,3,'status','in_progress','resolved',NULL,'2026-10-22T18:24:34.013Z');
INSERT INTO "activity" VALUES (70,18,3,'status','resolved','closed',NULL,'2026-10-27T04:24:34.013Z');
INSERT INTO "activity" VALUES (71,18,7,'rated',NULL,'4',NULL,'2026-10-27T13:04:34.013Z');
INSERT INTO "activity" VALUES (72,19,5,'created',NULL,'open',NULL,'2026-10-24T04:24:34.078Z');
INSERT INTO "activity" VALUES (73,19,1,'assigned',NULL,'Alex Rivera',NULL,'2026-10-24T04:26:34.078Z');
INSERT INTO "activity" VALUES (74,19,2,'status','open','in_progress',NULL,'2026-10-24T05:54:34.078Z');
INSERT INTO "activity" VALUES (75,19,2,'status','in_progress','resolved',NULL,'2026-10-24T09:24:34.078Z');
INSERT INTO "activity" VALUES (76,19,5,'rated',NULL,'4',NULL,'2026-10-24T18:24:34.078Z');
INSERT INTO "activity" VALUES (77,20,6,'created',NULL,'open',NULL,'2026-11-03T18:24:34.143Z');
INSERT INTO "activity" VALUES (78,21,7,'created',NULL,'open',NULL,'2026-10-15T04:24:34.170Z');
INSERT INTO "activity" VALUES (79,21,1,'assigned',NULL,'Marcus Lee',NULL,'2026-10-15T04:26:34.170Z');
INSERT INTO "activity" VALUES (80,21,4,'status','open','in_progress',NULL,'2026-10-16T00:24:34.170Z');
INSERT INTO "activity" VALUES (81,21,4,'status','in_progress','resolved',NULL,'2026-10-17T04:24:34.170Z');
INSERT INTO "activity" VALUES (82,21,4,'status','resolved','closed',NULL,'2026-10-18T04:24:34.170Z');
INSERT INTO "activity" VALUES (83,21,7,'rated',NULL,'5',NULL,'2026-10-19T04:24:34.170Z');
INSERT INTO "activity" VALUES (84,22,5,'created',NULL,'open',NULL,'2026-11-04T03:24:34.232Z');
INSERT INTO "activity" VALUES (85,23,5,'created',NULL,'open',NULL,'2026-11-05T00:53:52.275Z');
INSERT INTO "activity" VALUES (86,23,5,'assistant',NULL,NULL,NULL,'2026-11-05T00:53:52.275Z');
INSERT INTO "activity" VALUES (87,23,1,'assigned',NULL,'Alex Rivera',NULL,'2026-11-05T00:54:27.477Z');
INSERT INTO "activity" VALUES (88,23,1,'assigned','2','Marcus Lee',NULL,'2026-11-05T00:54:28.700Z');
INSERT INTO "activity" VALUES (89,23,1,'assigned','4','Priya Nair',NULL,'2026-11-05T00:54:30.195Z');
INSERT INTO "activity" VALUES (90,23,1,'priority','normal','high',NULL,'2026-11-05T00:54:32.707Z');
INSERT INTO "activity" VALUES (91,23,1,'status','open','in_progress',NULL,'2026-11-05T00:54:34.908Z');
INSERT INTO "activity" VALUES (92,23,1,'assigned','3','Alex Rivera',NULL,'2026-11-05T05:18:28.451Z');
INSERT INTO "activity" VALUES (95,25,11,'created',NULL,'open',NULL,'2026-11-05T05:42:58.654Z');
INSERT INTO "activity" VALUES (96,25,11,'assistant',NULL,NULL,NULL,'2026-11-05T05:42:58.654Z');
INSERT INTO "activity" VALUES (97,25,1,'status','open','in_progress',NULL,'2026-11-05T05:43:33.379Z');
INSERT INTO "activity" VALUES (98,25,1,'status','in_progress','open',NULL,'2026-11-05T05:43:34.874Z');
INSERT INTO "activity" VALUES (99,25,1,'assigned',NULL,'Alex Rivera',NULL,'2026-11-05T05:43:38.642Z');
INSERT INTO "activity" VALUES (100,25,1,'status','open','in_progress',NULL,'2026-11-05T05:44:01.337Z');
INSERT INTO "activity" VALUES (101,25,2,'status','in_progress','open',NULL,'2026-11-05T05:46:38.587Z');
INSERT INTO "activity" VALUES (102,25,2,'status','open','waiting_customer',NULL,'2026-11-05T05:46:44.163Z');
INSERT INTO "activity" VALUES (103,25,1,'status','waiting_customer','in_progress',NULL,'2026-11-05T06:05:55.897Z');
INSERT INTO "activity" VALUES (104,25,1,'assigned','2','Marcus Lee',NULL,'2026-11-05T06:05:58.550Z');
INSERT INTO "activity" VALUES (105,25,1,'assigned','4','Alex Rivera',NULL,'2026-11-05T06:06:00.883Z');
INSERT INTO "activity" VALUES (129,16,5,'status','resolved','closed',NULL,'2026-11-05T06:57:23.816Z');
INSERT INTO "activity" VALUES (130,25,2,'product',NULL,'VendiX POS',NULL,'2026-11-05T07:30:13.691Z');
INSERT INTO "activity" VALUES (131,37,5,'created',NULL,'open',NULL,'2026-11-05T09:02:43.607Z');
INSERT INTO "activity" VALUES (132,37,5,'product',NULL,'VendiX POS',NULL,'2026-11-05T09:02:43.607Z');
INSERT INTO "activity" VALUES (133,37,5,'assigned',NULL,'Priya Nair',NULL,'2026-11-05T09:02:43.607Z');
INSERT INTO "activity" VALUES (134,37,5,'product','VendiX POS','NenPOS',NULL,'2026-11-07T01:45:32.240Z');
INSERT INTO "activity" VALUES (135,37,5,'product','NenPOS','Eduvia',NULL,'2026-11-07T01:45:35.904Z');
INSERT INTO "activity" VALUES (138,23,2,'status','in_progress','resolved',NULL,'2026-11-07T01:54:09.023Z');
INSERT INTO "activity" VALUES (139,23,2,'status','resolved','in_progress',NULL,'2026-11-07T02:01:04.794Z');
INSERT INTO "activity" VALUES (140,23,2,'reopened','resolved','in_progress',NULL,'2026-11-07T02:01:04.793Z');
INSERT INTO "activity" VALUES (141,23,2,'status','in_progress','resolved',NULL,'2026-11-07T02:01:48.317Z');
INSERT INTO "activity" VALUES (142,23,5,'reopened','resolved','open',NULL,'2026-11-07T02:02:30.854Z');
INSERT INTO "activity" VALUES (143,23,5,'status','resolved','open',NULL,'2026-11-07T02:02:30.858Z');
INSERT INTO "activity" VALUES (144,23,2,'status','open','resolved',NULL,'2026-11-07T02:06:09.935Z');
INSERT INTO "activity" VALUES (145,23,5,'reopened','resolved','open',NULL,'2026-11-07T02:06:41.262Z');
INSERT INTO "activity" VALUES (146,23,5,'status','resolved','open',NULL,'2026-11-07T02:06:41.265Z');
INSERT INTO "activity" VALUES (147,23,2,'status','open','resolved',NULL,'2026-11-07T02:10:44.263Z');
INSERT INTO "activity" VALUES (156,23,5,'rejected','resolved','in_progress','Error','2026-11-07T02:16:33.366Z');
INSERT INTO "activity" VALUES (157,23,2,'status','in_progress','resolved',NULL,'2026-11-07T02:17:24.527Z');
INSERT INTO "activity" VALUES (158,23,5,'rejected','resolved','in_progress','All','2026-11-07T02:18:16.022Z');
INSERT INTO "activity" VALUES (159,23,2,'status','in_progress','resolved',NULL,'2026-11-07T02:18:59.295Z');
INSERT INTO "activity" VALUES (160,23,5,'approved','resolved','closed',NULL,'2026-11-07T02:19:17.461Z');
INSERT INTO "activity" VALUES (161,23,5,'rated',NULL,'5','So Good','2026-11-07T02:19:22.941Z');
INSERT INTO "activity" VALUES (176,25,2,'admin_help',NULL,NULL,'Hey','2026-11-07T02:40:55.342Z');
INSERT INTO "activity" VALUES (231,166,5,'created',NULL,'open',NULL,'2026-11-09T06:14:17.774Z');
INSERT INTO "activity" VALUES (232,166,5,'product',NULL,'VendiX POS',NULL,'2026-11-09T06:14:17.774Z');
INSERT INTO "activity" VALUES (233,166,5,'assigned',NULL,'Marcus Lee',NULL,'2026-11-09T06:14:17.774Z');
INSERT INTO "activity" VALUES (234,166,1,'assigned','4','Alex Rivera',NULL,'2026-11-09T06:14:46.283Z');
INSERT INTO "agent_devices" VALUES (12,11,'DESKTOP-R8VBO89','windows','1.0.6','ed1503fda0670cc68b2d9bf1924915ac80e19134be56dc01021b4b65d03d7dbf','2026-11-11T01:47:01.275Z','2026-11-11T08:22:12.873Z',NULL,0,NULL,'2026-11-11T03:10:51.387Z');
INSERT INTO "agent_devices" VALUES (64,5,'DESKTOP-NB9CLIC','windows','1.0.6','1c1aa541e133b468868cff4644d1c8c5eb58a9d6bdc68fa2ea079a45471578c7','2026-11-11T03:47:34.917Z','2026-11-11T03:56:14.996Z','2026-11-11T03:57:18.523Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (83,5,'DESKTOP-6DPLF77','windows','1.0.6','00421a6a1fbe718b23f1d7919776a1e5401336f90b88477003241ea5f0b41e3a','2026-11-11T03:57:44.939Z','2026-11-11T03:59:09.434Z','2026-11-11T03:59:09.440Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (86,5,'Customer workstation','windows','1.0.0','f889b1c909079cb26d45d2b633e083253bb916f08675fc6e8a7b3bc7a3f314ed','2026-11-11T04:09:04.664Z','2026-11-11T04:09:04.731Z','2026-11-11T04:56:26.753Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (87,5,'Customer PC','windows','1.0.0','6eb3b4a9061e3493ace828ff73bb6eac2e504b98ae9bc20779125379e36b5555','2026-11-11T04:09:04.756Z','2026-11-11T04:09:04.824Z','2026-11-11T04:09:04.829Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (88,6,'Someone else''s PC','windows','1.0.0','ea904d7a9923ecf8e0f761e63265ec06857036f3e6ea1da7218d7c7e70e1da0d','2026-11-11T04:09:04.767Z','2026-11-11T04:09:04.780Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (92,5,'DESKTOP-6DPLF77','windows','1.0.6','e126c6a08ce07e673de5cb61fbe942a3fa2b2bbdd484d809cbad909e1240ac66','2026-11-11T04:57:09.174Z','2026-11-11T04:57:23.415Z','2026-11-11T04:57:23.420Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (93,5,'DESKTOP-6DPLF77','windows','1.0.6','409a1c582c982e6bc5da6f657c4527ce4861383416a375cfbd8f329c4e84d367','2026-11-11T05:04:51.490Z','2026-11-11T08:22:10.276Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (94,5,'Customer workstation','windows','1.0.0','3bd4fe902af290663b21143cf2e98bbe4336109aa29ff1e0e909cd0f54ca6d87','2026-11-11T05:11:30.046Z','2026-11-11T05:11:30.135Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (97,5,'Customer PC','windows','1.0.0','0d8758bfa2497da1779a9cd794d333e541058af30419462c3d3b0388d9f28574','2026-11-11T05:11:30.160Z','2026-11-11T05:11:30.305Z','2026-11-11T05:11:30.310Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (98,6,'Someone else''s PC','windows','1.0.0','49296da193cfc427ab729be88dcb7b6d168996230f8a76e0b0a5f456c71446dd','2026-11-11T05:11:30.182Z','2026-11-11T05:11:30.250Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (106,5,'Customer workstation','windows','1.0.0','d7c2f7ba943d90726c3a6f297b70ef0a719b5a2986fcdae5d3f124c74ff35453','2026-11-11T05:11:42.079Z','2026-11-11T05:11:42.144Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (107,5,'Customer PC','windows','1.0.0','157210f42d6ca3b95bc273efe2b10046bf2f19d6574987d1800af5c48feab10a','2026-11-11T05:11:42.169Z','2026-11-11T05:11:42.243Z','2026-11-11T05:11:42.248Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (108,6,'Someone else''s PC','windows','1.0.0','572517b082a6e37258054229f7f6782edd1825737820b25cc7749ce3f7e387f8','2026-11-11T05:11:42.187Z','2026-11-11T05:11:42.200Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (114,5,'Customer workstation','windows','1.0.0','c3f9a8b4f62e7c8a45a34abc6f32dcd986d5e326bfb837753e15d1ac38276e30','2026-11-11T05:11:46.388Z','2026-11-11T05:11:46.461Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (115,5,'Customer PC','windows','1.0.0','b59fa7532907fff91bc63e80fb454c5486220d9a843cca818906955597532135','2026-11-11T05:11:46.485Z','2026-11-11T05:11:46.551Z','2026-11-11T05:11:46.555Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (116,6,'Someone else''s PC','windows','1.0.0','9e1a083a841e4e3b01a3b831bab7f39a2495ace31191eef1a94af4d587601d32','2026-11-11T05:11:46.495Z','2026-11-11T05:11:46.507Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (122,5,'Customer workstation','windows','1.0.0','c69429445329d584fc754434f4f1da3c75c62adab326b7d845b187f9070b8171','2026-11-11T05:11:51.544Z','2026-11-11T05:11:51.608Z',NULL,0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (123,5,'Customer PC','windows','1.0.0','d1528a8ebd5728ef67f955fe871311b3977be60a05bac18afc9b6fa839b1a74a','2026-11-11T05:11:51.633Z','2026-11-11T05:11:51.720Z','2026-11-11T05:11:51.725Z',0,NULL,NULL);
INSERT INTO "agent_devices" VALUES (124,6,'Someone else''s PC','windows','1.0.0','42421c099dfa5c58f551df73584ca05a6c00db9e25d1c7fa73d9211ea812c7cd','2026-11-11T05:11:51.644Z','2026-11-11T05:11:51.655Z',NULL,0,NULL,NULL);
INSERT INTO "agent_pairing_codes" VALUES (1,5,'c0091931c5e8b4d07369e82d832c7bc42be41a25d22a159c5451aadb07686bb8','2026-11-09T08:39:39.995Z','2026-11-09T08:49:39.996Z','2026-11-09T08:39:40.004Z');
INSERT INTO "agent_pairing_codes" VALUES (2,5,'acb036336b3c684a32ca0e5f4234440a514310248cca2e22543fc87fa6a5472e','2026-11-09T08:39:40.086Z','2026-11-09T08:49:40.086Z','2026-11-09T08:39:40.092Z');
INSERT INTO "agent_pairing_codes" VALUES (3,6,'9c2735b85f5e017d365b28ccb3a64b221be88240ae01f23e1aa27762ac2b4778','2026-11-09T08:39:40.097Z','2026-11-09T08:49:40.097Z','2026-11-09T08:39:40.103Z');
INSERT INTO "agent_pairing_codes" VALUES (4,5,'db1bc56308e113ae46a1a0a6eac9b6b90141ff5ea35739837bf9af0ae81be5d3','2026-11-09T08:41:41.824Z','2026-11-09T08:51:41.824Z','2026-11-09T08:42:30.321Z');
INSERT INTO "agent_pairing_codes" VALUES (5,5,'d971f0e1640e660e86418f7ecc01fefa29fd915d00246d1f598690757fbc5fdd','2026-11-09T08:42:30.321Z','2026-11-09T08:52:30.326Z','2026-11-09T08:43:31.791Z');
INSERT INTO "agent_pairing_codes" VALUES (6,5,'c0f576d08953450d718e39535d4bfaaa0fcfad5590c26eb4786dfd6a82792ebc','2026-11-09T08:43:31.791Z','2026-11-09T08:53:31.797Z','2026-11-09T08:43:32.027Z');
INSERT INTO "agent_pairing_codes" VALUES (7,5,'fc0b9e42c705e9a5ccac1e2d93fd2cb43e306c6bbb0d0b95e78c5c63e79feccf','2026-11-09T08:48:33.413Z','2026-11-09T08:58:33.413Z','2026-11-09T08:48:33.420Z');
INSERT INTO "agent_pairing_codes" VALUES (8,5,'f043b3b815e8ed999da3d2c7b9d37ed4ae6ea287c58175690e0270188e1c33e7','2026-11-09T08:48:33.516Z','2026-11-09T08:58:33.516Z','2026-11-09T08:48:33.523Z');
INSERT INTO "agent_pairing_codes" VALUES (9,6,'81eed0216e1ea997f58715f31b325c7fab7d45301a80055ce87ecbe76a122f91','2026-11-09T08:48:33.528Z','2026-11-09T08:58:33.528Z','2026-11-09T08:48:33.534Z');
INSERT INTO "agent_pairing_codes" VALUES (10,5,'f64de91156f0afc82540457c37c76ab590ebe8772fb8a9ca15af5698c6e6ef0c','2026-11-09T08:54:15.879Z','2026-11-09T09:04:15.879Z','2026-11-09T08:54:16.317Z');
INSERT INTO "agent_pairing_codes" VALUES (11,5,'f092988e8f25cd2a00fbab451733f93da3a87cf0688402d1e2809dc6f5b7ffb1','2026-11-09T09:10:42.516Z','2026-11-09T09:20:42.517Z','2026-11-09T09:10:42.523Z');
INSERT INTO "agent_pairing_codes" VALUES (12,5,'0c0ac5b82dad77895bd8bd13564a597146f849502343d3ee818494b04d03b7f9','2026-11-09T09:10:42.611Z','2026-11-09T09:20:42.611Z','2026-11-09T09:10:42.616Z');
INSERT INTO "agent_pairing_codes" VALUES (13,6,'a50bc60fdb7a62cad101a5490edff0f902195f8002522bab0946b8b09f4e703c','2026-11-09T09:10:42.622Z','2026-11-09T09:20:42.622Z','2026-11-09T09:10:42.627Z');
INSERT INTO "agent_pairing_codes" VALUES (14,5,'eeb69570ae964bbb5206c0206e3262b582ad3405363ca84a84535113f9fbd26c','2026-11-11T01:16:20.895Z','2026-11-11T01:26:20.896Z','2026-11-11T01:42:55.342Z');
INSERT INTO "agent_pairing_codes" VALUES (15,5,'8b8a26918adae7c1583a854a0ae27a3fd801f5c536f82111ab3c4355bfb06d37','2026-11-11T01:42:55.342Z','2026-11-11T01:52:55.347Z','2026-11-11T01:43:09.225Z');
INSERT INTO "agent_pairing_codes" VALUES (16,5,'4e2c024e39f2e3b131a2ab0835e1ff9498cab8d5a01d1af7f7ac293435d16b2c','2026-11-11T01:43:09.225Z','2026-11-11T01:53:09.230Z','2026-11-11T01:49:44.891Z');
INSERT INTO "agent_pairing_codes" VALUES (17,11,'f304da7c3fd216356cd2d8bd65ea9ba9260f7ac0aa45023545aaaefec8f67423','2026-11-11T01:46:40.740Z','2026-11-11T01:56:40.740Z','2026-11-11T01:47:01.275Z');
INSERT INTO "agent_pairing_codes" VALUES (18,5,'ce3099a2c0c37aff13f4c518879edec5fa948174346a356c33bda6f7134728ba','2026-11-11T01:49:44.891Z','2026-11-11T01:59:44.896Z','2026-11-11T01:50:23.326Z');
INSERT INTO "agent_pairing_codes" VALUES (19,5,'8ad4aa2a19674a5b45cf59099abcfce51d443b69b7e2569e0701b7b52e05c178','2026-11-11T01:51:35.713Z','2026-11-11T02:01:35.713Z','2026-11-11T01:51:45.158Z');
INSERT INTO "agent_pairing_codes" VALUES (20,5,'8942b0be6fe6cd7c40025b526423a01af422601a73b18fd6e4f40361e40d5130','2026-11-11T02:41:51.314Z','2026-11-11T02:51:51.315Z','2026-11-11T02:41:51.322Z');
INSERT INTO "agent_pairing_codes" VALUES (21,5,'5839f92aac9bbc0a5db20f96a59e3b685fe1bc3498b767c1886dd73f11822fa6','2026-11-11T02:41:51.400Z','2026-11-11T02:51:51.400Z','2026-11-11T02:41:51.406Z');
INSERT INTO "agent_pairing_codes" VALUES (22,6,'e5f5b71340b4ddb9bd9a1e57a2bb7ad5275e3196e54e4935bd113a9d1fbe1031','2026-11-11T02:41:51.411Z','2026-11-11T02:51:51.411Z','2026-11-11T02:41:51.416Z');
INSERT INTO "agent_pairing_codes" VALUES (23,5,'e0d2c14d603023bdee3e01b7e4fb253e644571fb55af9f684ba127a224bc603a','2026-11-11T02:41:51.486Z','2026-11-11T02:51:51.486Z','2026-11-11T02:41:51.491Z');
INSERT INTO "agent_pairing_codes" VALUES (24,5,'8ea513ed4470ddda6988f3c14c3b5ca6875a8c3b6edcc428eea326dd270b6c04','2026-11-11T02:42:07.765Z','2026-11-11T02:52:07.766Z','2026-11-11T02:42:07.777Z');
INSERT INTO "agent_pairing_codes" VALUES (25,5,'bae1b53b4afb3d25c35001ae25ae02ccf2f3db722094e5743a100ec976a1b25b','2026-11-11T02:42:07.856Z','2026-11-11T02:52:07.856Z','2026-11-11T02:42:07.862Z');
INSERT INTO "agent_pairing_codes" VALUES (26,6,'08ff7ca57ffc7ef823c931659891eee4049a5b75e4c3b921062cb996818f3a4a','2026-11-11T02:42:07.868Z','2026-11-11T02:52:07.868Z','2026-11-11T02:42:07.873Z');
INSERT INTO "agent_pairing_codes" VALUES (27,5,'33005a0f0d385f0b93c0bca268227793ae180012b647c65428a791ab5ba5d294','2026-11-11T02:42:07.952Z','2026-11-11T02:52:07.952Z','2026-11-11T02:42:07.957Z');
INSERT INTO "agent_pairing_codes" VALUES (28,5,'b5c142c6728feda3f3e15af08af8ff398d9d9450f3ccc03eff4b78702c0933a6','2026-11-11T02:42:08.258Z','2026-11-11T02:52:08.258Z','2026-11-11T02:42:08.264Z');
INSERT INTO "agent_pairing_codes" VALUES (29,5,'ad7d12ab696ea2d6b3a5a954ac6c2a9ba100ec8dff563de96d9252016eb8a9ef','2026-11-11T02:44:33.367Z','2026-11-11T02:54:33.368Z','2026-11-11T02:44:33.374Z');
INSERT INTO "agent_pairing_codes" VALUES (30,5,'89b3b629a8ea3723bc0b9afefe60936e75311109e2aa3ef39bcc945e0728f35c','2026-11-11T02:44:33.472Z','2026-11-11T02:54:33.472Z','2026-11-11T02:44:33.477Z');
INSERT INTO "agent_pairing_codes" VALUES (31,6,'51cdff227743ff7c791e89ff395f75235cee2ec6bccb51a845a77bf94d2071d0','2026-11-11T02:44:33.482Z','2026-11-11T02:54:33.482Z','2026-11-11T02:44:33.488Z');
INSERT INTO "agent_pairing_codes" VALUES (32,5,'e6620d64fddc7517cd3c95ff431a2633255264a66158a573b6d1bd81b1cd940f','2026-11-11T02:44:33.589Z','2026-11-11T02:54:33.589Z','2026-11-11T02:44:33.594Z');
INSERT INTO "agent_pairing_codes" VALUES (33,5,'a8ffe5a12fb399e69027c05ee3d7b5e6c104f6518fc08fc4bc612ff70f5c8ac4','2026-11-11T02:44:34.098Z','2026-11-11T02:54:34.098Z','2026-11-11T02:44:34.104Z');
INSERT INTO "agent_pairing_codes" VALUES (34,5,'9dccc0051a8eed5345188b0be537af4f74c05cadf195165b2889906407006fed','2026-11-11T02:45:46.542Z','2026-11-11T02:55:46.543Z','2026-11-11T02:45:46.549Z');
INSERT INTO "agent_pairing_codes" VALUES (35,5,'d38795a34a173e3d08159d4a2d498510bb03f016d781a1bb240d7b3d6b16a012','2026-11-11T02:45:46.632Z','2026-11-11T02:55:46.633Z','2026-11-11T02:45:46.638Z');
INSERT INTO "agent_pairing_codes" VALUES (36,6,'ac52f0e1a3312f656557446713bd3bad8ce5d64a4b29212f0f9ab2f58a686225','2026-11-11T02:45:46.643Z','2026-11-11T02:55:46.643Z','2026-11-11T02:45:46.650Z');
INSERT INTO "agent_pairing_codes" VALUES (37,5,'e72981dd1feb28c3967ce317c11593d3f11e8691a7e69ec3c41829731a49436d','2026-11-11T02:45:46.723Z','2026-11-11T02:55:46.723Z','2026-11-11T02:45:46.728Z');
INSERT INTO "agent_pairing_codes" VALUES (38,5,'a36748e20eafc11d3f761a3af7f501d028fb0cbc880d2776443c93b2b14f2f83','2026-11-11T02:45:47.051Z','2026-11-11T02:55:47.051Z','2026-11-11T02:45:47.057Z');
INSERT INTO "agent_pairing_codes" VALUES (39,5,'f6bc77f9b136fc406ce9826060b49d2b80670c1af581518f2587eb3b6707b239','2026-11-11T03:05:01.041Z','2026-11-11T03:15:01.046Z','2026-11-11T03:05:01.052Z');
INSERT INTO "agent_pairing_codes" VALUES (40,5,'e63c7d7cb2879a529105aad9696e6c7657a2fe1d5ed7b1518e1f48bb1eb30505','2026-11-11T03:05:01.143Z','2026-11-11T03:15:01.143Z','2026-11-11T03:05:01.154Z');
INSERT INTO "agent_pairing_codes" VALUES (41,6,'99206acc1156a0dff78f42c91932716c7139931a36b517b96c689faade9c6897','2026-11-11T03:05:01.160Z','2026-11-11T03:15:01.160Z','2026-11-11T03:05:01.166Z');
INSERT INTO "agent_pairing_codes" VALUES (42,5,'35299d7266549a1f44844bdffd399239fcc53444de5b312438463f48f2024980','2026-11-11T03:05:01.259Z','2026-11-11T03:15:01.272Z','2026-11-11T03:05:01.278Z');
INSERT INTO "agent_pairing_codes" VALUES (43,5,'54df2f7b5cd53352e3d6bbaefa514867b2b491e570080b46056cb6e5cf410926','2026-11-11T03:05:01.683Z','2026-11-11T03:15:01.683Z','2026-11-11T03:05:01.689Z');
INSERT INTO "agent_pairing_codes" VALUES (44,5,'ab32a4a7f226bbbb820d96a034dbf4686b58250f269f3d660a6dc346bee2ea88','2026-11-11T03:05:02.100Z','2026-11-11T03:15:02.100Z','2026-11-11T03:05:02.105Z');
INSERT INTO "agent_pairing_codes" VALUES (45,5,'5be4c302342ce6712f9957ff6f56fe0f2d3ddb5248ff8b4152b7d3b4540432b8','2026-11-11T03:05:52.848Z','2026-11-11T03:15:52.848Z','2026-11-11T03:05:52.855Z');
INSERT INTO "agent_pairing_codes" VALUES (46,5,'50d976b5360104e6b74029660cc0ec0bb5e9053a487825af053e61be9d9ff817','2026-11-11T03:05:52.936Z','2026-11-11T03:15:52.936Z','2026-11-11T03:05:52.941Z');
INSERT INTO "agent_pairing_codes" VALUES (47,6,'479139597bd6d463b19371e17fd945e828f6bc58c908cac26b21024ae8368bbc','2026-11-11T03:05:52.946Z','2026-11-11T03:15:52.946Z','2026-11-11T03:05:52.952Z');
INSERT INTO "agent_pairing_codes" VALUES (48,5,'20ac1863f5b97d750f0babd36e7da6cb2d65ce960369cc44270d743a66fe8a99','2026-11-11T03:05:53.026Z','2026-11-11T03:15:53.026Z','2026-11-11T03:05:53.031Z');
INSERT INTO "agent_pairing_codes" VALUES (49,5,'bddf0acdc098e516b67f8336025656598ded28d6c27e058c8c9dc1c3e8767f35','2026-11-11T03:05:53.667Z','2026-11-11T03:15:53.667Z','2026-11-11T03:05:53.673Z');
INSERT INTO "agent_pairing_codes" VALUES (50,5,'2f17109b48e0c8d9a355cb7c7071f0b89cdb7e2eea20087a04ddccac876ae7e8','2026-11-11T03:05:54.068Z','2026-11-11T03:15:54.069Z','2026-11-11T03:05:54.074Z');
INSERT INTO "agent_pairing_codes" VALUES (51,5,'f536071477b6a6cff1a23a7c25be866d384a463d1ed3ceb37b9a6830218b7de1','2026-11-11T03:11:27.563Z','2026-11-11T03:21:27.563Z','2026-11-11T03:11:27.577Z');
INSERT INTO "agent_pairing_codes" VALUES (52,5,'19596f8837afabe2f57cb2004475cb611391c1da4e32b555e00ffe575a42d4d9','2026-11-11T03:11:27.703Z','2026-11-11T03:21:27.703Z','2026-11-11T03:11:27.708Z');
INSERT INTO "agent_pairing_codes" VALUES (53,6,'875b3111b81c67eb9c3b817e7091b50677c62e82f6fba36aecad4a6c92d26152','2026-11-11T03:11:27.714Z','2026-11-11T03:21:27.714Z','2026-11-11T03:11:27.719Z');
INSERT INTO "agent_pairing_codes" VALUES (54,5,'87e7bfc14c744e58c433ae61c0ce06ff38266666aa2062b46ccf102cbd20d704','2026-11-11T03:11:27.836Z','2026-11-11T03:21:27.837Z','2026-11-11T03:11:27.842Z');
INSERT INTO "agent_pairing_codes" VALUES (55,5,'8c8a667018ff59a07ecebc419fed6a0f86d96f0d263ead1c7862e1bb2f98a858','2026-11-11T03:11:28.243Z','2026-11-11T03:21:28.243Z','2026-11-11T03:11:28.248Z');
INSERT INTO "agent_pairing_codes" VALUES (56,5,'ead4f968d481e19a21a1dde6958f7af00848355ce3c6b19d43b78ae8eb3275b4','2026-11-11T03:11:28.623Z','2026-11-11T03:21:28.624Z','2026-11-11T03:11:28.629Z');
INSERT INTO "agent_pairing_codes" VALUES (57,5,'945b60d14504c35414eae7c4dc7ce837084ccca91595481ffb96221cd2ca282c','2026-11-11T03:25:26.248Z','2026-11-11T03:35:26.248Z','2026-11-11T03:25:26.255Z');
INSERT INTO "agent_pairing_codes" VALUES (58,5,'551363224d66c8b058fc84b56bec054cdc85df344629488745bb94d0908a6e14','2026-11-11T03:25:26.347Z','2026-11-11T03:35:26.347Z','2026-11-11T03:25:26.352Z');
INSERT INTO "agent_pairing_codes" VALUES (59,6,'e89ff76a651500fc1af68a0dcc98aa68b4dc00ad8a01f01a52e237484c5cb3ec','2026-11-11T03:25:26.358Z','2026-11-11T03:35:26.358Z','2026-11-11T03:25:26.364Z');
INSERT INTO "agent_pairing_codes" VALUES (60,5,'a805fcb90bf4c1278f53e1d31415eefd9c7e01003dd1ff109cdeea6a661b22a1','2026-11-11T03:25:26.435Z','2026-11-11T03:35:26.435Z','2026-11-11T03:25:26.441Z');
INSERT INTO "agent_pairing_codes" VALUES (61,5,'bc766e56f6fef53d8fbb524050b69479efb3777490b72e3457a6d791131a21a4','2026-11-11T03:25:26.918Z','2026-11-11T03:35:26.918Z','2026-11-11T03:25:26.924Z');
INSERT INTO "agent_pairing_codes" VALUES (62,5,'f264c951651487700fbf43f3b2f231bd285538d49f90dec2337e709f0f46d771','2026-11-11T03:25:27.264Z','2026-11-11T03:35:27.264Z','2026-11-11T03:25:27.269Z');
INSERT INTO "agent_pairing_codes" VALUES (63,5,'f5414680af81eaeb9ad782c0c78a1b5c8ee02940f18de28a3e0645eaa613abd9','2026-11-11T03:31:42.907Z','2026-11-11T03:41:42.908Z','2026-11-11T03:31:43.725Z');
INSERT INTO "agent_pairing_codes" VALUES (64,5,'2830ddd13f52d33809893571746a3d4c14503d16ed3e3fc755959e567b89bba9','2026-11-11T03:31:43.725Z','2026-11-11T03:41:43.731Z','2026-11-11T03:31:49.986Z');
INSERT INTO "agent_pairing_codes" VALUES (65,5,'f52d70f2e8b1ff213ee7aeeb0bb5e391d63172ac612f3147abc2fc6dc5dd0eac','2026-11-11T03:31:49.986Z','2026-11-11T03:41:49.991Z','2026-11-11T03:32:25.449Z');
INSERT INTO "agent_pairing_codes" VALUES (66,5,'eef3aa00a30be6a8122d943e58a68d1c31e41ee1a456518e0ba9d167c480978b','2026-11-11T03:32:45.874Z','2026-11-11T03:42:45.874Z','2026-11-11T03:46:32.221Z');
INSERT INTO "agent_pairing_codes" VALUES (67,5,'94bce95e6489f96bd953c8408dc73a8ff558ecb224db5e71c378cf3e55451298','2026-11-11T03:46:32.221Z','2026-11-11T03:56:32.226Z','2026-11-11T03:47:34.917Z');
INSERT INTO "agent_pairing_codes" VALUES (72,5,'89e270b26dbc5803edcacf58e0440cc24e8d5dbbe1ef531017971f791c6d1773','2026-11-11T03:51:22.120Z','2026-11-11T04:01:22.121Z','2026-11-11T03:51:22.127Z');
INSERT INTO "agent_pairing_codes" VALUES (73,5,'61879e8a833cdb7f507772e208c92d49949dbac0ec8cf3872e67203206a80004','2026-11-11T03:51:22.216Z','2026-11-11T04:01:22.216Z','2026-11-11T03:51:22.222Z');
INSERT INTO "agent_pairing_codes" VALUES (74,6,'c66c50b1c00b0f4d69060a642a2b54bd23f8c5271de3c6789a8a00e4d5002d2d','2026-11-11T03:51:22.227Z','2026-11-11T04:01:22.227Z','2026-11-11T03:51:22.232Z');
INSERT INTO "agent_pairing_codes" VALUES (75,5,'c0f890ad3b52cfcad879e4a3004bdd8d73d8a080df9e3e45f62f2b1ccd1f40c3','2026-11-11T03:51:22.304Z','2026-11-11T04:01:22.304Z','2026-11-11T03:51:22.310Z');
INSERT INTO "agent_pairing_codes" VALUES (76,5,'d0af314c377d76398910ab44f1b444727468e69ed4744e7e342852655c9e7e02','2026-11-11T03:51:22.757Z','2026-11-11T04:01:22.757Z','2026-11-11T03:51:22.762Z');
INSERT INTO "agent_pairing_codes" VALUES (77,5,'005ad7b3ae8dadfeb6127c3d78558d4f781cc7275b4d6973edefded2e77ad772','2026-11-11T03:51:23.139Z','2026-11-11T04:01:23.139Z','2026-11-11T03:51:23.146Z');
INSERT INTO "agent_pairing_codes" VALUES (80,5,'344dfbd2a4ba57d94ee3909cc4dc6119f90766ace97da89a03b3a271765bdc25','2026-11-11T03:54:30.736Z','2026-11-11T04:04:30.737Z','2026-11-11T03:54:30.743Z');
INSERT INTO "agent_pairing_codes" VALUES (81,5,'feec99ed1029364089efcb3a4e011fb7165263c820845d50ec14e833235ca9d6','2026-11-11T03:54:30.829Z','2026-11-11T04:04:30.829Z','2026-11-11T03:54:30.834Z');
INSERT INTO "agent_pairing_codes" VALUES (82,6,'0624d2a516d6e53946e65150920fb1caff9daf72e8926ba280179ea146703a24','2026-11-11T03:54:30.840Z','2026-11-11T04:04:30.841Z','2026-11-11T03:54:30.847Z');
INSERT INTO "agent_pairing_codes" VALUES (83,5,'65e51115b42f6ce064ad4bc08eb3b7248e96ad1524a2f28662a01ac178e32719','2026-11-11T03:54:30.922Z','2026-11-11T04:04:30.922Z','2026-11-11T03:54:30.927Z');
INSERT INTO "agent_pairing_codes" VALUES (84,5,'d529ed5e619869d3074f7c69c91b6793a69d2cdc7038bfa2e792fef1acc4af8d','2026-11-11T03:54:31.464Z','2026-11-11T04:04:31.464Z','2026-11-11T03:54:31.469Z');
INSERT INTO "agent_pairing_codes" VALUES (85,5,'88e18376ee25f8924e4905af3f89727d8e8fa7c7b247ca0adf43ae68abc7acbb','2026-11-11T03:54:31.813Z','2026-11-11T04:04:31.813Z','2026-11-11T03:54:31.819Z');
INSERT INTO "agent_pairing_codes" VALUES (86,5,'05b3359bd712a35a95764fcaf8c122a36f29f7f256f16dbae28f6061d5042e2f','2026-11-11T03:57:33.821Z','2026-11-11T04:07:33.822Z','2026-11-11T03:57:44.939Z');
INSERT INTO "agent_pairing_codes" VALUES (89,5,'03a88518cd434cc15a9c7b7848b07b647a512db5056d39fbcedc513901599523','2026-11-11T04:09:04.647Z','2026-11-11T04:19:04.648Z','2026-11-11T04:09:04.664Z');
INSERT INTO "agent_pairing_codes" VALUES (90,5,'34029e8735daade809d5b69da29cf78706c4e118cb34b1479504026344324ba7','2026-11-11T04:09:04.750Z','2026-11-11T04:19:04.750Z','2026-11-11T04:09:04.756Z');
INSERT INTO "agent_pairing_codes" VALUES (91,6,'469059518cb1e729cd81a5a43cd963048904048c32a47f66a3e6e4be65bbb1fc','2026-11-11T04:09:04.761Z','2026-11-11T04:19:04.761Z','2026-11-11T04:09:04.767Z');
INSERT INTO "agent_pairing_codes" VALUES (92,5,'2fd3ca198f6a36987506244a06776b3dd728a2894ce13ccad2440bda37ea3f1e','2026-11-11T04:09:04.840Z','2026-11-11T04:19:04.840Z','2026-11-11T04:09:04.846Z');
INSERT INTO "agent_pairing_codes" VALUES (93,5,'2c69a5ec9d1dec97576d4ae968c6fc67cc06845bb5af702b3cb938a5663b0df5','2026-11-11T04:09:05.286Z','2026-11-11T04:19:05.286Z','2026-11-11T04:09:05.292Z');
INSERT INTO "agent_pairing_codes" VALUES (94,5,'199a5d4281adaaee2bdb4ef7c2f8f494440c1f458fa9cb649229b1769d5999bc','2026-11-11T04:09:05.634Z','2026-11-11T04:19:05.634Z','2026-11-11T04:09:05.639Z');
INSERT INTO "agent_pairing_codes" VALUES (95,5,'e3498713f8f5c9799f7ed3d6171192481754d64b03ab4a785da31881c6f6d9f3','2026-11-11T04:10:20.299Z','2026-11-11T04:20:20.299Z','2026-11-11T04:10:57.218Z');
INSERT INTO "agent_pairing_codes" VALUES (97,5,'e39c277bbb8e8af584c156e23c45d1b5b465cf6349efbf5e219324b41c83e449','2026-11-11T04:57:03.893Z','2026-11-11T05:07:03.893Z','2026-11-11T04:57:09.174Z');
INSERT INTO "agent_pairing_codes" VALUES (98,5,'dad5f5201bd273f2c9592e044c049e00d35f1d46a9ebc1b016a5b512c335bfb0','2026-11-11T04:57:34.450Z','2026-11-11T05:07:34.450Z','2026-11-11T04:57:50.377Z');
INSERT INTO "agent_pairing_codes" VALUES (99,5,'ff0494a05d21c2bf8a255031c23ab58b5561fcd75536112df35657caacf84535','2026-11-11T04:57:50.377Z','2026-11-11T05:07:50.382Z','2026-11-11T05:03:00.044Z');
INSERT INTO "agent_pairing_codes" VALUES (101,5,'033a53939e596affc28f44b06e5b75a08ff2ecc210127d3c7209d66a6b24bb1e','2026-11-11T05:03:58.766Z','2026-11-11T05:13:58.766Z','2026-11-11T05:04:51.490Z');
INSERT INTO "agent_pairing_codes" VALUES (102,5,'81b4df64e9713285ae95b8c687bbc088ea08338dd6d309285b7b92082962f63b','2026-11-11T05:11:30.039Z','2026-11-11T05:21:30.040Z','2026-11-11T05:11:30.046Z');
INSERT INTO "agent_pairing_codes" VALUES (105,5,'5a6904cde85daca0a550ee2768bedb7ced2f9ba15a94fb5e091b21c0e83cbc18','2026-11-11T05:11:30.154Z','2026-11-11T05:21:30.154Z','2026-11-11T05:11:30.160Z');
INSERT INTO "agent_pairing_codes" VALUES (106,6,'7e35a643cdb324753432470df2d465e08d7d16466f8f615314d08ecab982441b','2026-11-11T05:11:30.165Z','2026-11-11T05:21:30.165Z','2026-11-11T05:11:30.182Z');
INSERT INTO "agent_pairing_codes" VALUES (107,5,'08d71199c05df9aed255fa8984a4bf32c9e2476a140fb96bbe237ef6d8d021d4','2026-11-11T05:11:30.322Z','2026-11-11T05:21:30.323Z','2026-11-11T05:11:30.330Z');
INSERT INTO "agent_pairing_codes" VALUES (108,5,'66ddd1b0327274cae8b950cf0caae5629f4d8b4b498a637b3308357c31b80212','2026-11-11T05:11:30.834Z','2026-11-11T05:21:30.834Z','2026-11-11T05:11:30.839Z');
INSERT INTO "agent_pairing_codes" VALUES (109,5,'e95f11cd641fa30c6e209707cef86b70e86b40655f46db3fae5b71eb32b8b53b','2026-11-11T05:11:31.172Z','2026-11-11T05:21:31.172Z','2026-11-11T05:11:31.177Z');
INSERT INTO "agent_pairing_codes" VALUES (114,5,'811493288686d970e722a228e39e53dc5ab74fed984944e4274e77ae503e501f','2026-11-11T05:11:42.071Z','2026-11-11T05:21:42.073Z','2026-11-11T05:11:42.079Z');
INSERT INTO "agent_pairing_codes" VALUES (115,5,'a12e913856b38e7df6c16ce089c663a71ed12a9edeb39594ae2c449e6dc9480e','2026-11-11T05:11:42.162Z','2026-11-11T05:21:42.162Z','2026-11-11T05:11:42.169Z');
INSERT INTO "agent_pairing_codes" VALUES (116,6,'b3cd23374698db3887f8144226f27ae63cfebdb876b859d896ff0a41f493a2a0','2026-11-11T05:11:42.182Z','2026-11-11T05:21:42.182Z','2026-11-11T05:11:42.187Z');
INSERT INTO "agent_pairing_codes" VALUES (117,5,'b9630d2f736b50929c3f0d93c626231bb156924ceaf01abcb338e5ff60913f63','2026-11-11T05:11:42.259Z','2026-11-11T05:21:42.272Z','2026-11-11T05:11:42.278Z');
INSERT INTO "agent_pairing_codes" VALUES (118,5,'456142e04876b87115cd3797243bd9b7d89a65c8d09e2e980253d5a641f7779c','2026-11-11T05:11:42.714Z','2026-11-11T05:21:42.714Z','2026-11-11T05:11:42.719Z');
INSERT INTO "agent_pairing_codes" VALUES (119,5,'2553d15883eca1c0bd0cadccf59af866b9c7516a4b267cb05de8180921c43f19','2026-11-11T05:11:43.057Z','2026-11-11T05:21:43.057Z','2026-11-11T05:11:43.063Z');
INSERT INTO "agent_pairing_codes" VALUES (122,5,'0a76488cfe08844e0589b2eae220932dcbe8fb1caddb582f4652f0ead9b607b5','2026-11-11T05:11:46.381Z','2026-11-11T05:21:46.382Z','2026-11-11T05:11:46.388Z');
INSERT INTO "agent_pairing_codes" VALUES (123,5,'931660cc95d387c9eef3a4563c955ea24b1dad1df490112005ba8b7bfd2e1a75','2026-11-11T05:11:46.479Z','2026-11-11T05:21:46.479Z','2026-11-11T05:11:46.485Z');
INSERT INTO "agent_pairing_codes" VALUES (124,6,'a800d33667aa27346728ef8778c5d52e0a2bfdc0983b51a35bfdfcc045bf3406','2026-11-11T05:11:46.490Z','2026-11-11T05:21:46.490Z','2026-11-11T05:11:46.495Z');
INSERT INTO "agent_pairing_codes" VALUES (125,5,'ac90436fc4ae955df5166c49ffeabbda34fc3269dc2b257a75e277ac2c7bd049','2026-11-11T05:11:46.567Z','2026-11-11T05:21:46.567Z','2026-11-11T05:11:46.573Z');
INSERT INTO "agent_pairing_codes" VALUES (126,5,'edf32b1274e440367fae41e04bfd132a72ab7af98f24d74eccfe47dc6f47e4cd','2026-11-11T05:11:46.969Z','2026-11-11T05:21:46.969Z','2026-11-11T05:11:46.978Z');
INSERT INTO "agent_pairing_codes" VALUES (127,5,'0dcca625ad91079e96beee3aa4372202d40ebb54962003db9263b176bca42ebc','2026-11-11T05:11:47.408Z','2026-11-11T05:21:47.408Z','2026-11-11T05:11:47.413Z');
INSERT INTO "agent_pairing_codes" VALUES (130,5,'d86b6a672bf6e175d35ed5a3e2e95ba0c9ea4c907d6d418169ca217c5555b1e2','2026-11-11T05:11:51.537Z','2026-11-11T05:21:51.537Z','2026-11-11T05:11:51.544Z');
INSERT INTO "agent_pairing_codes" VALUES (131,5,'1d58f17cb99c7b9d327938ce6b34d3e36384e0d55b8ef60e9ef15c8fa9d4ac2a','2026-11-11T05:11:51.628Z','2026-11-11T05:21:51.628Z','2026-11-11T05:11:51.633Z');
INSERT INTO "agent_pairing_codes" VALUES (132,6,'81907bbc102b61726c5728db5923f8d496472937e3e9d5612107f18463a4bae1','2026-11-11T05:11:51.639Z','2026-11-11T05:21:51.639Z','2026-11-11T05:11:51.644Z');
INSERT INTO "agent_pairing_codes" VALUES (133,5,'16850b2c165105fc0768ccda312f75929a091ac63af806a1390d2afc9e046a44','2026-11-11T05:11:51.736Z','2026-11-11T05:21:51.736Z','2026-11-11T05:11:51.743Z');
INSERT INTO "agent_pairing_codes" VALUES (134,5,'faed65d60367cb03add9730a14f7009b4b66a8523baa90ae8a49aead38fdd037','2026-11-11T05:11:52.113Z','2026-11-11T05:21:52.114Z','2026-11-11T05:11:52.119Z');
INSERT INTO "agent_pairing_codes" VALUES (135,5,'bf5b46fe54abbf4e2c3d3aaea3f048066fe7652e61d622ab78a10d8e09818e13','2026-11-11T05:11:52.460Z','2026-11-11T05:21:52.460Z','2026-11-11T05:11:52.465Z');
INSERT INTO "attachments" VALUES (1,23,94,5,'images.jfif','fe16757e-7c1a-45b9-a863-189afe76149c.jpg','image/jpeg',23827,'2026-11-05T00:53:45.391Z');
INSERT INTO "attachments" VALUES (2,25,105,11,'2-gay-black-mens-kissing.jpg','47217800-6ebc-4d1d-a364-eb97904d1780.jpg','image/jpeg',32307,'2026-11-05T05:43:39.187Z');
INSERT INTO "attachments" VALUES (3,25,176,11,'2-gay-black-mens-kissing.jpg','bddbeb86-66c0-4f16-aabf-754f17a5c910.jpg','image/jpeg',32307,'2026-11-11T01:46:26.304Z');
INSERT INTO "bot_buttons" VALUES (1,'Login problem','login_problem',1,1);
INSERT INTO "bot_buttons" VALUES (2,'Report a bug','report_bug',2,1);
INSERT INTO "bot_buttons" VALUES (3,'Billing','billing',3,1);
INSERT INTO "bot_buttons" VALUES (4,'How to use','how_to_use',4,1);
INSERT INTO "bot_buttons" VALUES (5,'Talk to IT Support','talk_to_it',5,1);
INSERT INTO "bot_conditions" VALUES (1,'Urgent requests go to IT','urgent','','route_to_it','',100,1);
INSERT INTO "bot_conversations" VALUES (1,6,2,'2026-11-02T18:24:32.926Z','2026-11-02T21:24:33.082Z',1);
INSERT INTO "bot_conversations" VALUES (2,7,NULL,'2026-10-31T04:24:32.961Z','2026-10-31T04:28:32.961Z',4);
INSERT INTO "bot_conversations" VALUES (3,5,23,'2026-11-03T04:24:32.996Z','2026-11-05T00:53:52.275Z',3);
INSERT INTO "bot_conversations" VALUES (4,6,NULL,'2026-11-02T04:24:33.023Z','2026-11-02T04:26:33.023Z',NULL);
INSERT INTO "bot_conversations" VALUES (5,5,NULL,'2026-11-05T01:01:01.321Z','2026-11-05T04:57:34.006Z',3);
INSERT INTO "bot_conversations" VALUES (6,9,NULL,'2026-11-05T05:16:09.539Z','2026-11-05T06:18:35.172Z',3);
INSERT INTO "bot_conversations" VALUES (7,11,25,'2026-11-05T05:42:12.195Z','2026-11-05T05:42:58.654Z',5);
INSERT INTO "bot_conversations" VALUES (8,11,NULL,'2026-11-05T05:43:41.499Z','2026-11-05T05:44:49.153Z',5);
INSERT INTO "bot_conversations" VALUES (9,9,NULL,'2026-11-05T06:20:06.133Z','2026-11-05T06:20:06.133Z',NULL);
INSERT INTO "bot_conversations" VALUES (10,5,NULL,'2026-11-05T06:23:33.361Z','2026-11-05T06:23:46.540Z',3);
INSERT INTO "bot_conversations" VALUES (11,5,NULL,'2026-11-05T06:24:32.233Z','2026-11-05T06:24:37.468Z',5);
INSERT INTO "bot_conversations" VALUES (12,5,NULL,'2026-11-05T06:24:40.410Z','2026-11-05T06:24:42.828Z',NULL);
INSERT INTO "bot_conversations" VALUES (13,5,NULL,'2026-11-05T06:34:09.689Z','2026-11-05T06:48:03.013Z',4);
INSERT INTO "bot_conversations" VALUES (15,5,NULL,'2026-11-05T06:53:43.216Z','2026-11-05T07:28:13.749Z',3);
INSERT INTO "bot_conversations" VALUES (18,5,NULL,'2026-11-07T02:02:15.254Z','2026-11-07T05:05:15.736Z',4);
INSERT INTO "bot_failures" VALUES (9,0,'2026-11-05T06:20:06.133Z');
INSERT INTO "bot_failures" VALUES (10,1,'2026-11-05T06:23:46.540Z');
INSERT INTO "bot_failures" VALUES (11,1,'2026-11-05T06:24:37.468Z');
INSERT INTO "bot_failures" VALUES (12,1,'2026-11-05T06:24:42.828Z');
INSERT INTO "bot_failures" VALUES (13,0,'2026-11-05T06:34:09.689Z');
INSERT INTO "bot_failures" VALUES (15,1,'2026-11-05T06:53:49.304Z');
INSERT INTO "bot_failures" VALUES (18,0,'2026-11-07T02:02:15.254Z');
INSERT INTO "bot_messages" VALUES (1,1,'bot','Hi Daniel, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-02T18:24:32.926Z');
INSERT INTO "bot_messages" VALUES (2,1,'customer','Our webhook deliveries started failing with 502 errors after yesterday''s deploy. It''s blocking our nightly sync.','2026-11-02T18:25:32.926Z');
INSERT INTO "bot_messages" VALUES (3,1,'bot','I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.','2026-11-02T18:26:32.926Z');
INSERT INTO "bot_messages" VALUES (4,1,'customer','I need to talk to IT support — this is urgent.','2026-11-02T18:29:32.926Z');
INSERT INTO "bot_messages" VALUES (5,1,'bot','I''ll connect you with the IT support team. Create a support request from this chat and the conversation comes with it, so you won''t need to repeat yourself.','2026-11-02T18:30:32.926Z');
INSERT INTO "bot_messages" VALUES (6,2,'bot','Hi Elena, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-10-31T04:24:32.961Z');
INSERT INTO "bot_messages" VALUES (7,2,'customer','Where can I download last month''s invoice?','2026-10-31T04:25:32.961Z');
INSERT INTO "bot_messages" VALUES (8,2,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-10-31T04:26:32.961Z');
INSERT INTO "bot_messages" VALUES (9,2,'customer','That worked, thanks.','2026-10-31T04:27:32.961Z');
INSERT INTO "bot_messages" VALUES (10,2,'bot','Glad that helped. If anything else comes up, I''m here for support questions — and you can always open a request so the IT team has the full picture.','2026-10-31T04:28:32.961Z');
INSERT INTO "bot_messages" VALUES (11,3,'bot','Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-03T04:24:32.996Z');
INSERT INTO "bot_messages" VALUES (12,3,'customer','I keep getting redirected when I sign in with SSO.','2026-11-03T04:25:32.996Z');
INSERT INTO "bot_messages" VALUES (13,3,'bot','If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.','2026-11-03T04:26:32.996Z');
INSERT INTO "bot_messages" VALUES (14,4,'bot','Hi Daniel, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-02T04:24:33.023Z');
INSERT INTO "bot_messages" VALUES (15,4,'customer','Do you offer discounts for annual plans?','2026-11-02T04:25:33.023Z');
INSERT INTO "bot_messages" VALUES (16,4,'bot','I''m the support assistant, so I can only help with support issues. I can''t discuss sales, pricing, or promotions. If something in your account isn''t working, tell me and I''ll help or connect you with IT.','2026-11-02T04:26:33.023Z');
INSERT INTO "bot_messages" VALUES (19,3,'customer','How do I reset my password?','2026-11-04T09:12:54.021Z');
INSERT INTO "bot_messages" VALUES (20,3,'bot','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','2026-11-04T09:12:54.380Z');
INSERT INTO "bot_messages" VALUES (21,3,'customer','Where can I find an invoice or receipt?','2026-11-04T09:12:58.335Z');
INSERT INTO "bot_messages" VALUES (22,3,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-11-04T09:12:58.694Z');
INSERT INTO "bot_messages" VALUES (23,3,'customer','I''m stuck in an SSO login loop','2026-11-05T00:53:04.989Z');
INSERT INTO "bot_messages" VALUES (24,3,'bot','If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.','2026-11-05T00:53:05.347Z');
INSERT INTO "bot_messages" VALUES (25,3,'customer','Where can I find an invoice or receipt?','2026-11-05T00:53:17.441Z');
INSERT INTO "bot_messages" VALUES (26,3,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-11-05T00:53:17.798Z');
INSERT INTO "bot_messages" VALUES (27,5,'bot','Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T01:01:01.321Z');
INSERT INTO "bot_messages" VALUES (28,5,'customer','Talk to IT support','2026-11-05T01:01:54.693Z');
INSERT INTO "bot_messages" VALUES (29,5,'bot','I''ll connect you with the IT support team. Create a support request from this chat and the conversation comes with it, so you won''t need to repeat yourself.','2026-11-05T01:01:55.048Z');
INSERT INTO "bot_messages" VALUES (30,5,'customer','How do I reset my password?','2026-11-05T01:02:06.137Z');
INSERT INTO "bot_messages" VALUES (31,5,'bot','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','2026-11-05T01:02:06.493Z');
INSERT INTO "bot_messages" VALUES (32,5,'customer','I''m stuck in an SSO login loop','2026-11-05T01:02:08.418Z');
INSERT INTO "bot_messages" VALUES (33,5,'bot','If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.','2026-11-05T01:02:08.773Z');
INSERT INTO "bot_messages" VALUES (34,5,'customer','How do I reset my password?','2026-11-05T01:02:09.578Z');
INSERT INTO "bot_messages" VALUES (35,5,'bot','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','2026-11-05T01:02:09.933Z');
INSERT INTO "bot_messages" VALUES (36,5,'customer','The app isn''t loading or shows an error','2026-11-05T01:02:11.194Z');
INSERT INTO "bot_messages" VALUES (37,5,'bot','Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can''t see your account or logs from this chat.','2026-11-05T01:02:11.550Z');
INSERT INTO "bot_messages" VALUES (38,5,'customer','How do I reset my password?','2026-11-05T01:02:11.897Z');
INSERT INTO "bot_messages" VALUES (39,5,'bot','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','2026-11-05T01:02:12.254Z');
INSERT INTO "bot_messages" VALUES (40,5,'customer','Where can I find an invoice or receipt?','2026-11-05T01:02:15.419Z');
INSERT INTO "bot_messages" VALUES (41,5,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-11-05T01:02:15.774Z');
INSERT INTO "bot_messages" VALUES (42,5,'customer','I''m stuck in an SSO login loop','2026-11-05T01:02:19.809Z');
INSERT INTO "bot_messages" VALUES (43,5,'bot','If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.','2026-11-05T01:02:20.166Z');
INSERT INTO "bot_messages" VALUES (44,5,'customer','Where can I find an invoice or receipt?','2026-11-05T01:02:21.458Z');
INSERT INTO "bot_messages" VALUES (45,5,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-11-05T01:02:21.813Z');
INSERT INTO "bot_messages" VALUES (46,5,'customer','The app isn''t loading or shows an error','2026-11-05T04:57:33.648Z');
INSERT INTO "bot_messages" VALUES (47,5,'bot','Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can''t see your account or logs from this chat.','2026-11-05T04:57:34.006Z');
INSERT INTO "bot_messages" VALUES (48,6,'bot','Hi Marisse, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T05:16:09.539Z');
INSERT INTO "bot_messages" VALUES (49,7,'bot','Hi ADMIN, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T05:42:12.195Z');
INSERT INTO "bot_messages" VALUES (50,7,'customer','Help me','2026-11-05T05:42:17.237Z');
INSERT INTO "bot_messages" VALUES (51,7,'bot','I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.','2026-11-05T05:42:17.603Z');
INSERT INTO "bot_messages" VALUES (52,7,'customer','i need pc','2026-11-05T05:42:21.483Z');
INSERT INTO "bot_messages" VALUES (53,7,'bot','I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.','2026-11-05T05:42:21.840Z');
INSERT INTO "bot_messages" VALUES (54,8,'bot','Hi ADMIN, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T05:43:41.499Z');
INSERT INTO "bot_messages" VALUES (55,8,'customer','hello beulah i need thermal paper','2026-11-05T05:44:48.797Z');
INSERT INTO "bot_messages" VALUES (56,8,'bot','Hi ADMIN, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T05:44:49.153Z');
INSERT INTO "bot_messages" VALUES (57,6,'customer','Login problem','2026-11-05T06:18:29.498Z');
INSERT INTO "bot_messages" VALUES (58,6,'bot','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','2026-11-05T06:18:29.857Z');
INSERT INTO "bot_messages" VALUES (59,6,'customer','The app isn''t loading or shows an error','2026-11-05T06:18:34.816Z');
INSERT INTO "bot_messages" VALUES (60,6,'bot','Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can''t see your account or logs from this chat.','2026-11-05T06:18:35.172Z');
INSERT INTO "bot_messages" VALUES (61,9,'bot','Hi Marisse, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T06:20:06.133Z');
INSERT INTO "bot_messages" VALUES (62,10,'bot','Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T06:23:33.361Z');
INSERT INTO "bot_messages" VALUES (63,10,'customer','Login problem','2026-11-05T06:23:40.617Z');
INSERT INTO "bot_messages" VALUES (64,10,'bot','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','2026-11-05T06:23:40.976Z');
INSERT INTO "bot_messages" VALUES (65,10,'customer','Forgot','2026-11-05T06:23:46.185Z');
INSERT INTO "bot_messages" VALUES (66,10,'bot','I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.','2026-11-05T06:23:46.540Z');
INSERT INTO "bot_messages" VALUES (67,11,'bot','Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T06:24:32.233Z');
INSERT INTO "bot_messages" VALUES (68,11,'customer','My vendix','2026-11-05T06:24:37.113Z');
INSERT INTO "bot_messages" VALUES (69,11,'bot','I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.','2026-11-05T06:24:37.468Z');
INSERT INTO "bot_messages" VALUES (70,12,'bot','Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T06:24:40.410Z');
INSERT INTO "bot_messages" VALUES (71,12,'customer','How to use','2026-11-05T06:24:42.472Z');
INSERT INTO "bot_messages" VALUES (72,12,'bot','I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.','2026-11-05T06:24:42.828Z');
INSERT INTO "bot_messages" VALUES (73,13,'bot','Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T06:34:09.689Z');
INSERT INTO "bot_messages" VALUES (75,13,'customer','Report a bug','2026-11-05T06:47:41.729Z');
INSERT INTO "bot_messages" VALUES (76,13,'bot','Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can''t see your account or logs from this chat.','2026-11-05T06:47:42.088Z');
INSERT INTO "bot_messages" VALUES (77,13,'customer','Where can I find an invoice or receipt?','2026-11-05T06:47:52.144Z');
INSERT INTO "bot_messages" VALUES (78,13,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-11-05T06:47:52.503Z');
INSERT INTO "bot_messages" VALUES (79,13,'customer','The app isn''t loading or shows an error','2026-11-05T06:47:57.944Z');
INSERT INTO "bot_messages" VALUES (80,13,'bot','Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can''t see your account or logs from this chat.','2026-11-05T06:47:58.299Z');
INSERT INTO "bot_messages" VALUES (81,13,'customer','How do I reset my password?','2026-11-05T06:48:02.657Z');
INSERT INTO "bot_messages" VALUES (82,13,'bot','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','2026-11-05T06:48:03.013Z');
INSERT INTO "bot_messages" VALUES (83,15,'bot','Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-05T06:53:43.216Z');
INSERT INTO "bot_messages" VALUES (84,15,'customer','How to use','2026-11-05T06:53:48.946Z');
INSERT INTO "bot_messages" VALUES (85,15,'bot','I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.','2026-11-05T06:53:49.304Z');
INSERT INTO "bot_messages" VALUES (86,15,'customer','I''m stuck in an SSO login loop','2026-11-05T06:54:47.194Z');
INSERT INTO "bot_messages" VALUES (87,15,'bot','If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.','2026-11-05T06:54:47.549Z');
INSERT INTO "bot_messages" VALUES (88,15,'customer','Where can I find an invoice or receipt?','2026-11-05T06:54:53.039Z');
INSERT INTO "bot_messages" VALUES (89,15,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-11-05T06:54:53.396Z');
INSERT INTO "bot_messages" VALUES (90,15,'customer','The app isn''t loading or shows an error','2026-11-05T06:54:53.554Z');
INSERT INTO "bot_messages" VALUES (91,15,'bot','Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can''t see your account or logs from this chat.','2026-11-05T06:54:53.910Z');
INSERT INTO "bot_messages" VALUES (92,15,'customer','I''m stuck in an SSO login loop','2026-11-05T06:54:54.609Z');
INSERT INTO "bot_messages" VALUES (93,15,'bot','If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.','2026-11-05T06:54:54.976Z');
INSERT INTO "bot_messages" VALUES (94,15,'customer','Where can I find an invoice or receipt?','2026-11-05T06:54:55.232Z');
INSERT INTO "bot_messages" VALUES (95,15,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-11-05T06:54:55.587Z');
INSERT INTO "bot_messages" VALUES (96,15,'customer','How do I reset my password?','2026-11-05T06:54:56.415Z');
INSERT INTO "bot_messages" VALUES (97,15,'bot','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','2026-11-05T06:54:56.771Z');
INSERT INTO "bot_messages" VALUES (100,15,'customer','I''m stuck in an SSO login loop','2026-11-05T07:28:13.389Z');
INSERT INTO "bot_messages" VALUES (101,15,'bot','If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.','2026-11-05T07:28:13.749Z');
INSERT INTO "bot_messages" VALUES (102,18,'bot','Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?','2026-11-07T02:02:15.254Z');
INSERT INTO "bot_messages" VALUES (103,18,'customer','Report a bug','2026-11-07T05:05:01.369Z');
INSERT INTO "bot_messages" VALUES (104,18,'bot','Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can''t see your account or logs from this chat.','2026-11-07T05:05:01.734Z');
INSERT INTO "bot_messages" VALUES (105,18,'customer','Where can I find an invoice or receipt?','2026-11-07T05:05:06.727Z');
INSERT INTO "bot_messages" VALUES (106,18,'bot','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','2026-11-07T05:05:07.085Z');
INSERT INTO "calls" VALUES (5,166,2,5,'audio','cancelled','2026-11-09T06:15:05.842Z',NULL,'2026-11-09T06:15:37.478Z',2);
INSERT INTO "calls" VALUES (6,25,2,11,'audio','cancelled','2026-11-09T06:16:11.800Z',NULL,'2026-11-09T06:16:46.476Z',2);
INSERT INTO "calls" VALUES (7,166,5,2,'audio','missed','2026-11-09T06:19:30.442Z','2026-11-09T06:19:35.348Z','2026-11-09T06:23:47.279Z',NULL);
INSERT INTO "calls" VALUES (16,25,2,11,'audio','cancelled','2026-11-09T06:25:44.681Z',NULL,'2026-11-09T06:26:01.491Z',2);
INSERT INTO "calls" VALUES (20,25,2,11,'audio','cancelled','2026-11-09T06:34:17.071Z',NULL,'2026-11-09T06:34:18.892Z',2);
INSERT INTO "calls" VALUES (24,25,2,11,'audio','ended','2026-11-09T06:40:16.720Z','2026-11-09T06:40:18.110Z','2026-11-09T06:41:23.516Z',11);
INSERT INTO "calls" VALUES (25,25,11,2,'audio','declined','2026-11-09T06:41:23.523Z',NULL,'2026-11-09T06:41:23.547Z',2);
INSERT INTO "calls" VALUES (26,25,11,2,'audio','ended','2026-11-09T06:41:27.888Z','2026-11-09T06:41:29.308Z','2026-11-09T06:41:39.429Z',11);
INSERT INTO "calls" VALUES (27,166,5,2,'video','ended','2026-11-09T06:44:00.356Z',NULL,'2026-11-09T06:44:16.012Z',5);
INSERT INTO "calls" VALUES (28,166,5,2,'audio','ended','2026-11-09T06:44:16.017Z','2026-11-09T06:44:19.577Z','2026-11-09T06:44:24.452Z',2);
INSERT INTO "calls" VALUES (29,25,11,2,'audio','ended','2026-11-09T06:44:31.505Z','2026-11-09T06:44:42.149Z','2026-11-09T06:45:17.608Z',2);
INSERT INTO "calls" VALUES (33,166,5,2,'video','cancelled','2026-11-09T06:47:01.905Z',NULL,'2026-11-09T06:47:48.789Z',5);
INSERT INTO "calls" VALUES (34,25,2,11,'audio','cancelled','2026-11-09T06:47:53.067Z',NULL,'2026-11-09T06:48:08.211Z',2);
INSERT INTO "calls" VALUES (35,166,2,5,'audio','ended','2026-11-09T06:48:20.017Z','2026-11-09T06:48:22.911Z','2026-11-09T06:48:57.652Z',2);
INSERT INTO "calls" VALUES (46,166,5,2,'video','ended','2026-11-09T06:57:25.811Z','2026-11-09T06:57:28.383Z','2026-11-09T06:57:56.606Z',5);
INSERT INTO "calls" VALUES (50,166,5,2,'video','ended','2026-11-09T07:04:49.810Z','2026-11-09T07:04:57.515Z','2026-11-09T07:06:12.105Z',2);
INSERT INTO "calls" VALUES (60,166,5,2,'video','ended','2026-11-09T08:00:02.113Z','2026-11-09T08:00:03.920Z','2026-11-09T08:00:19.198Z',5);
INSERT INTO "calls" VALUES (61,25,11,2,'audio','declined','2026-11-09T08:00:03.743Z',NULL,'2026-11-09T08:00:03.764Z',2);
INSERT INTO "calls" VALUES (62,25,11,2,'audio','declined','2026-11-09T08:00:07.025Z',NULL,'2026-11-09T08:00:07.041Z',2);
INSERT INTO "calls" VALUES (63,25,11,2,'audio','declined','2026-11-09T08:00:09.991Z',NULL,'2026-11-09T08:00:10.006Z',2);
INSERT INTO "calls" VALUES (64,25,11,2,'audio','declined','2026-11-09T08:00:12.932Z',NULL,'2026-11-09T08:00:12.940Z',2);
INSERT INTO "calls" VALUES (65,25,11,2,'video','ended','2026-11-09T08:00:23.248Z','2026-11-09T08:00:30.551Z','2026-11-09T08:00:54.560Z',11);
INSERT INTO "calls" VALUES (75,166,5,2,'audio','cancelled','2026-11-09T08:49:58.712Z',NULL,'2026-11-09T08:50:19.246Z',5);
INSERT INTO "calls" VALUES (76,166,5,2,'video','cancelled','2026-11-09T08:50:22.516Z',NULL,'2026-11-09T08:50:30.102Z',5);
INSERT INTO "calls" VALUES (77,166,5,2,'video','declined','2026-11-09T08:50:31.649Z',NULL,'2026-11-09T08:50:31.659Z',2);
INSERT INTO "calls" VALUES (78,166,5,2,'audio','cancelled','2026-11-09T08:50:48.049Z',NULL,'2026-11-09T08:51:07.411Z',5);
INSERT INTO "calls" VALUES (79,166,5,2,'video','ended','2026-11-09T08:51:10.989Z','2026-11-09T08:51:13.016Z','2026-11-09T08:51:26.422Z',2);
INSERT INTO "calls" VALUES (83,166,5,2,'audio','cancelled','2026-11-11T01:18:34.670Z',NULL,'2026-11-11T01:18:45.167Z',5);
INSERT INTO "calls" VALUES (84,23,2,5,'video','ended','2026-11-11T02:05:39.682Z','2026-11-11T02:05:57.251Z','2026-11-11T02:07:13.733Z',2);
INSERT INTO "calls" VALUES (94,509,2,5,'audio','cancelled','2026-11-11T03:35:55.500Z',NULL,'2026-11-11T03:36:21.000Z',2);
INSERT INTO "canned_replies" VALUES (1,'Request more detail','Thanks for the details. To help us confirm what''s happening, could you share a screenshot and the exact time the issue last occurred? If there''s an error reference or trace ID, include that too.','2026-10-21T04:24:32.906Z','2026-11-07T05:22:19.012Z');
INSERT INTO "canned_replies" VALUES (2,'Investigating — first update','We''ve reproduced the issue on our side and the team is working on a fix. I''ll update you in this thread as soon as we have a verified resolution — no need to open a separate request.','2026-10-21T04:24:32.911Z','2026-10-21T04:24:32.911Z');
INSERT INTO "canned_replies" VALUES (3,'Fix applied — please verify','A fix has been applied and verified internally. Please refresh and try again. If anything still looks wrong, reply here and we''ll reopen the investigation in this same thread.','2026-10-21T04:24:32.916Z','2026-10-21T04:24:32.916Z');
INSERT INTO "canned_replies" VALUES (4,'Bringing in a specialist','I''m bringing in a specialist from the platform team. They''ll continue with you in this thread so the full context stays in one place.','2026-10-21T04:24:32.921Z','2026-10-21T04:24:32.921Z');
INSERT INTO "customer_tags" VALUES (5,5);
INSERT INTO "customer_tags" VALUES (5,6);
INSERT INTO "follow_ups" VALUES (7,16,'survey','dismissed','2026-11-05T06:57:23.816Z',NULL,'2026-11-05T06:57:49.476Z',NULL);
INSERT INTO "follow_ups" VALUES (10,23,'solved_check','dismissed','2026-11-08T01:54:09.022Z',NULL,'2026-11-07T02:01:04.799Z',NULL);
INSERT INTO "follow_ups" VALUES (11,23,'solved_check','dismissed','2026-11-08T02:01:48.317Z',NULL,'2026-11-07T02:02:30.863Z',NULL);
INSERT INTO "follow_ups" VALUES (12,23,'solved_check','dismissed','2026-11-08T02:06:09.935Z',NULL,'2026-11-07T02:06:41.270Z',NULL);
INSERT INTO "follow_ups" VALUES (13,23,'solved_check','dismissed','2026-11-08T02:10:44.263Z',NULL,'2026-11-07T02:16:33.371Z',NULL);
INSERT INTO "follow_ups" VALUES (18,23,'solved_check','dismissed','2026-11-08T02:17:24.526Z',NULL,'2026-11-07T02:18:16.027Z',NULL);
INSERT INTO "follow_ups" VALUES (19,23,'solved_check','dismissed','2026-11-08T02:18:59.295Z',NULL,'2026-11-07T02:19:17.466Z',NULL);
INSERT INTO "follow_ups" VALUES (20,23,'survey','sent','2026-11-07T02:19:17.461Z','2026-11-07T02:19:19.832Z','2026-11-07T02:19:19.832Z',NULL);
INSERT INTO "internal_chat_members" VALUES (1,2,'2026-11-05T05:04:39.641Z','2026-11-07T08:29:42.480Z');
INSERT INTO "internal_chat_members" VALUES (1,3,'2026-11-05T05:04:39.641Z',NULL);
INSERT INTO "internal_chat_members" VALUES (5,4,'2026-11-05T05:06:34.586Z',NULL);
INSERT INTO "internal_chat_members" VALUES (5,3,'2026-11-05T05:06:34.586Z',NULL);
INSERT INTO "internal_chat_members" VALUES (5,1,'2026-11-05T05:06:34.586Z','2026-11-09T07:48:19.622Z');
INSERT INTO "internal_chat_members" VALUES (5,2,'2026-11-05T05:06:34.586Z','2026-11-07T08:29:39.888Z');
INSERT INTO "internal_chat_members" VALUES (6,1,'2026-11-05T05:07:23.364Z','2026-11-09T07:48:18.285Z');
INSERT INTO "internal_chat_members" VALUES (6,3,'2026-11-05T05:07:23.364Z',NULL);
INSERT INTO "internal_chat_members" VALUES (8,1,'2026-11-05T05:45:35.134Z','2026-11-09T07:48:19.061Z');
INSERT INTO "internal_chat_members" VALUES (8,4,'2026-11-05T05:45:35.134Z',NULL);
INSERT INTO "internal_chat_members" VALUES (9,1,'2026-11-07T03:35:47.808Z','2026-11-09T07:48:22.438Z');
INSERT INTO "internal_chat_members" VALUES (9,2,'2026-11-07T03:35:47.808Z','2026-11-07T08:30:46.630Z');
INSERT INTO "internal_chat_messages" VALUES (3,5,2,'321','2026-11-05T05:06:39.379Z');
INSERT INTO "internal_chat_messages" VALUES (4,9,1,'Hello Goodmorning','2026-11-07T04:03:40.623Z');
INSERT INTO "internal_chat_messages" VALUES (5,5,1,'Hello','2026-11-07T04:57:35.775Z');
INSERT INTO "internal_chat_messages" VALUES (6,9,2,'Mayng gabie','2026-11-07T04:57:52.471Z');
INSERT INTO "internal_chat_messages" VALUES (7,9,1,'mayng buntag ♥','2026-11-07T05:26:40.273Z');
INSERT INTO "internal_chats" VALUES (1,'direct',NULL,'2:3',2,'2026-11-05T05:04:39.641Z','2026-11-05T05:04:39.641Z');
INSERT INTO "internal_chats" VALUES (5,'group','IT Solutions',NULL,2,'2026-11-05T05:06:34.586Z','2026-11-07T04:57:35.775Z');
INSERT INTO "internal_chats" VALUES (6,'direct',NULL,'1:3',1,'2026-11-05T05:07:23.364Z','2026-11-05T05:07:23.364Z');
INSERT INTO "internal_chats" VALUES (8,'direct',NULL,'1:4',1,'2026-11-05T05:45:35.134Z','2026-11-05T05:45:35.134Z');
INSERT INTO "internal_chats" VALUES (9,'direct',NULL,'1:2',1,'2026-11-07T03:35:47.808Z','2026-11-07T05:26:40.273Z');
INSERT INTO "kb_entries" VALUES (1,'How do I reset my password?','Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.','password, reset password, forgot password, reset link, locked out, sign in problem, login problem','Account access',1,'2026-10-15T04:24:32.861Z','2026-11-07T05:22:18.921Z');
INSERT INTO "kb_entries" VALUES (2,'I''m stuck in an SSO login loop','If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.','sso, single sign on, login loop, redirect loop, identity provider, saml, sign in loop','Account access',1,'2026-10-15T04:24:32.866Z','2026-10-15T04:24:32.866Z');
INSERT INTO "kb_entries" VALUES (3,'The app isn''t loading or shows an error','Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can''t see your account or logs from this chat.','not loading, error, blank screen, app crash, frozen, crashing, bug, 500 error, 502 error','Technical issue',1,'2026-10-15T04:24:32.871Z','2026-10-15T04:24:32.871Z');
INSERT INTO "kb_entries" VALUES (4,'Where can I find an invoice or receipt?','Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.','invoice, receipt, billing document, vat number, billing history, download invoice','Billing & invoices',1,'2026-10-15T04:24:32.876Z','2026-10-15T04:24:32.876Z');
INSERT INTO "kb_entries" VALUES (5,'How long until support replies?','IT support works to response targets by priority: urgent within 1 hour, high within 2 hours, normal within 8 hours, and low within 1 day. Those are targets, not guarantees. Your request page shows live status, the assigned agent, and the response target. Admins monitor every request, including ones at risk of missing target.','response time, how long, reply, sla, waiting, when will support respond, support hours','Policies & expectations',1,'2026-10-15T04:24:32.881Z','2026-10-15T04:24:32.881Z');
INSERT INTO "kb_entries" VALUES (6,'How do I attach a screenshot?','In a request or when creating one, use the attachment button and choose an image or PDF up to 5 MB. A screenshot with the error message and timestamp helps IT resolve issues faster. Attachments are only visible to you and the support team inside SupportIQ.','screenshot, attach, attachment, upload, image, pdf, file','How-to',1,'2026-10-15T04:24:32.886Z','2026-10-15T04:24:32.886Z');
INSERT INTO "kb_entries" VALUES (7,'Where do I track my request?','Open My requests in the customer portal. Each request shows its stage, assigned agent, response target, and the full conversation. Replies and status changes appear there as they happen — everything stays inside SupportIQ.','track request, status, ticket status, progress, my request, reference, siq','How-to',1,'2026-10-15T04:24:32.891Z','2026-10-15T04:24:32.891Z');
INSERT INTO "kb_entries" VALUES (8,'Can I export my account data?','Account owners can start an export from Settings → Data & exports. Large exports are prepared in the background and downloaded from the same page when ready. If an export fails or stalls, create a request with the export ID and approximate start time.','export data, download data, csv, data export, audit log, export job','Data & exports',1,'2026-10-15T04:24:32.896Z','2026-10-15T04:24:32.896Z');
INSERT INTO "kb_entries" VALUES (9,'How do I add someone to my workspace?','Workspace admins can invite teammates from Settings → Members. If an invitation doesn''t arrive, create a support request with the invited email so IT can check delivery. Membership and permissions can''t be changed from chat.','add teammate, invite, workspace members, user access, permissions, second admin','Account access',1,'2026-10-15T04:24:32.901Z','2026-10-15T04:24:32.901Z');
INSERT INTO "messages" VALUES (1,1,5,'customer','Since our identity provider migration this morning, signing in sends me straight back to the SupportIQ login page in a loop. I''ve tried Chrome and Safari. This is blocking month-end close for the finance team.',0,'2026-11-04T01:24:33.051Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (2,1,NULL,'bot','Thanks Maya, request SIQ-1001 is in the IT support queue. A support agent will review it. Your target first response is 1 hour. You can follow every update right here in SupportIQ.',0,'2026-11-04T01:25:33.051Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (3,2,6,'customer','Starting around 02:10 UTC, every webhook delivery to our endpoint returns 502 and then retries. Our nightly sync is blocked. Latest trace ID is tr_9f2c4a. The endpoint itself is healthy and answers synthetic checks.',0,'2026-11-02T21:24:33.082Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (4,2,NULL,'bot','Thanks Daniel, request SIQ-1002 is in the IT support queue. A support agent will review it. Your target first response is 2 hours. You can follow every update right here in SupportIQ.',0,'2026-11-02T21:25:33.082Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (5,2,2,'it','Hi Daniel — we''re seeing 502s from the egress layer and investigating with the platform team. I''ll keep this thread updated. No need to redeploy on your side yet.',0,'2026-11-02T22:54:33.082Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (6,2,6,'customer','Still failing. Latest trace ID is tr_9f2c4a and it started right after the 02:10 UTC deploy. We''re losing roughly 400 events per retry window.',0,'2026-11-02T23:54:33.082Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (7,2,2,'it','Traced to a stale gateway pool from the deploy. Platform team is cycling it; do not ask the customer to redeploy yet. Monitoring error rate for the next hour.',1,'2026-11-03T09:24:33.082Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (8,2,NULL,'system','Assistant conversation — captured when this request was created

SupportIQ Assistant: Hi Daniel, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?

Customer: Our webhook deliveries started failing with 502 errors after yesterday''s deploy. It''s blocking our nightly sync.

SupportIQ Assistant: I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.

Customer: I need to talk to IT support — this is urgent.

SupportIQ Assistant: I''ll connect you with the IT support team. Create a support request from this chat and the conversation comes with it, so you won''t need to repeat yourself.',1,'2026-11-02T21:26:33.082Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (9,3,7,'customer','Our October invoice (INV-88421) appears to bill us at the Enterprise tier, but our contract is for Growth. Could you check the account mapping and reissue the invoice? Finance is holding the payment run.',0,'2026-10-31T04:24:33.160Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (10,3,NULL,'bot','Thanks Elena, request SIQ-1003 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-10-31T04:25:33.160Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (11,3,3,'it','Thanks Elena. I can see the mismatch on the October invoice. Could you confirm the invoice number and the contract tier on your order form?',0,'2026-10-31T09:24:33.160Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (12,3,7,'customer','Invoice INV-88421, dated 1 October. Our order form says Growth, 40 seats.',0,'2026-10-31T10:24:33.160Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (13,3,3,'it','Confirmed and corrected. I''ve reissued the invoice with the Growth mapping and asked finance to void the original. It should appear in your Billing portal shortly.',0,'2026-10-31T23:24:33.160Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (14,3,7,'customer','Got the corrected invoice. Thank you.',0,'2026-10-31T23:44:33.160Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (15,4,5,'customer','SupportIQ desktop 4.18.2 crashes every time I open a dashboard shared by another workspace. It happens on macOS 15.3. Local dashboards are fine. I''ll add a screenshot once I''m back at my desk.',0,'2026-11-02T04:24:33.230Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (16,4,NULL,'bot','Thanks Maya, request SIQ-1004 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-11-02T04:25:33.230Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (17,4,3,'it','Thanks Maya. I can reproduce a crash on macOS 15 when a shared dashboard contains a deleted widget. Could you attach a screenshot of the error and confirm your app version?',0,'2026-11-02T05:04:33.230Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (18,4,3,'it','Reproduced locally. Waiting on the customer''s screenshot and app version before escalating to desktop engineering.',1,'2026-11-02T05:24:33.230Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (19,4,5,'customer','App version is 4.18.2. I''ll grab a screenshot after my next meeting.',0,'2026-11-02T06:04:33.230Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (20,4,3,'it','Screenshot still missing. Friendly follow-up sent; request left waiting on customer.',1,'2026-11-04T00:24:33.230Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (21,5,6,'customer','Our new ops lead accepted the invitation, but she doesn''t appear under Members and can''t access the workspace. Invite email was sent yesterday to ops-lead@lumenpay.io.',0,'2026-11-03T22:24:33.294Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (22,5,NULL,'bot','Thanks Daniel, request SIQ-1005 is in the IT support queue. A support agent will review it. Your target first response is 1 business day. You can follow every update right here in SupportIQ.',0,'2026-11-03T22:25:33.294Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (23,6,7,'customer','The audit export we started at 06:00 is stuck at 60% for almost an hour. This is blocking our security review today. Export ID: exp_77121.',0,'2026-11-02T04:24:33.321Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (24,6,NULL,'bot','Thanks Elena, request SIQ-1006 is in the IT support queue. A support agent will review it. Your target first response is 1 hour. You can follow every update right here in SupportIQ.',0,'2026-11-02T04:25:33.321Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (25,6,2,'it','I can see the export holding a lock from the archive job. Requeuing it now and watching the worker — I''ll confirm when the file is complete.',0,'2026-11-02T04:49:33.321Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (26,6,2,'it','The export completed and passed checksum verification. It''s available from the same export page. I''ve also logged the lock contention for the platform team.',0,'2026-11-02T06:44:33.321Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (27,6,7,'customer','Downloaded and verified. Thank you.',0,'2026-11-02T07:04:33.321Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (28,7,5,'customer','The web app freezes for 5–10 seconds whenever I open a shared dashboard, then recovers. Started after this morning''s release. Chrome 141 on Windows. It''s slowing down our stand-up.',0,'2026-11-04T03:59:33.381Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (29,7,NULL,'bot','Thanks Maya, request SIQ-1007 is in the IT support queue. A support agent will review it. Your target first response is 2 hours. You can follow every update right here in SupportIQ.',0,'2026-11-04T04:00:33.381Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (30,8,6,'customer','I requested a password reset three times and no email arrives. I can still use my current session, but I need to reset before it expires. Checked spam already.',0,'2026-10-29T04:24:33.406Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (31,8,NULL,'bot','Thanks Daniel, request SIQ-1008 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-10-29T04:25:33.406Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (32,8,4,'it','Thanks for flagging. I can see the reset emails leaving our service but being deferred by your mail gateway. I''ll verify the delivery path and come back with a fix.',0,'2026-10-29T06:24:33.406Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (33,8,4,'it','Gateway is greylisting our sending domain. Working with deliverability to request an allowlist on the customer side.',1,'2026-10-29T13:04:33.406Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (34,8,4,'it','I''ve re-sent the reset through a verified backup path and confirmed delivery. Please try again — the link is valid for 30 minutes.',0,'2026-10-31T05:44:33.406Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (35,8,6,'customer','That worked. Signed in and reset.',0,'2026-10-31T06:14:33.406Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (36,9,7,'customer','Critical alert events are intermittently not reaching our on-call rotation. We saw three missed pages last night. Routing rule is set to ''Critical → On-call''. Nothing in the audit log.',0,'2026-11-02T04:24:33.471Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (37,9,NULL,'bot','Thanks Elena, request SIQ-1009 is in the IT support queue. A support agent will review it. Your target first response is 2 hours. You can follow every update right here in SupportIQ.',0,'2026-11-02T04:25:33.471Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (38,9,4,'it','I''m sorry about the missed pages — that''s a serious one. I can see gaps in the routing audit. Could you share one event ID from last night and the exact window?',0,'2026-11-02T13:24:33.471Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (39,9,7,'customer','Event evt_3f19 at 02:41 UTC and evt_3f22 at 02:58 UTC. Both were marked critical in our monitor. The third was around 04:10 but I don''t have the ID.',0,'2026-11-02T14:24:33.471Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (40,9,4,'it','Escalated to on-call. Root cause suspected in the routing-rules cache; no ETA yet. Customer is waiting on a status update by end of day.',1,'2026-11-04T00:24:33.471Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (41,10,5,'customer','Please prepare a full workspace export for our data retention review. We need it in CSV with the schema documentation if available.',0,'2026-10-23T04:24:33.530Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (42,10,NULL,'bot','Thanks Maya, request SIQ-1010 is in the IT support queue. A support agent will review it. Your target first response is 1 business day. You can follow every update right here in SupportIQ.',0,'2026-10-23T04:25:33.530Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (43,10,3,'it','Happy to prepare this. I''ll include the CSV schema and a checksum so you can verify integrity. The secure link will be valid for seven days.',0,'2026-10-23T07:24:33.530Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (44,10,3,'it','Export is ready and attached to this request via a secure link. Checksum is in the link notes.',0,'2026-10-24T04:04:33.530Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (45,11,6,'customer','On the iOS app, scrolling through a long request thread jumps back to the top whenever a new message arrives. This makes live threads impossible to follow. iPhone 15, iOS 19.2.',0,'2026-10-17T04:24:33.586Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (46,11,NULL,'bot','Thanks Daniel, request SIQ-1011 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-10-17T04:25:33.586Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (47,11,2,'it','We''ve reproduced the jump on iOS 19 when a new message is appended. The mobile team is working on a scroll-position fix for the next patch.',0,'2026-10-17T10:24:33.586Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (48,11,6,'customer','Any update? This is still happening and we have had to move on-call handovers to a browser.',0,'2026-10-19T04:24:33.586Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (49,11,2,'it','Fix is in 4.16.3, rolling out now. Please update and try a live thread. If it still jumps, reply here and I''ll reopen.',0,'2026-10-20T04:04:33.586Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (50,12,7,'customer','One of our workspace admins lost their phone and can''t complete 2FA. We need to remove the old device and enroll a new one. Identity has been verified internally.',0,'2026-11-02T22:24:33.657Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (51,12,NULL,'bot','Thanks Elena, request SIQ-1012 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-11-02T22:25:33.657Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (52,12,2,'it','Thanks. I''ll need the affected account email and a verification contact from your security team before I can reset MFA. Please don''t post the phone number here.',0,'2026-11-03T01:24:33.657Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (53,12,7,'customer','Account is j.okafor@arclight.health. Security contact is our CISO, copied on the ticket.',0,'2026-11-03T02:24:33.657Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (54,12,2,'it','Out-of-band identity check complete. Removing old TOTP device and issuing a fresh enrollment link to the verified address.',1,'2026-11-03T23:24:33.657Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (55,13,5,'customer','Please add our VAT number to the October and November billing receipts. Our finance system rejects them without it. VAT: GB 412 8891 23.',0,'2026-11-04T00:24:33.712Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (56,13,NULL,'bot','Thanks Maya, request SIQ-1013 is in the IT support queue. A support agent will review it. Your target first response is 2 hours. You can follow every update right here in SupportIQ.',0,'2026-11-04T00:25:33.712Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (57,13,3,'it','Thanks Maya. I''ve passed the VAT number to billing. Could you confirm the legal entity name exactly as it should appear on the receipts?',0,'2026-11-04T00:54:33.712Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (58,13,5,'customer','Northwind Labs Ltd.',0,'2026-11-04T01:24:33.712Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (59,13,3,'it','Finance is regenerating both receipts with the VAT ID and entity name. ETA end of day.',1,'2026-11-04T02:24:33.712Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (60,14,6,'customer','Searching the docs portal for “ingest limits” returns a 2024 page that contradicts the current API reference. Team members are following outdated guidance. Cache purge didn''t help.',0,'2026-11-02T04:24:33.767Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (61,14,NULL,'bot','Thanks Daniel, request SIQ-1014 is in the IT support queue. A support agent will review it. Your target first response is 2 hours. You can follow every update right here in SupportIQ.',0,'2026-11-02T04:25:33.767Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (62,14,4,'it','I can reproduce the stale result. Before I purge the search index, could you share the exact query and a screenshot of the result? I want to preserve the evidence.',0,'2026-11-02T05:09:33.767Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (63,14,6,'customer','Query is “ingest limits”. The top result is a 2024 page titled “Ingest limits v1”. I''ll attach a screenshot next.',0,'2026-11-02T06:24:33.767Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (64,14,4,'it','Search index purged and reindexed. Waiting on the customer to confirm the stale page no longer appears.',1,'2026-11-03T23:44:33.767Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (65,15,7,'customer','We want to stream audit logs to our SIEM. Is there a supported integration, and what retention does the API provide? We need this for our next security review.',0,'2026-10-27T04:24:33.828Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (66,15,NULL,'bot','Thanks Elena, request SIQ-1015 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-10-27T04:25:33.828Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (67,15,3,'it','We support streaming audit events with a scoped API key. Retention is 400 days for audit events, 90 days for API request logs. I''ll send the field mapping and a sample payload.',0,'2026-10-27T08:24:33.828Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (68,15,7,'customer','Perfect. We''ll need the security questionnaire for the scoped key — can you attach it?',0,'2026-10-27T16:04:33.828Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (69,15,3,'it','Attached the completed questionnaire and the sample payload. The scoped key is active for your workspace.',0,'2026-10-28T10:04:33.828Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (70,16,5,'customer','The installer runs and then closes with no error. Windows 11 24H2. We''ve tried running as administrator. Two other machines installed fine last week.',0,'2026-10-26T04:24:33.897Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (71,16,NULL,'bot','Thanks Maya, request SIQ-1016 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-10-26T04:25:33.897Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (72,16,2,'it','That silent exit usually means a stale Visual C++ redistributable. Please install the supported package from this link and reboot before running the SupportIQ installer again.',0,'2026-10-26T06:24:33.897Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (73,16,5,'customer','That fixed it. Installed and signed in.',0,'2026-10-26T10:04:33.897Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (74,17,6,'customer','Workspace members get a 403 on Settings → API keys, even though they have the Developer role. Workspace owners can access the page. Is this a permissions bug?',0,'2026-10-30T04:24:33.951Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (75,17,NULL,'bot','Thanks Daniel, request SIQ-1017 is in the IT support queue. A support agent will review it. Your target first response is 2 hours. You can follow every update right here in SupportIQ.',0,'2026-10-30T04:25:33.951Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (76,17,4,'it','I can see the Developer policy is missing the API keys read scope. I''m adding it now; you won''t need to change anything on your side.',0,'2026-10-30T05:24:33.951Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (77,17,4,'it','Scope added and verified with a test member account. Please have your team refresh and try again.',0,'2026-10-30T10:24:33.951Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (78,18,7,'customer','We''re onboarding 400 staff next month. Is there a CSV template for bulk user import, and what are the limits per upload?',0,'2026-10-22T04:24:34.013Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (79,18,NULL,'bot','Thanks Elena, request SIQ-1018 is in the IT support queue. A support agent will review it. Your target first response is 1 business day. You can follow every update right here in SupportIQ.',0,'2026-10-22T04:25:34.013Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (80,18,3,'it','Yes — use the CSV template in Settings → Members → Import. The limit is 500 rows per upload, and email is the unique key. Required columns are name, email, and role.',0,'2026-10-22T09:24:34.013Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (81,18,7,'customer','Imported 412 users successfully. Thanks.',0,'2026-10-22T17:44:34.013Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (82,19,5,'customer','API calls to the EU region are taking 4–8 seconds intermittently since 09:00 UTC. US calls are normal. Request IDs in the attached log range from 09:04 to 09:22.',0,'2026-10-24T04:24:34.078Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (83,19,NULL,'bot','Thanks Maya, request SIQ-1019 is in the IT support queue. A support agent will review it. Your target first response is 2 hours. You can follow every update right here in SupportIQ.',0,'2026-10-24T04:25:34.078Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (84,19,2,'it','Thanks — the EU edge pool is saturated. We''re adding capacity now and will watch p95 latency until it holds below 300 ms.',0,'2026-10-24T05:54:34.078Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (85,19,2,'it','Capacity added. p95 is back under 300 ms across the last 20 minutes.',0,'2026-10-24T09:04:34.078Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (86,20,6,'customer','For our compliance program we need audit log retention beyond the default window. Can you enable the 400-day retention on our workspace, or tell us what the process is?',0,'2026-11-03T18:24:34.143Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (87,20,NULL,'bot','Thanks Daniel, request SIQ-1020 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-11-03T18:25:34.143Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (88,21,7,'customer','Please send a prepaid return label for the laptop you replaced last week. The depot said they can''t accept it without a label. Serial is ARL-2291.',0,'2026-10-15T04:24:34.170Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (89,21,NULL,'bot','Thanks Elena, request SIQ-1021 is in the IT support queue. A support agent will review it. Your target first response is 1 business day. You can follow every update right here in SupportIQ.',0,'2026-10-15T04:25:34.170Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (90,21,4,'it','I''ve issued a prepaid return label to your registered address. The depot should accept the serial ARL-2291 with that label — no other paperwork needed.',0,'2026-10-16T00:24:34.170Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (91,21,4,'it','Depot has confirmed receipt of the laptop. Closing this request.',0,'2026-10-17T04:04:34.170Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (92,22,5,'customer','Our daily usage report is set for 06:00 UTC and didn''t run today. The schedule still shows active. Yesterday''s run completed normally.',0,'2026-11-04T03:24:34.232Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (93,22,NULL,'bot','Thanks Maya, request SIQ-1022 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-11-04T03:25:34.232Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (94,23,5,'customer','qwe',0,'2026-11-05T00:53:52.275Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (95,23,NULL,'bot','Thanks Maya, request SIQ-1023 is in the IT support queue. A support agent will review it. Your target first response is 8 hours. You can follow every update right here in SupportIQ.',0,'2026-11-05T00:53:53.276Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (96,23,NULL,'system','Assistant conversation — captured when this request was created

SupportIQ Assistant: Hi Maya, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?

Customer: I keep getting redirected when I sign in with SSO.

SupportIQ Assistant: If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.

Customer: How do I reset my password?

SupportIQ Assistant: Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn''t arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.

Customer: Where can I find an invoice or receipt?

SupportIQ Assistant: Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.

Customer: I''m stuck in an SSO login loop

SupportIQ Assistant: If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn''t expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don''t send passwords or MFA codes here.

Customer: Where can I find an invoice or receipt?

SupportIQ Assistant: Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can''t be changed from chat.',1,'2026-11-05T00:53:54.276Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (97,23,5,'customer','Hello',0,'2026-11-05T01:01:22.709Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (98,23,1,'admin','Hello',0,'2026-11-05T01:06:39.067Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (101,6,2,'it','OKAY',1,'2026-11-05T05:38:04.706Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (102,25,11,'customer','Hello Beulah',0,'2026-11-05T05:42:58.654Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (103,25,NULL,'bot','Thanks ADMIN, request SIQ-1025 is in the IT support queue. A support agent will review it. Your target first response is 1 hour. You can follow every update right here in SupportIQ.',0,'2026-11-05T05:42:59.655Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (104,25,NULL,'system','Assistant conversation — captured when this request was created

SupportIQ Assistant: Hi ADMIN, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?

Customer: Help me

SupportIQ Assistant: I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.

Customer: i need pc

SupportIQ Assistant: I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.',1,'2026-11-05T05:43:00.656Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (105,25,11,'customer','',0,'2026-11-05T05:43:40.060Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (106,25,1,'admin','Hello',0,'2026-11-05T05:44:01.336Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (107,25,11,'customer','sdfsdfsdfsdf',0,'2026-11-05T05:44:15.843Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (108,25,11,'customer','sadasd',0,'2026-11-05T05:44:19.491Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (109,25,11,'customer','asdasdd',0,'2026-11-05T05:44:27.243Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (140,23,5,'customer','09750520147',0,'2026-11-05T08:41:10.721Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (141,37,5,'customer','09088184444',0,'2026-11-05T09:02:43.607Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (142,37,NULL,'bot','Thanks Maya, request SIQ-1037 is in the IT support queue. A support agent will review it. Your target first response is 1 hour. You can follow every update right here in SupportIQ.',0,'2026-11-05T09:02:44.609Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (143,37,5,'customer','09088184444',0,'2026-11-05T09:02:53.525Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (144,23,5,'customer','what?',0,'2026-11-07T02:02:30.854Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (145,23,5,'customer','NBo',0,'2026-11-07T02:06:41.262Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (146,23,NULL,'bot','How was your support experience? You can leave a rating on this request.',0,'2026-11-07T02:19:19.832Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (149,25,1,'admin','Hello',0,'2026-11-07T02:41:48.062Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (150,25,2,'it','Coffee',0,'2026-11-07T02:42:07.478Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (157,166,5,'customer','Gwapo ko',0,'2026-11-09T06:14:17.774Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (158,166,NULL,'bot','Thanks Maya, request SIQ-1166 is in the IT support queue. A support agent will review it. Your target first response is 1 hour. You can follow every update right here in SupportIQ.',0,'2026-11-09T06:14:18.776Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (159,25,11,'customer','utin',0,'2026-11-09T06:18:24.238Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (176,25,11,'customer','',0,'2026-11-11T01:46:27.435Z',0,NULL,NULL);
INSERT INTO "messages" VALUES (177,166,5,'customer','Hello',0,'2026-11-11T01:49:35.004Z',0,NULL,NULL);
INSERT INTO "products" VALUES (1,'Payro',1,'2026-11-05T06:07:26.940Z');
INSERT INTO "products" VALUES (2,'Eduvia',1,'2026-11-05T06:07:26.940Z');
INSERT INTO "products" VALUES (3,'Vaulta',1,'2026-11-05T06:07:26.940Z');
INSERT INTO "products" VALUES (4,'Finara',1,'2026-11-05T06:07:26.940Z');
INSERT INTO "products" VALUES (5,'VendiX POS',1,'2026-11-05T06:07:26.940Z');
INSERT INTO "products" VALUES (6,'NenPOS',1,'2026-11-05T06:38:48.837Z');
INSERT INTO "remote_sessions" VALUES (25,166,2,5,NULL,'ended','2026-11-09T09:12:38.236Z','2026-11-09T09:12:39.724Z','2026-11-09T09:12:39.724Z','2026-11-09T09:12:58.533Z',5,'2026-11-09T11:12:39.724Z',8,'2026-11-09T09:12:39.724Z','stopped_by_customer','2026-11-09T09:12:55.046Z',NULL);
INSERT INTO "remote_sessions" VALUES (26,166,2,5,NULL,'ended','2026-11-09T09:13:48.164Z','2026-11-09T09:13:50.403Z','2026-11-09T09:13:50.403Z','2026-11-09T09:14:31.844Z',5,'2026-11-09T11:13:50.403Z',8,'2026-11-09T09:13:50.403Z','stopped_by_customer','2026-11-09T09:14:31.130Z',NULL);
INSERT INTO "remote_sessions" VALUES (27,166,2,5,NULL,'ended','2026-11-11T01:10:46.471Z',NULL,NULL,'2026-11-11T01:11:51.783Z',2,'2026-11-11T01:25:46.471Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (28,166,2,5,NULL,'ended','2026-11-11T01:11:53.014Z',NULL,NULL,'2026-11-11T01:12:08.358Z',2,'2026-11-11T01:26:53.014Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (29,166,2,5,NULL,'ended','2026-11-11T01:15:36.058Z',NULL,NULL,'2026-11-11T01:16:26.230Z',2,'2026-11-11T01:30:36.058Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (30,166,2,5,NULL,'ended','2026-11-11T01:16:29.756Z',NULL,NULL,'2026-11-11T01:17:27.915Z',2,'2026-11-11T01:31:29.756Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (31,166,2,5,NULL,'ended','2026-11-11T01:17:30.594Z',NULL,NULL,'2026-11-11T01:17:44.598Z',2,'2026-11-11T01:32:30.594Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (32,166,2,5,NULL,'ended','2026-11-11T01:17:56.758Z',NULL,NULL,'2026-11-11T01:18:26.970Z',2,'2026-11-11T01:32:56.758Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (33,166,2,5,NULL,'ended','2026-11-11T01:33:34.786Z',NULL,NULL,'2026-11-11T01:34:10.997Z',2,'2026-11-11T01:48:34.786Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (34,166,2,5,NULL,'ended','2026-11-11T01:34:11.522Z',NULL,NULL,'2026-11-11T01:34:12.338Z',2,'2026-11-11T01:49:11.522Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (35,25,2,11,NULL,'declined','2026-11-11T01:46:26.071Z',NULL,NULL,'2026-11-11T01:47:03.956Z',11,'2026-11-11T02:01:26.071Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (36,25,2,11,NULL,'ended','2026-11-11T01:47:05.999Z','2026-11-11T01:47:12.104Z','2026-11-11T01:47:12.104Z','2026-11-11T01:47:58.152Z',11,'2026-11-11T03:47:12.104Z',12,'2026-11-11T01:47:12.104Z','stopped_by_customer','2026-11-11T01:47:57.632Z',NULL);
INSERT INTO "remote_sessions" VALUES (37,25,2,11,NULL,'ended','2026-11-11T01:47:59.917Z','2026-11-11T01:48:01.354Z','2026-11-11T01:48:01.354Z','2026-11-11T01:48:08.936Z',11,'2026-11-11T03:48:01.355Z',12,'2026-11-11T01:48:01.354Z','stopped_by_customer','2026-11-11T01:48:06.501Z',NULL);
INSERT INTO "remote_sessions" VALUES (38,23,2,5,NULL,'ended','2026-11-11T01:48:21.829Z',NULL,NULL,'2026-11-11T01:48:40.445Z',2,'2026-11-11T02:03:21.829Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (39,166,2,5,NULL,'declined','2026-11-11T01:48:44.540Z',NULL,NULL,'2026-11-11T01:49:38.286Z',5,'2026-11-11T02:03:44.540Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (40,166,2,5,NULL,'ended','2026-11-11T01:50:32.774Z','2026-11-11T01:50:37.118Z','2026-11-11T01:50:37.118Z','2026-11-11T01:51:18.214Z',2,'2026-11-11T03:50:37.118Z',13,'2026-11-11T01:50:37.118Z','stopped_by_agent','2026-11-11T01:50:42.217Z',NULL);
INSERT INTO "remote_sessions" VALUES (41,166,2,5,NULL,'declined','2026-11-11T01:51:19.262Z',NULL,NULL,'2026-11-11T01:51:32.869Z',5,'2026-11-11T02:06:19.262Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (42,166,2,5,NULL,'ended','2026-11-11T01:51:58.517Z','2026-11-11T01:52:05.475Z','2026-11-11T01:52:05.475Z','2026-11-11T01:52:26.662Z',2,'2026-11-11T03:52:05.475Z',14,'2026-11-11T01:52:05.475Z','stopped_by_agent','2026-11-11T01:52:25.804Z',NULL);
INSERT INTO "remote_sessions" VALUES (43,166,2,5,NULL,'ended','2026-11-11T02:02:46.670Z','2026-11-11T02:02:52.743Z','2026-11-11T02:02:52.743Z','2026-11-11T02:03:21.382Z',2,'2026-11-11T04:02:52.743Z',14,'2026-11-11T02:02:52.743Z','stopped_by_agent','2026-11-11T02:03:18.155Z',NULL);
INSERT INTO "remote_sessions" VALUES (44,23,2,5,NULL,'ended','2026-11-11T02:06:44.414Z','2026-11-11T02:06:47.905Z','2026-11-11T02:06:47.905Z','2026-11-11T02:07:10.907Z',2,'2026-11-11T04:06:47.905Z',14,'2026-11-11T02:06:47.905Z','stopped_by_agent','2026-11-11T02:07:08.229Z',NULL);
INSERT INTO "remote_sessions" VALUES (45,166,2,5,NULL,'ended','2026-11-11T02:08:53.182Z','2026-11-11T02:08:59.056Z','2026-11-11T02:08:59.056Z','2026-11-11T02:09:23.372Z',2,'2026-11-11T04:08:59.056Z',14,'2026-11-11T02:08:59.056Z','stopped_by_agent','2026-11-11T02:09:19.365Z',NULL);
INSERT INTO "remote_sessions" VALUES (46,166,2,5,NULL,'ended','2026-11-11T02:09:37.285Z','2026-11-11T02:09:44.357Z','2026-11-11T02:09:44.357Z','2026-11-11T02:09:50.908Z',2,'2026-11-11T04:09:44.357Z',14,'2026-11-11T02:09:44.357Z','stopped_by_agent','2026-11-11T02:09:49.503Z',NULL);
INSERT INTO "remote_sessions" VALUES (49,452,2,5,NULL,'ended','2026-11-11T02:41:51.329Z','2026-11-11T02:41:51.346Z','2026-11-11T02:41:51.346Z','2026-11-11T02:41:51.387Z',5,'2026-11-11T04:41:51.377Z',18,'2026-11-11T02:41:51.346Z','stopped_by_customer','2026-11-11T02:41:51.357Z','consent');
INSERT INTO "remote_sessions" VALUES (50,453,2,5,NULL,'declined','2026-11-11T02:41:51.422Z',NULL,NULL,'2026-11-11T02:41:51.433Z',5,'2026-11-11T02:56:51.422Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (51,453,2,5,NULL,'declined','2026-11-11T02:41:51.439Z',NULL,NULL,'2026-11-11T02:41:51.449Z',5,'2026-11-11T02:56:51.439Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (52,453,2,5,NULL,'expired','2026-11-11T02:41:51.455Z',NULL,NULL,'2026-11-11T02:41:51.464Z',NULL,'2026-11-11T02:40:51.460Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (53,454,2,5,NULL,'ended','2026-11-11T02:41:51.649Z','2026-11-11T02:41:51.649Z','2026-11-11T02:41:51.649Z','2026-11-11T02:41:51.665Z',5,'2026-11-11T04:41:51.649Z',21,'2026-11-11T02:41:51.649Z','stopped_by_customer',NULL,'password');
INSERT INTO "remote_sessions" VALUES (54,454,2,5,NULL,'ended','2026-11-11T02:41:51.677Z','2026-11-11T02:47:28.164Z','2026-11-11T02:47:28.164Z','2026-11-11T03:19:56.920Z',5,'2026-11-11T04:47:28.164Z',14,'2026-11-11T02:47:28.164Z','device_revoked',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (55,455,2,5,NULL,'ended','2026-11-11T02:42:07.784Z','2026-11-11T02:42:07.803Z','2026-11-11T02:42:07.803Z','2026-11-11T02:42:07.842Z',5,'2026-11-11T04:42:07.832Z',22,'2026-11-11T02:42:07.803Z','stopped_by_customer','2026-11-11T02:42:07.814Z','consent');
INSERT INTO "remote_sessions" VALUES (56,456,2,5,NULL,'declined','2026-11-11T02:42:07.880Z',NULL,NULL,'2026-11-11T02:42:07.892Z',5,'2026-11-11T02:57:07.880Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (57,456,2,5,NULL,'declined','2026-11-11T02:42:07.900Z',NULL,NULL,'2026-11-11T02:42:07.912Z',5,'2026-11-11T02:57:07.900Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (58,456,2,5,NULL,'expired','2026-11-11T02:42:07.918Z',NULL,NULL,'2026-11-11T02:42:07.929Z',NULL,'2026-11-11T02:41:07.924Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (59,457,2,5,NULL,'ended','2026-11-11T02:42:08.111Z','2026-11-11T02:42:08.111Z','2026-11-11T02:42:08.111Z','2026-11-11T02:42:08.128Z',5,'2026-11-11T04:42:08.111Z',25,'2026-11-11T02:42:08.111Z','stopped_by_customer',NULL,'password');
INSERT INTO "remote_sessions" VALUES (60,457,2,5,NULL,'ended','2026-11-11T02:42:08.192Z','2026-11-11T02:42:08.246Z','2026-11-11T02:42:08.246Z','2026-11-11T03:24:44.685Z',NULL,'2026-11-11T04:42:08.246Z',25,'2026-11-11T02:42:08.246Z','stale_cleanup',NULL,'password');
INSERT INTO "remote_sessions" VALUES (65,463,2,5,NULL,'ended','2026-11-11T02:44:33.380Z','2026-11-11T02:44:33.401Z','2026-11-11T02:44:33.401Z','2026-11-11T02:44:33.458Z',5,'2026-11-11T04:44:33.447Z',29,'2026-11-11T02:44:33.401Z','stopped_by_customer','2026-11-11T02:44:33.412Z','consent');
INSERT INTO "remote_sessions" VALUES (66,464,2,5,NULL,'declined','2026-11-11T02:44:33.493Z',NULL,NULL,'2026-11-11T02:44:33.504Z',5,'2026-11-11T02:59:33.493Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (67,464,2,5,NULL,'declined','2026-11-11T02:44:33.510Z',NULL,NULL,'2026-11-11T02:44:33.522Z',5,'2026-11-11T02:59:33.510Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (68,464,2,5,NULL,'expired','2026-11-11T02:44:33.528Z',NULL,NULL,'2026-11-11T02:44:33.560Z',NULL,'2026-11-11T02:43:33.533Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (69,465,2,5,NULL,'ended','2026-11-11T02:44:33.769Z','2026-11-11T02:44:33.769Z','2026-11-11T02:44:33.769Z','2026-11-11T02:44:33.965Z',5,'2026-11-11T04:44:33.769Z',32,'2026-11-11T02:44:33.769Z','stopped_by_customer',NULL,'password');
INSERT INTO "remote_sessions" VALUES (70,465,2,5,NULL,'ended','2026-11-11T02:44:34.032Z','2026-11-11T02:44:34.087Z','2026-11-11T02:44:34.087Z','2026-11-11T03:24:44.685Z',NULL,'2026-11-11T04:44:34.087Z',32,'2026-11-11T02:44:34.087Z','stale_cleanup',NULL,'password');
INSERT INTO "remote_sessions" VALUES (71,480,2,5,NULL,'ended','2026-11-11T02:45:46.556Z','2026-11-11T02:45:46.577Z','2026-11-11T02:45:46.577Z','2026-11-11T02:45:46.620Z',5,'2026-11-11T04:45:46.609Z',34,'2026-11-11T02:45:46.577Z','stopped_by_customer','2026-11-11T02:45:46.589Z','consent');
INSERT INTO "remote_sessions" VALUES (72,481,2,5,NULL,'declined','2026-11-11T02:45:46.656Z',NULL,NULL,'2026-11-11T02:45:46.667Z',5,'2026-11-11T03:00:46.656Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (73,481,2,5,NULL,'declined','2026-11-11T02:45:46.673Z',NULL,NULL,'2026-11-11T02:45:46.683Z',5,'2026-11-11T03:00:46.673Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (74,481,2,5,NULL,'expired','2026-11-11T02:45:46.689Z',NULL,NULL,'2026-11-11T02:45:46.699Z',NULL,'2026-11-11T02:44:46.694Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (77,23,2,5,NULL,'ended','2026-11-11T02:47:18.094Z',NULL,NULL,'2026-11-11T02:48:10.097Z',2,'2026-11-11T03:02:18.094Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (78,483,2,5,NULL,'ended','2026-11-11T03:05:01.059Z','2026-11-11T03:05:01.090Z','2026-11-11T03:05:01.090Z','2026-11-11T03:05:01.130Z',5,'2026-11-11T05:05:01.120Z',39,'2026-11-11T03:05:01.090Z','stopped_by_customer','2026-11-11T03:05:01.101Z','consent');
INSERT INTO "remote_sessions" VALUES (79,484,2,5,NULL,'declined','2026-11-11T03:05:01.171Z',NULL,NULL,'2026-11-11T03:05:01.198Z',5,'2026-11-11T03:20:01.171Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (80,484,2,5,NULL,'declined','2026-11-11T03:05:01.204Z',NULL,NULL,'2026-11-11T03:05:01.215Z',5,'2026-11-11T03:20:01.204Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (81,484,2,5,NULL,'expired','2026-11-11T03:05:01.223Z',NULL,NULL,'2026-11-11T03:05:01.234Z',NULL,'2026-11-11T03:04:01.228Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (85,490,2,5,NULL,'ended','2026-11-11T03:05:52.862Z','2026-11-11T03:05:52.881Z','2026-11-11T03:05:52.881Z','2026-11-11T03:05:52.922Z',5,'2026-11-11T05:05:52.912Z',45,'2026-11-11T03:05:52.881Z','stopped_by_customer','2026-11-11T03:05:52.892Z','consent');
INSERT INTO "remote_sessions" VALUES (86,491,2,5,NULL,'declined','2026-11-11T03:05:52.958Z',NULL,NULL,'2026-11-11T03:05:52.969Z',5,'2026-11-11T03:20:52.958Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (87,491,2,5,NULL,'declined','2026-11-11T03:05:52.975Z',NULL,NULL,'2026-11-11T03:05:52.986Z',5,'2026-11-11T03:20:52.975Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (88,491,2,5,NULL,'expired','2026-11-11T03:05:52.992Z',NULL,NULL,'2026-11-11T03:05:53.002Z',NULL,'2026-11-11T03:04:52.997Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (92,508,2,5,NULL,'ended','2026-11-11T03:11:27.584Z','2026-11-11T03:11:27.603Z','2026-11-11T03:11:27.603Z','2026-11-11T03:11:27.675Z',5,'2026-11-11T05:11:27.652Z',51,'2026-11-11T03:11:27.603Z','stopped_by_customer','2026-11-11T03:11:27.615Z','consent');
INSERT INTO "remote_sessions" VALUES (93,509,2,5,NULL,'declined','2026-11-11T03:11:27.726Z',NULL,NULL,'2026-11-11T03:11:27.752Z',5,'2026-11-11T03:26:27.726Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (94,509,2,5,NULL,'declined','2026-11-11T03:11:27.758Z',NULL,NULL,'2026-11-11T03:11:27.782Z',5,'2026-11-11T03:26:27.758Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (95,509,2,5,NULL,'expired','2026-11-11T03:11:27.788Z',NULL,NULL,'2026-11-11T03:11:27.799Z',NULL,'2026-11-11T03:10:27.794Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (99,509,2,5,NULL,'ended','2026-11-11T03:14:49.209Z','2026-11-11T03:14:49.209Z','2026-11-11T03:14:49.209Z','2026-11-11T03:15:10.307Z',2,'2026-11-11T05:14:49.209Z',34,'2026-11-11T03:14:49.209Z','stopped_by_agent',NULL,'password');
INSERT INTO "remote_sessions" VALUES (100,513,2,5,NULL,'ended','2026-11-11T03:25:26.262Z','2026-11-11T03:25:26.285Z','2026-11-11T03:25:26.285Z','2026-11-11T03:25:26.334Z',5,'2026-11-11T05:25:26.317Z',57,'2026-11-11T03:25:26.285Z','stopped_by_customer','2026-11-11T03:25:26.296Z','consent');
INSERT INTO "remote_sessions" VALUES (101,514,2,5,NULL,'declined','2026-11-11T03:25:26.369Z',NULL,NULL,'2026-11-11T03:25:26.380Z',5,'2026-11-11T03:40:26.369Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (102,514,2,5,NULL,'declined','2026-11-11T03:25:26.386Z',NULL,NULL,'2026-11-11T03:25:26.397Z',5,'2026-11-11T03:40:26.386Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (103,514,2,5,NULL,'expired','2026-11-11T03:25:26.402Z',NULL,NULL,'2026-11-11T03:25:26.412Z',NULL,'2026-11-11T03:24:26.408Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (107,509,2,5,NULL,'ended','2026-11-11T03:30:44.716Z','2026-11-11T03:30:44.716Z','2026-11-11T03:30:44.716Z','2026-11-11T03:31:05.606Z',2,'2026-11-11T05:30:44.716Z',34,'2026-11-11T03:30:44.716Z','stopped_by_agent',NULL,'password');
INSERT INTO "remote_sessions" VALUES (108,509,2,5,NULL,'ended','2026-11-11T03:31:06.733Z','2026-11-11T03:32:26.686Z','2026-11-11T03:32:26.686Z','2026-11-11T03:33:27.708Z',2,'2026-11-11T05:32:26.686Z',63,'2026-11-11T03:32:26.686Z','stopped_by_agent',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (109,509,2,5,NULL,'ended','2026-11-11T03:33:34.690Z','2026-11-11T03:34:22.025Z','2026-11-11T03:34:22.025Z','2026-11-11T03:34:33.545Z',2,'2026-11-11T05:34:22.025Z',63,'2026-11-11T03:34:22.025Z','stopped_by_agent',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (110,509,2,5,NULL,'ended','2026-11-11T03:34:35.812Z','2026-11-11T03:34:51.546Z','2026-11-11T03:34:51.546Z','2026-11-11T03:35:18.740Z',2,'2026-11-11T05:34:51.547Z',63,'2026-11-11T03:34:51.546Z','stopped_by_agent',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (111,509,2,5,NULL,'ended','2026-11-11T03:35:20.077Z',NULL,NULL,'2026-11-11T03:35:21.124Z',2,'2026-11-11T03:50:20.077Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (112,509,2,5,NULL,'ended','2026-11-11T03:35:42.296Z','2026-11-11T03:35:42.296Z','2026-11-11T03:35:42.296Z','2026-11-11T03:35:49.789Z',2,'2026-11-11T05:35:42.296Z',63,'2026-11-11T03:35:42.296Z','stopped_by_agent',NULL,'password');
INSERT INTO "remote_sessions" VALUES (113,514,2,5,NULL,'ended','2026-11-11T03:47:24.214Z','2026-11-11T03:47:36.143Z','2026-11-11T03:47:36.143Z','2026-11-11T03:48:25.581Z',2,'2026-11-11T05:47:36.143Z',64,'2026-11-11T03:47:36.143Z','stopped_by_agent',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (114,536,2,5,NULL,'ended','2026-11-11T03:51:22.134Z','2026-11-11T03:51:22.157Z','2026-11-11T03:51:22.157Z','2026-11-11T03:51:22.202Z',5,'2026-11-11T05:51:22.189Z',69,'2026-11-11T03:51:22.157Z','stopped_by_customer','2026-11-11T03:51:22.169Z','consent');
INSERT INTO "remote_sessions" VALUES (115,537,2,5,NULL,'declined','2026-11-11T03:51:22.239Z',NULL,NULL,'2026-11-11T03:51:22.250Z',5,'2026-11-11T04:06:22.239Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (116,537,2,5,NULL,'declined','2026-11-11T03:51:22.256Z',NULL,NULL,'2026-11-11T03:51:22.266Z',5,'2026-11-11T04:06:22.256Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (117,537,2,5,NULL,'expired','2026-11-11T03:51:22.271Z',NULL,NULL,'2026-11-11T03:51:22.281Z',NULL,'2026-11-11T03:50:22.276Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (121,23,2,5,NULL,'ended','2026-11-11T03:54:03.477Z','2026-11-11T03:54:04.682Z','2026-11-11T03:54:04.682Z','2026-11-11T03:54:10.277Z',5,'2026-11-11T05:54:04.682Z',64,'2026-11-11T03:54:04.682Z','stopped_by_customer','2026-11-11T03:54:09.969Z','consent');
INSERT INTO "remote_sessions" VALUES (122,557,2,5,NULL,'ended','2026-11-11T03:54:30.750Z','2026-11-11T03:54:30.771Z','2026-11-11T03:54:30.771Z','2026-11-11T03:54:30.814Z',5,'2026-11-11T05:54:30.803Z',77,'2026-11-11T03:54:30.771Z','stopped_by_customer','2026-11-11T03:54:30.782Z','consent');
INSERT INTO "remote_sessions" VALUES (123,558,2,5,NULL,'declined','2026-11-11T03:54:30.852Z',NULL,NULL,'2026-11-11T03:54:30.863Z',5,'2026-11-11T04:09:30.852Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (124,558,2,5,NULL,'declined','2026-11-11T03:54:30.869Z',NULL,NULL,'2026-11-11T03:54:30.880Z',5,'2026-11-11T04:09:30.869Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (125,558,2,5,NULL,'expired','2026-11-11T03:54:30.886Z',NULL,NULL,'2026-11-11T03:54:30.898Z',NULL,'2026-11-11T03:53:30.892Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (129,558,2,5,NULL,'ended','2026-11-11T03:55:34.809Z','2026-11-11T03:55:41.898Z','2026-11-11T03:55:41.898Z','2026-11-11T03:56:00.322Z',2,'2026-11-11T05:55:41.898Z',64,'2026-11-11T03:55:41.898Z','stopped_by_agent',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (130,558,2,5,NULL,'ended','2026-11-11T03:56:02.868Z','2026-11-11T03:56:06.150Z','2026-11-11T03:56:06.150Z','2026-11-11T03:56:12.989Z',2,'2026-11-11T05:56:06.150Z',64,'2026-11-11T03:56:06.150Z','stopped_by_agent',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (131,558,2,5,NULL,'declined','2026-11-11T03:56:13.908Z',NULL,NULL,'2026-11-11T03:56:14.989Z',5,'2026-11-11T04:11:13.908Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (132,558,2,5,NULL,'ended','2026-11-11T03:56:20.469Z',NULL,NULL,'2026-11-11T03:56:26.893Z',2,'2026-11-11T04:11:20.469Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (133,558,2,5,NULL,'ended','2026-11-11T03:58:07.005Z','2026-11-11T03:58:12.898Z','2026-11-11T03:58:12.898Z','2026-11-11T03:58:55.253Z',2,'2026-11-11T05:58:12.898Z',83,'2026-11-11T03:58:12.898Z','stopped_by_agent',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (134,578,2,5,NULL,'ended','2026-11-11T04:09:04.671Z','2026-11-11T04:09:04.693Z','2026-11-11T04:09:04.693Z','2026-11-11T04:09:04.736Z',5,'2026-11-11T06:09:04.726Z',86,'2026-11-11T04:09:04.693Z','stopped_by_customer','2026-11-11T04:09:04.705Z','consent');
INSERT INTO "remote_sessions" VALUES (135,579,2,5,NULL,'declined','2026-11-11T04:09:04.773Z',NULL,NULL,'2026-11-11T04:09:04.784Z',5,'2026-11-11T04:24:04.773Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (136,579,2,5,NULL,'declined','2026-11-11T04:09:04.790Z',NULL,NULL,'2026-11-11T04:09:04.800Z',5,'2026-11-11T04:24:04.790Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (137,579,2,5,NULL,'expired','2026-11-11T04:09:04.806Z',NULL,NULL,'2026-11-11T04:09:04.816Z',NULL,'2026-11-11T04:08:04.811Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (141,558,2,5,NULL,'ended','2026-11-11T04:56:06.758Z',NULL,NULL,'2026-11-11T04:56:16.644Z',2,'2026-11-11T05:11:06.758Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (142,558,2,5,NULL,'ended','2026-11-11T04:56:33.780Z','2026-11-11T04:57:10.158Z','2026-11-11T04:57:10.158Z','2026-11-11T04:57:23.425Z',5,'2026-11-11T06:57:10.158Z',92,'2026-11-11T04:57:10.158Z','device_revoked',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (143,558,2,5,NULL,'ended','2026-11-11T04:58:00.853Z',NULL,NULL,'2026-11-11T04:59:32.011Z',2,'2026-11-11T05:13:00.853Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (144,558,2,5,NULL,'expired','2026-11-11T05:05:27.660Z','2026-11-11T05:05:32.609Z','2026-11-11T05:05:32.609Z','2026-11-11T07:05:32.616Z',NULL,'2026-11-11T07:05:32.609Z',93,'2026-11-11T05:05:32.609Z','expired',NULL,'consent');
INSERT INTO "remote_sessions" VALUES (145,596,2,5,NULL,'ended','2026-11-11T05:11:30.053Z','2026-11-11T05:11:30.075Z','2026-11-11T05:11:30.075Z','2026-11-11T05:11:30.140Z',5,'2026-11-11T07:11:30.130Z',94,'2026-11-11T05:11:30.075Z','stopped_by_customer','2026-11-11T05:11:30.086Z','consent');
INSERT INTO "remote_sessions" VALUES (146,597,2,5,NULL,'declined','2026-11-11T05:11:30.209Z',NULL,NULL,'2026-11-11T05:11:30.256Z',5,'2026-11-11T05:26:30.209Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (147,597,2,5,NULL,'declined','2026-11-11T05:11:30.262Z',NULL,NULL,'2026-11-11T05:11:30.274Z',5,'2026-11-11T05:26:30.262Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (148,597,2,5,NULL,'expired','2026-11-11T05:11:30.287Z',NULL,NULL,'2026-11-11T05:11:30.299Z',NULL,'2026-11-11T05:10:30.293Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (152,623,2,5,NULL,'ended','2026-11-11T05:11:42.087Z','2026-11-11T05:11:42.109Z','2026-11-11T05:11:42.109Z','2026-11-11T05:11:42.149Z',5,'2026-11-11T07:11:42.140Z',106,'2026-11-11T05:11:42.109Z','stopped_by_customer','2026-11-11T05:11:42.120Z','consent');
INSERT INTO "remote_sessions" VALUES (153,624,2,5,NULL,'declined','2026-11-11T05:11:42.193Z',NULL,NULL,'2026-11-11T05:11:42.206Z',5,'2026-11-11T05:26:42.193Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (154,624,2,5,NULL,'declined','2026-11-11T05:11:42.211Z',NULL,NULL,'2026-11-11T05:11:42.222Z',5,'2026-11-11T05:26:42.211Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (155,624,2,5,NULL,'expired','2026-11-11T05:11:42.228Z',NULL,NULL,'2026-11-11T05:11:42.237Z',NULL,'2026-11-11T05:10:42.233Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (159,644,2,5,NULL,'ended','2026-11-11T05:11:46.395Z','2026-11-11T05:11:46.417Z','2026-11-11T05:11:46.417Z','2026-11-11T05:11:46.466Z',5,'2026-11-11T07:11:46.448Z',114,'2026-11-11T05:11:46.417Z','stopped_by_customer','2026-11-11T05:11:46.428Z','consent');
INSERT INTO "remote_sessions" VALUES (160,645,2,5,NULL,'declined','2026-11-11T05:11:46.501Z',NULL,NULL,'2026-11-11T05:11:46.512Z',5,'2026-11-11T05:26:46.501Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (161,645,2,5,NULL,'declined','2026-11-11T05:11:46.518Z',NULL,NULL,'2026-11-11T05:11:46.529Z',5,'2026-11-11T05:26:46.518Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (162,645,2,5,NULL,'expired','2026-11-11T05:11:46.535Z',NULL,NULL,'2026-11-11T05:11:46.545Z',NULL,'2026-11-11T05:10:46.540Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (166,665,2,5,NULL,'ended','2026-11-11T05:11:51.550Z','2026-11-11T05:11:51.572Z','2026-11-11T05:11:51.572Z','2026-11-11T05:11:51.613Z',5,'2026-11-11T07:11:51.604Z',122,'2026-11-11T05:11:51.572Z','stopped_by_customer','2026-11-11T05:11:51.583Z','consent');
INSERT INTO "remote_sessions" VALUES (167,666,2,5,NULL,'declined','2026-11-11T05:11:51.650Z',NULL,NULL,'2026-11-11T05:11:51.661Z',5,'2026-11-11T05:26:51.650Z',NULL,NULL,'declined_by_customer',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (168,666,2,5,NULL,'declined','2026-11-11T05:11:51.680Z',NULL,NULL,'2026-11-11T05:11:51.691Z',5,'2026-11-11T05:26:51.680Z',NULL,NULL,'declined_in_agent',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (169,666,2,5,NULL,'expired','2026-11-11T05:11:51.704Z',NULL,NULL,'2026-11-11T05:11:51.714Z',NULL,'2026-11-11T05:10:51.709Z',NULL,NULL,'expired',NULL,NULL);
INSERT INTO "remote_sessions" VALUES (173,666,2,5,NULL,'ended','2026-11-11T05:21:28.907Z',NULL,NULL,'2026-11-11T05:30:39.530Z',2,'2026-11-11T05:36:28.907Z',NULL,NULL,'stopped_by_agent',NULL,NULL);
INSERT INTO "sessions" VALUES ('9727e303afb6590cf546e65d843a6b580b64b1cbf1d2b5d7f5fdc17deda7eb47',1,'2026-11-04T04:24:54.871Z','2026-12-04T04:24:54.871Z');
INSERT INTO "sessions" VALUES ('e608e6b6f20c2be2cf62b91ace6a2e10b5aafeb59697dbec68da947feaba9e4d',5,'2026-11-04T04:24:55.326Z','2026-12-04T04:24:55.326Z');
INSERT INTO "sessions" VALUES ('ca1f7e8ed0197af6eb8abd1d8ee39a5d45d12a4fee25f18da2c856463ebd07cf',1,'2026-11-04T04:25:56.575Z','2026-12-04T04:25:56.575Z');
INSERT INTO "sessions" VALUES ('52cb1d05927347432ae95c76fca954bbd22ac35eb37a7c9579301b095b123f43',1,'2026-11-04T09:05:21.520Z','2026-12-04T09:05:21.520Z');
INSERT INTO "sessions" VALUES ('d5293b7d2b140bc32969984273a832b0e9473b21eb09d1e348d3223e9833f62e',5,'2026-11-04T09:06:41.601Z','2026-12-04T09:06:41.602Z');
INSERT INTO "sessions" VALUES ('776eda20075cc9dbad8cd33e30eef8a1d7fd07ca5efdf20070419b46139b0912',1,'2026-11-04T09:06:41.916Z','2026-12-04T09:06:41.916Z');
INSERT INTO "sessions" VALUES ('e1ca376a5627689b0c8d9dc483e235c9f85f5b94a1372e8af3b18cbf160c0676',1,'2026-11-05T00:59:28.650Z','2026-12-05T00:59:28.650Z');
INSERT INTO "sessions" VALUES ('f2754aa0358ad9fcbd9edf50e36eebbecc41e6bcf9846ad67be485007a04cbd1',1,'2026-11-05T05:05:49.836Z','2026-12-05T05:05:49.836Z');
INSERT INTO "sessions" VALUES ('c699375b469546c3f5b58de808b6402fda011415c2d0373fe386927172cbc68d',3,'2026-11-05T05:05:49.971Z','2026-12-05T05:05:49.971Z');
INSERT INTO "sessions" VALUES ('64aa4582fc1ccb05bba4784a582a57143d5bc1dd2d5b45cbbb9f8a3aba0241fd',4,'2026-11-05T05:05:50.029Z','2026-12-05T05:05:50.029Z');
INSERT INTO "sessions" VALUES ('881152449928fc40b7067ee407be6bcbc8b4b42c9fb2e5653c9892241d3c818b',5,'2026-11-05T05:05:50.090Z','2026-12-05T05:05:50.090Z');
INSERT INTO "sessions" VALUES ('22bcb3188ebe39e077553c7337ddf49b2bb28311c50249a8e40e4016a7823a01',1,'2026-11-05T05:06:15.085Z','2026-12-05T05:06:15.085Z');
INSERT INTO "sessions" VALUES ('3ab4afd377e56b74f5d23da07cebc163a4a7c393d64e9cb0845d6756aa9f0bd9',1,'2026-11-05T05:15:14.312Z','2026-12-05T05:15:14.312Z');
INSERT INTO "sessions" VALUES ('c197b231eed48533d8a81dac599bb70c6768d996e0f45564cfd57d1bf83d88f3',1,'2026-11-05T05:32:55.941Z','2026-12-05T05:32:55.941Z');
INSERT INTO "sessions" VALUES ('7f86911ba58114d8596c5dd00e905f3771fccc26323e1fb7b8b9c844b43db0c5',5,'2026-11-05T05:32:56.112Z','2026-12-05T05:32:56.112Z');
INSERT INTO "sessions" VALUES ('4a91ef9b9db643d30ebb08b3807eb9fb9af991e487c6db3b0e54d45636575eac',1,'2026-11-05T05:32:56.188Z','2026-12-05T05:32:56.188Z');
INSERT INTO "sessions" VALUES ('8d159f380eccb0c3f404d5548a6cb528aac94435fea2d3c33e5c1d6edf070bc7',11,'2026-11-05T05:42:09.744Z','2026-12-05T05:42:09.744Z');
INSERT INTO "sessions" VALUES ('0d8d753dc56ab3331e534e6362beb51bcf1183f723215ea0383b333474786b9b',1,'2026-11-05T06:55:33.094Z','2026-12-05T06:55:33.094Z');
INSERT INTO "sessions" VALUES ('f4dce6a001a92c1a94f15ec3f407429163dcd68cb4e87b7b2c466898ca6bb8d5',1,'2026-11-05T06:56:23.071Z','2026-12-05T06:56:23.071Z');
INSERT INTO "sessions" VALUES ('03e5d2705f7a6f059ee8e3891662bb1e6122bbff0c832856a2f0f5c682f7790d',1,'2026-11-05T07:25:36.487Z','2026-12-05T07:25:36.487Z');
INSERT INTO "sessions" VALUES ('a69a26ae07d382a9c3392dbd8f5945773fe17bb2b1cf5354947497e45abcc50f',1,'2026-11-05T07:25:39.929Z','2026-12-05T07:25:39.929Z');
INSERT INTO "sessions" VALUES ('4f87deba082275a76bfaa1e9f757ed15012dc5665de8bf24fb66bbff42c775f4',1,'2026-11-05T07:25:43.390Z','2026-12-05T07:25:43.390Z');
INSERT INTO "sessions" VALUES ('cac06f799ad068f6ad1ac4724a3ef76196bfd36c3e865ab855346970e2b274e3',1,'2026-11-05T07:27:51.973Z','2026-12-05T07:27:51.973Z');
INSERT INTO "sessions" VALUES ('fa1c366c49530719e08273af83c96318cad37965fe3e8d6c75f613d98a2b8daa',1,'2026-11-05T07:28:11.141Z','2026-12-05T07:28:11.141Z');
INSERT INTO "sessions" VALUES ('23f28b3fe4ea49e5d39cd937117ee93ac06ee051ecda194a7b7e09b6a44c6a7c',1,'2026-11-05T07:29:32.811Z','2026-12-05T07:29:32.811Z');
INSERT INTO "sessions" VALUES ('6161850db5929217bf682e4aa7d5f6d2148e60a3d460cc4eb3b533ba08f29110',1,'2026-11-05T07:30:04.665Z','2026-12-05T07:30:04.665Z');
INSERT INTO "sessions" VALUES ('20fcd8c34961e765c49d049b91719d4615479dbdaf92b5570c951f6a2bb9b073',1,'2026-11-05T07:30:21.134Z','2026-12-05T07:30:21.134Z');
INSERT INTO "sessions" VALUES ('a22735ad78be8c3063decbbeda5ec64cc9e0178ed43c76a2c528646bd3b94d0a',5,'2026-11-05T07:30:45.835Z','2026-12-05T07:30:45.835Z');
INSERT INTO "sessions" VALUES ('6c520e76f9777e2b6fdcf5c268e709e815ec9fe2fd3abafcc68555f0562de781',5,'2026-11-05T08:40:10.937Z','2026-12-05T08:40:10.937Z');
INSERT INTO "sessions" VALUES ('aea1c9e278c87b09e886f5a19bdb4be37c1c6d8703ba42d58cbb05a7f9ff7419',1,'2026-11-07T05:20:32.729Z','2026-12-07T05:20:32.729Z');
INSERT INTO "sessions" VALUES ('d89c112e125d0e887b830667631ea1f7438b1819b9c5c7f823d0dc490853aedf',1,'2026-11-07T06:31:43.463Z','2026-12-07T06:31:43.463Z');
INSERT INTO "sessions" VALUES ('a8c7529002aeb527dd0e5f13772ddd7347c89f6522affbbd1fcbe7c8885c29a1',3,'2026-11-07T06:31:52.584Z','2026-12-07T06:31:52.584Z');
INSERT INTO "sessions" VALUES ('71d1d32f8936d65383124538f719b47266c10c2c22240c7a21c2c41cb43e3799',4,'2026-11-07T06:31:52.737Z','2026-12-07T06:31:52.737Z');
INSERT INTO "sessions" VALUES ('59d123d394a6656f268778b15f4a2287b5f89c7d4de5ae9489e309ddab28ecf8',1,'2026-11-07T08:34:39.719Z','2026-12-07T08:34:39.719Z');
INSERT INTO "sessions" VALUES ('784f83b8b3dd229553e05b618d063f0c0db1992799e1ce5d7200eed109199db6',1,'2026-11-07T08:45:46.397Z','2026-12-07T08:45:46.397Z');
INSERT INTO "sessions" VALUES ('843da9a9229c3a21b0fbdcb8a5a3039ba414f0851a2aeb09d0e4f05f58e17b31',1,'2026-11-09T05:11:34.017Z','2026-12-09T05:11:34.017Z');
INSERT INTO "sessions" VALUES ('29a2ebfbb09da900086fb137de0e82e33dc7dc760d760e0c5016e572cdc95a5c',5,'2026-11-09T05:11:34.221Z','2026-12-09T05:11:34.221Z');
INSERT INTO "sessions" VALUES ('daeaae9dc4987d25f179f8b77f9df7817e7d0b82a13d02a51ac4b0476168fa97',1,'2026-11-09T05:11:54.516Z','2026-12-09T05:11:54.516Z');
INSERT INTO "sessions" VALUES ('f30ac2785dd4bc21893776bb7feaa8c439de3f72279a544d7e839d0a9103e9e9',2,'2026-11-09T05:11:54.651Z','2026-12-09T05:11:54.651Z');
INSERT INTO "sessions" VALUES ('a0dfa68690457c83db9504aa02176b0df0acc2d69a19c5392f31d8706968a29b',5,'2026-11-09T05:11:54.728Z','2026-12-09T05:11:54.728Z');
INSERT INTO "sessions" VALUES ('35fe8b2c53128a39a25d05d85eb34309f481c92fa508a75d2c18ec78a2673eb3',5,'2026-11-09T05:24:58.816Z','2026-12-09T05:24:58.816Z');
INSERT INTO "sessions" VALUES ('851fd5ad231fc4afe12b4781c7b6f272dbad85682079f3fc17b08725927b9943',2,'2026-11-09T05:24:58.913Z','2026-12-09T05:24:58.913Z');
INSERT INTO "sessions" VALUES ('574a532a92ad8d515f4985b859e6cbe112e6a35005a53199f324e27633131b4e',3,'2026-11-09T05:24:59.029Z','2026-12-09T05:24:59.029Z');
INSERT INTO "sessions" VALUES ('e487a589367a59ad1d701a04695cda98bba7290ccab086f240e45911ade33387',5,'2026-11-09T05:27:18.436Z','2026-12-09T05:27:18.436Z');
INSERT INTO "sessions" VALUES ('f93b931ade3b68313f2f19dc850c378ee3699ab59be5224e09b45690d647b769',2,'2026-11-09T05:27:18.503Z','2026-12-09T05:27:18.503Z');
INSERT INTO "sessions" VALUES ('6603e14ff5ebb4c48bdeac82ad1d6116488574bf44ae7208a86914ddfac2cf48',5,'2026-11-09T06:22:08.290Z','2026-12-09T06:22:08.290Z');
INSERT INTO "sessions" VALUES ('92581ee25a276b12be56dfdacbb36433eacd9c26e33efb46db9c2f9aaef0f39a',5,'2026-11-09T06:22:13.803Z','2026-12-09T06:22:13.803Z');
INSERT INTO "sessions" VALUES ('3b1ad828ee0f50898c9e45c92618ac8e22a27ebcf5a8248cc5e6768a58d86c68',2,'2026-11-09T06:22:13.872Z','2026-12-09T06:22:13.872Z');
INSERT INTO "sessions" VALUES ('ad3cf242b5db7e1b2287ef6e723c2137fd34a21749900241467a1d27f813237a',5,'2026-11-09T06:24:32.297Z','2026-12-09T06:24:32.297Z');
INSERT INTO "sessions" VALUES ('7a1fe64085b3d68aa4fe60867b45bf7f7df0caf9b4a757a19b8892f16d2873ca',5,'2026-11-09T06:24:39.591Z','2026-12-09T06:24:39.591Z');
INSERT INTO "sessions" VALUES ('3b668fe53290d4c6eb80a9a7a125e31da902a7399b896c08b891a87798931955',2,'2026-11-09T06:24:39.654Z','2026-12-09T06:24:39.654Z');
INSERT INTO "sessions" VALUES ('5deb54cf748a6677fa3fbb3b10c6c8113ee82b9d17b650e96cacd72840bcab74',2,'2026-11-09T06:33:50.301Z','2026-12-09T06:33:50.301Z');
INSERT INTO "sessions" VALUES ('3b04811886d7d4d0a3f6fab58786dd8144836c781d745c2db527be7fd41ccd8d',2,'2026-11-09T06:34:18.574Z','2026-12-09T06:34:18.574Z');
INSERT INTO "sessions" VALUES ('94bd7a358eb7e35d7e89a6759c725867cc316b54cd0d222a198696ff53cc50ea',2,'2026-11-09T06:34:47.806Z','2026-12-09T06:34:47.806Z');
INSERT INTO "sessions" VALUES ('193a9f93316d55fa27de0f7d44799d06c14e4d188ba0dc226a4f209fe6575ee6',5,'2026-11-09T06:36:10.050Z','2026-12-09T06:36:10.050Z');
INSERT INTO "sessions" VALUES ('2e8dd8c0c77ab81a3224c845e1274d03a245c77ba9449e786e5685000abcf5d4',5,'2026-11-09T06:52:58.841Z','2026-12-09T06:52:58.841Z');
INSERT INTO "sessions" VALUES ('ee9d289772d6731cffd97834eab96b28c7c83c63bcbbfe2bda8bbe4202e73694',2,'2026-11-09T06:52:58.907Z','2026-12-09T06:52:58.907Z');
INSERT INTO "sessions" VALUES ('a1a1ae1c78aeff173697561f1c30a8bb2b63258aceea564df34679bf9c5caf79',5,'2026-11-09T07:57:52.138Z','2026-12-09T07:57:52.138Z');
INSERT INTO "sessions" VALUES ('be35ede940df9898b0fed5b7e9f54db2900ee9030fe608fba22d26de0573acb7',2,'2026-11-09T07:57:52.202Z','2026-12-09T07:57:52.202Z');
INSERT INTO "sessions" VALUES ('0c1ed5f5b8dcf9b8e6267a7482e14438c890c6d6020016643583d6fdfe543f92',5,'2026-11-09T08:40:23.743Z','2026-12-09T08:40:23.743Z');
INSERT INTO "sessions" VALUES ('43a50a12e1fa714451bba841f7b527c957c307cb52d34c0d1793918a9702a213',5,'2026-11-09T08:40:28.764Z','2026-12-09T08:40:28.764Z');
INSERT INTO "sessions" VALUES ('560ac4a733b55adc23cb747281b990a27d40d7362db1cd277b8f54bbb50cac87',5,'2026-11-09T08:40:40.817Z','2026-12-09T08:40:40.817Z');
INSERT INTO "sessions" VALUES ('0eef1df9a2db9533007f561785b352ad1bf4f66ff9d03140effd661190c6bb33',5,'2026-11-09T08:41:32.234Z','2026-12-09T08:41:32.234Z');
INSERT INTO "sessions" VALUES ('862e19c7aa2aadc48a85110e2d90dd97e79db8b6bae2cb004463c72a4c90827b',5,'2026-11-09T08:41:41.805Z','2026-12-09T08:41:41.805Z');
INSERT INTO "sessions" VALUES ('7789e02c5635ea6f9d1b2f69049b2613f0edfbe155c154e29c7f4d1be8fcab40',5,'2026-11-09T08:42:30.308Z','2026-12-09T08:42:30.308Z');
INSERT INTO "sessions" VALUES ('a261d88dbe55ee16395598306fd274bf5ac8e7f9ae308c283fb9b1d2b47fc59d',5,'2026-11-09T08:43:31.776Z','2026-12-09T08:43:31.776Z');
INSERT INTO "sessions" VALUES ('53c1e3e3f6c572f3cd835f9d831f2c7c66f773d46dabb3f4868d30f941cb2826',2,'2026-11-09T08:43:51.793Z','2026-12-09T08:43:51.793Z');
INSERT INTO "sessions" VALUES ('4893e706434ab58604ce22a8a3c47d983eb621ca2a6f1b2dea23c0464094313c',5,'2026-11-09T08:54:15.866Z','2026-12-09T08:54:15.866Z');
INSERT INTO "sessions" VALUES ('ad105263e54ce8881e36f4cbb5a953e7b821c883ae338d406e81a72b3f2729b3',5,'2026-11-09T09:03:37.645Z','2026-12-09T09:03:37.645Z');
INSERT INTO "sessions" VALUES ('84f1a1a4846a8c815365d622642b30a96137ae79b7819cbd5fdb87feebe8ab47',2,'2026-11-09T09:03:39.160Z','2026-12-09T09:03:39.160Z');
INSERT INTO "sessions" VALUES ('9dcce3f1a4d1b350d79696b628311a33f085d28c68e828ced5ca0759bde156b4',5,'2026-11-09T09:04:24.551Z','2026-12-09T09:04:24.551Z');
INSERT INTO "sessions" VALUES ('a4dd5ae36309410980c04d11f5bb32911f64bd08fb435952b24bf60377bb4d15',2,'2026-11-09T09:04:26.300Z','2026-12-09T09:04:26.300Z');
INSERT INTO "sessions" VALUES ('b2024e5e3b8ee34c4155149096e7f369381e0267bdf0f95c28d4ab0680f4e0f2',5,'2026-11-09T09:05:11.592Z','2026-12-09T09:05:11.592Z');
INSERT INTO "sessions" VALUES ('db5b2e20be79f9ab05b35bfe9410392043d515dc99cff5bb6164f935730649da',2,'2026-11-09T09:05:12.860Z','2026-12-09T09:05:12.860Z');
INSERT INTO "sessions" VALUES ('d55bebd75a829969823049c64a06eaef2679ff677ea0fb7154faca5c40e06398',5,'2026-11-09T09:06:30.831Z','2026-12-09T09:06:30.831Z');
INSERT INTO "sessions" VALUES ('b8d370a73b41dc9dcc6ffb4553320fcdc4805aeeeabe9affb6ccc9986cbf0614',2,'2026-11-09T09:06:31.954Z','2026-12-09T09:06:31.954Z');
INSERT INTO "sessions" VALUES ('0949896049dedcb99b33a7938d6460e8702ab10b31711eb8070965f5f39ab6cd',5,'2026-11-09T09:07:55.392Z','2026-12-09T09:07:55.393Z');
INSERT INTO "sessions" VALUES ('37e89dddc7bbbd8a9768a2f2dfb94dbc0d3b66a9c52e4c523ad46a2944cd9430',2,'2026-11-09T09:07:56.342Z','2026-12-09T09:07:56.342Z');
INSERT INTO "sessions" VALUES ('a14e3e255da222e917d3fff97b202e5ccdc62a3cf31669bae252c73c9ad73b1e',2,'2026-11-09T09:08:23.263Z','2026-12-09T09:08:23.263Z');
INSERT INTO "sessions" VALUES ('2561dfb2669159b1c43545466b195dfd39c5533193f31c4fff3cd9524972cd2f',5,'2026-11-09T09:09:07.689Z','2026-12-09T09:09:07.689Z');
INSERT INTO "sessions" VALUES ('012a717b4e2b88f7e855aa7011ebed984216f2ed8fb55dc59ba64bf479900f20',5,'2026-11-09T09:09:27.459Z','2026-12-09T09:09:27.459Z');
INSERT INTO "sessions" VALUES ('99c4af6cd8bd1a8c4283cd01409d317e2ed51ebb7265d65bd0beda9e2d8763b3',2,'2026-11-09T09:09:28.470Z','2026-12-09T09:09:28.470Z');
INSERT INTO "sessions" VALUES ('55e4e8f8edc795e827d59d842ab3856c4da6dbd39dd577d60b089ac8bae20141',5,'2026-11-09T09:10:05.041Z','2026-12-09T09:10:05.041Z');
INSERT INTO "sessions" VALUES ('11f7a5116f28fdc2e1854d2df99b2a7d39c47b9010a891eb80206888cfae23ad',2,'2026-11-09T09:10:06.205Z','2026-12-09T09:10:06.205Z');
INSERT INTO "sessions" VALUES ('f26f43b3fb5d77dcc4d8354106087582d15cf882a7cd724f23a94fd1a6da088b',5,'2026-11-09T09:13:06.208Z','2026-12-09T09:13:06.208Z');
INSERT INTO "sessions" VALUES ('faf8cd8e5a9ac1391c6bd327f67c613b7a765037dd74e3cc6ea4b255cd10ff5a',2,'2026-11-09T09:13:37.482Z','2026-12-09T09:13:37.482Z');
INSERT INTO "sessions" VALUES ('53e0a72881d1097178aa59d8a9024ff58be39fcda3c04886ce9abc93dbe33851',1,'2026-11-11T01:04:45.469Z','2026-12-11T01:04:45.469Z');
INSERT INTO "sessions" VALUES ('98418a71e6aa67ce45d13e16cd139c6102b200d0f8f27435c461392cd38951d5',5,'2026-11-11T01:20:42.603Z','2026-12-11T01:20:42.603Z');
INSERT INTO "sessions" VALUES ('26140437d5e718cf4ad272a7c79d912669cc88382d07bb902be034c0dcf3c6c5',5,'2026-11-11T01:42:55.284Z','2026-12-11T01:42:55.284Z');
INSERT INTO "sessions" VALUES ('e076a9c4c20311cec2db8b83de548cbd20c4bc7956d247b1c33201d5d832d4c2',5,'2026-11-11T01:43:09.175Z','2026-12-11T01:43:09.175Z');
INSERT INTO "sessions" VALUES ('563ace98d829c7514c938c962ac4213f3b2af6345f22078858ccc8c66992e347',5,'2026-11-11T01:49:23.011Z','2026-12-11T01:49:23.011Z');
INSERT INTO "sessions" VALUES ('98228f3412747f35b7ffa9cfcea7c0e33898973a1947df8b8899e09eca7e009b',2,'2026-11-11T02:19:54.578Z','2026-12-11T02:19:54.578Z');
INSERT INTO "sessions" VALUES ('d674ab8c8047dce8952bb68b0d19a38b290e9002b5b73aee1ed9900ec34fca39',2,'2026-11-11T02:23:55.755Z','2026-12-11T02:23:55.755Z');
INSERT INTO "sessions" VALUES ('bc52a37c026b4fdf174344f02a96a435a9911756fdc2292da21ab56701cc5bb1',2,'2026-11-11T02:25:29.133Z','2026-12-11T02:25:29.133Z');
INSERT INTO "sessions" VALUES ('106d3b3b1ba914ed747ce640e5329167da14d030129d66233e5023b44fbbbd3d',2,'2026-11-11T02:26:38.779Z','2026-12-11T02:26:38.779Z');
INSERT INTO "sessions" VALUES ('52aecb83790de2f24f968dc8ef601e204b5bdecd8c94f2bd666cdb97eaa36fb6',2,'2026-11-11T02:42:51.229Z','2026-12-11T02:42:51.229Z');
INSERT INTO "sessions" VALUES ('9d0363f39e2e9e7694e642f029c13d3cf9888c56a5361dda6f00ccacb2f1cce4',2,'2026-11-11T02:43:59.229Z','2026-12-11T02:43:59.229Z');
INSERT INTO "sessions" VALUES ('5b8eb78f1a3d4274345cafc83d53751e5a834a3855b74075b98617a416e50e6f',2,'2026-11-11T03:07:29.458Z','2026-12-11T03:07:29.458Z');
INSERT INTO "sessions" VALUES ('7a0f0ff52334dc40c42ed4f5d823ddc9b51c3fc82495c49f35531dcaaadf1bc7',2,'2026-11-11T03:08:11.653Z','2026-12-11T03:08:11.653Z');
INSERT INTO "sessions" VALUES ('0011fbfd319ac1faa25a69576e2d5482d1a1f9da7c131a665709f3c11dfafe16',2,'2026-11-11T03:10:51.301Z','2026-12-11T03:10:51.301Z');
INSERT INTO "sessions" VALUES ('06f8f83168295a5e7e37917a1df47f51a2c171a5a6da1f4191f874714992447b',5,'2026-11-11T03:29:47.979Z','2026-12-11T03:29:47.979Z');
INSERT INTO "sessions" VALUES ('a2031b351e3f30971881ff66f8dc0979ca810db6948df6dd64ece47cb093386d',2,'2026-11-11T03:51:32.839Z','2026-12-11T03:51:32.839Z');
INSERT INTO "sessions" VALUES ('37feda42c8fe927aeeada418000d6b38f5c869a711b60b556f3e28a8466682ed',2,'2026-11-11T03:51:52.041Z','2026-12-11T03:51:52.041Z');
INSERT INTO "sessions" VALUES ('82fe763a3f944eee4091f03e7646e9e64ad2ee4667bbd0f9cd53c7bebeb45a2b',5,'2026-11-11T03:52:46.716Z','2026-12-11T03:52:46.716Z');
INSERT INTO "sessions" VALUES ('3bdedde310f8517970aafaa636ef7f920eab0bb146cf32e6f9e08a27fd1c52b7',2,'2026-11-11T03:55:35.524Z','2026-12-11T03:55:35.524Z');
INSERT INTO "sessions" VALUES ('1199634f2e4c94a1f3940f6e7e1e66df4a0b9f697db48c7e94fe2c3586971020',5,'2026-11-11T03:57:07.824Z','2026-12-11T03:57:07.824Z');
INSERT INTO "sessions" VALUES ('c5e23485828b0bbe2a1fedbabd00c9a3b09c3ddebaf7051d0015a206ad1bfe20',2,'2026-11-11T04:10:12.575Z','2026-12-11T04:10:12.575Z');
INSERT INTO "sessions" VALUES ('050a08c912ce19b96f943ed69111eae3786710a9773f6dade98421b8da5f9c20',5,'2026-11-11T04:10:20.236Z','2026-12-11T04:10:20.236Z');
INSERT INTO "sessions" VALUES ('a7e1d10a2eeb484eb25ae4ed7b0d76c99860ef02aa772e91b374f7090c860a8a',5,'2026-11-11T05:02:59.229Z','2026-12-11T05:02:59.229Z');
INSERT INTO "sessions" VALUES ('96250c017cac70ae0de8b88acff3a5ff0bad77cc0c4f157e50d26b675ac2f426',2,'2026-11-11T05:32:00.066Z','2026-12-11T05:32:00.066Z');
INSERT INTO "sessions" VALUES ('a915872610b6fddaef56162f59ffc926fd847757c6ab60b967f3d117697f9ca0',2,'2026-11-11T08:18:26.652Z','2026-12-11T08:18:26.652Z');
INSERT INTO "settings" VALUES ('bot_enabled','1');
INSERT INTO "settings" VALUES ('bot_greeting','Hi {first_name}, I''m the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What''s happening today?');
INSERT INTO "settings" VALUES ('bot_fallback','I can''t confirm that from the support knowledge base yet. The IT support team can take it from here. I can help you create a request so nothing gets lost.');
INSERT INTO "settings" VALUES ('bot_escalation','I''ll connect you with the IT support team. Create a support request from this chat and the conversation comes with it, so you won''t need to repeat yourself.');
INSERT INTO "settings" VALUES ('bot_guardrail','I''m the support assistant, so I can only help with support issues. I can''t discuss sales, pricing, or promotions. If something in your account isn''t working, tell me and I''ll help or connect you with IT.');
INSERT INTO "settings" VALUES ('auto_ack','Thanks {first_name}, request {ticket_ref} is in the IT support queue. A support agent will review it. Your target first response is {response_target}. You can follow every update right here in SupportIQ.');
INSERT INTO "settings" VALUES ('sla','{"low":{"response_hours":24,"resolve_hours":72},"normal":{"response_hours":8,"resolve_hours":24},"high":{"response_hours":2,"resolve_hours":8},"urgent":{"response_hours":1,"resolve_hours":4}}');
INSERT INTO "settings" VALUES ('auto_ack_alt','We received your request. Ticket #{ticket_ref}. Our IT team will reply within 2 hrs');
INSERT INTO "settings" VALUES ('bot_welcome_buttons','["Login problem","Report a bug","Billing","How to use","Talk to IT Support"]');
INSERT INTO "settings" VALUES ('bot_guided_questions_enabled','1');
INSERT INTO "settings" VALUES ('support_schedule_message','Our support team is available Monday-Sunday, 6:00 AM - 12:00 AM. Outside of these hours, your ticket will still be created and queued for the next business day.');
INSERT INTO "support_schedule" VALUES (1,1,'{"monday":{"enabled":true,"start":"06:00","end":"00:00"},"tuesday":{"enabled":true,"start":"06:00","end":"00:00"},"wednesday":{"enabled":true,"start":"06:00","end":"00:00"},"thursday":{"enabled":true,"start":"06:00","end":"00:00"},"friday":{"enabled":true,"start":"06:00","end":"00:00"},"saturday":{"enabled":true,"start":"06:00","end":"00:00"},"sunday":{"enabled":true,"start":"06:00","end":"00:00"}}','Our support team is available Monday-Sunday, 6:00 AM - 12:00 AM. Outside of these hours, your ticket will still be created and queued for the next business day.');
INSERT INTO "tags" VALUES (1,'Technical issue','issue','2026-11-05T06:34:51.752Z');
INSERT INTO "tags" VALUES (4,'Eduvia','product','2026-11-05T06:55:33.369Z');
INSERT INTO "tags" VALUES (5,'VendiX POS','product','2026-11-05T09:02:43.609Z');
INSERT INTO "tags" VALUES (6,'Northwind Labs','client','2026-11-05T09:02:43.611Z');
INSERT INTO "tags" VALUES (7,'Device & hardware','issue','2026-11-09T06:14:17.780Z');
INSERT INTO "ticket_reads" VALUES (5,1,'2026-11-05T06:37:24.151Z');
INSERT INTO "ticket_reads" VALUES (5,4,'2026-11-07T02:05:52.377Z');
INSERT INTO "ticket_reads" VALUES (5,7,'2026-11-05T05:47:04.141Z');
INSERT INTO "ticket_reads" VALUES (5,10,'2026-11-07T01:53:17.865Z');
INSERT INTO "ticket_reads" VALUES (5,13,'2026-11-05T04:56:54.454Z');
INSERT INTO "ticket_reads" VALUES (5,16,'2026-11-07T02:05:45.388Z');
INSERT INTO "ticket_reads" VALUES (5,19,'2026-10-24T18:24:34.078Z');
INSERT INTO "ticket_reads" VALUES (5,22,'2026-11-05T00:59:13.382Z');
INSERT INTO "ticket_reads" VALUES (6,2,'2026-11-02T23:55:33.082Z');
INSERT INTO "ticket_reads" VALUES (6,5,'2026-11-03T22:25:33.294Z');
INSERT INTO "ticket_reads" VALUES (6,8,'2026-11-01T04:24:33.406Z');
INSERT INTO "ticket_reads" VALUES (6,11,'2026-10-22T16:24:33.586Z');
INSERT INTO "ticket_reads" VALUES (6,14,'2026-11-02T06:25:33.767Z');
INSERT INTO "ticket_reads" VALUES (6,17,'2026-10-30T12:44:33.951Z');
INSERT INTO "ticket_reads" VALUES (6,20,'2026-11-03T18:25:34.143Z');
INSERT INTO "ticket_reads" VALUES (7,3,'2026-11-01T04:24:33.160Z');
INSERT INTO "ticket_reads" VALUES (7,6,'2026-11-02T07:24:33.321Z');
INSERT INTO "ticket_reads" VALUES (7,9,'2026-11-02T14:25:33.471Z');
INSERT INTO "ticket_reads" VALUES (7,12,'2026-11-03T02:25:33.657Z');
INSERT INTO "ticket_reads" VALUES (7,15,'2026-10-28T22:24:33.828Z');
INSERT INTO "ticket_reads" VALUES (7,18,'2026-10-27T13:04:34.013Z');
INSERT INTO "ticket_reads" VALUES (7,21,'2026-10-19T04:24:34.170Z');
INSERT INTO "ticket_reads" VALUES (2,1,'2026-11-04T04:24:34.380Z');
INSERT INTO "ticket_reads" VALUES (2,2,'2026-11-09T06:47:22.535Z');
INSERT INTO "ticket_reads" VALUES (2,3,'2026-11-04T04:24:34.391Z');
INSERT INTO "ticket_reads" VALUES (2,4,'2026-11-04T04:24:34.396Z');
INSERT INTO "ticket_reads" VALUES (2,5,'2026-11-04T04:24:34.400Z');
INSERT INTO "ticket_reads" VALUES (2,6,'2026-11-05T05:38:04.753Z');
INSERT INTO "ticket_reads" VALUES (2,7,'2026-11-04T04:24:34.410Z');
INSERT INTO "ticket_reads" VALUES (2,8,'2026-11-04T04:24:34.415Z');
INSERT INTO "ticket_reads" VALUES (2,9,'2026-11-04T04:24:34.421Z');
INSERT INTO "ticket_reads" VALUES (2,10,'2026-11-04T04:24:34.426Z');
INSERT INTO "ticket_reads" VALUES (2,11,'2026-11-05T05:37:04.640Z');
INSERT INTO "ticket_reads" VALUES (2,12,'2026-11-09T06:50:01.988Z');
INSERT INTO "ticket_reads" VALUES (2,13,'2026-11-04T04:24:34.442Z');
INSERT INTO "ticket_reads" VALUES (2,14,'2026-11-04T04:24:34.447Z');
INSERT INTO "ticket_reads" VALUES (2,15,'2026-11-04T04:24:34.452Z');
INSERT INTO "ticket_reads" VALUES (2,16,'2026-11-07T02:06:03.419Z');
INSERT INTO "ticket_reads" VALUES (2,17,'2026-11-04T04:24:34.462Z');
INSERT INTO "ticket_reads" VALUES (2,18,'2026-11-04T04:24:34.467Z');
INSERT INTO "ticket_reads" VALUES (2,19,'2026-11-04T04:24:34.472Z');
INSERT INTO "ticket_reads" VALUES (2,20,'2026-11-04T04:24:34.477Z');
INSERT INTO "ticket_reads" VALUES (2,21,'2026-11-04T04:24:34.482Z');
INSERT INTO "ticket_reads" VALUES (2,22,'2026-11-04T04:24:34.487Z');
INSERT INTO "ticket_reads" VALUES (3,1,'2026-11-04T04:24:34.492Z');
INSERT INTO "ticket_reads" VALUES (3,2,'2026-11-04T04:24:34.498Z');
INSERT INTO "ticket_reads" VALUES (3,3,'2026-11-04T04:24:34.503Z');
INSERT INTO "ticket_reads" VALUES (3,4,'2026-11-04T00:24:33.230Z');
INSERT INTO "ticket_reads" VALUES (3,5,'2026-11-04T04:24:34.512Z');
INSERT INTO "ticket_reads" VALUES (3,6,'2026-11-04T04:24:34.523Z');
INSERT INTO "ticket_reads" VALUES (3,7,'2026-11-04T04:24:34.529Z');
INSERT INTO "ticket_reads" VALUES (3,8,'2026-11-04T04:24:34.534Z');
INSERT INTO "ticket_reads" VALUES (3,9,'2026-11-04T04:24:34.540Z');
INSERT INTO "ticket_reads" VALUES (3,10,'2026-11-04T04:24:34.545Z');
INSERT INTO "ticket_reads" VALUES (3,11,'2026-11-04T04:24:34.550Z');
INSERT INTO "ticket_reads" VALUES (3,12,'2026-11-04T04:24:34.555Z');
INSERT INTO "ticket_reads" VALUES (3,13,'2026-11-04T02:24:33.712Z');
INSERT INTO "ticket_reads" VALUES (3,14,'2026-11-04T04:24:34.566Z');
INSERT INTO "ticket_reads" VALUES (3,15,'2026-11-04T04:24:34.571Z');
INSERT INTO "ticket_reads" VALUES (3,16,'2026-11-04T04:24:34.577Z');
INSERT INTO "ticket_reads" VALUES (3,17,'2026-11-04T04:24:34.582Z');
INSERT INTO "ticket_reads" VALUES (3,18,'2026-11-04T04:24:34.587Z');
INSERT INTO "ticket_reads" VALUES (3,19,'2026-11-04T04:24:34.592Z');
INSERT INTO "ticket_reads" VALUES (3,20,'2026-11-04T04:24:34.597Z');
INSERT INTO "ticket_reads" VALUES (3,21,'2026-11-04T04:24:34.603Z');
INSERT INTO "ticket_reads" VALUES (3,22,'2026-11-04T04:24:34.609Z');
INSERT INTO "ticket_reads" VALUES (4,1,'2026-11-04T04:24:34.614Z');
INSERT INTO "ticket_reads" VALUES (4,2,'2026-11-04T04:24:34.619Z');
INSERT INTO "ticket_reads" VALUES (4,3,'2026-11-04T04:24:34.624Z');
INSERT INTO "ticket_reads" VALUES (4,4,'2026-11-04T04:24:34.630Z');
INSERT INTO "ticket_reads" VALUES (4,5,'2026-11-04T04:24:34.635Z');
INSERT INTO "ticket_reads" VALUES (4,6,'2026-11-04T04:24:34.650Z');
INSERT INTO "ticket_reads" VALUES (4,7,'2026-11-04T04:24:34.662Z');
INSERT INTO "ticket_reads" VALUES (4,8,'2026-11-04T04:24:34.668Z');
INSERT INTO "ticket_reads" VALUES (4,9,'2026-11-04T00:24:33.471Z');
INSERT INTO "ticket_reads" VALUES (4,10,'2026-11-04T04:24:34.679Z');
INSERT INTO "ticket_reads" VALUES (4,11,'2026-11-04T04:24:34.684Z');
INSERT INTO "ticket_reads" VALUES (4,12,'2026-11-04T04:24:34.689Z');
INSERT INTO "ticket_reads" VALUES (4,13,'2026-11-04T04:24:34.694Z');
INSERT INTO "ticket_reads" VALUES (4,14,'2026-11-03T23:44:33.767Z');
INSERT INTO "ticket_reads" VALUES (4,15,'2026-11-04T04:24:34.705Z');
INSERT INTO "ticket_reads" VALUES (4,16,'2026-11-04T04:24:34.710Z');
INSERT INTO "ticket_reads" VALUES (4,17,'2026-11-04T04:24:34.715Z');
INSERT INTO "ticket_reads" VALUES (4,18,'2026-11-04T04:24:34.721Z');
INSERT INTO "ticket_reads" VALUES (4,19,'2026-11-04T04:24:34.726Z');
INSERT INTO "ticket_reads" VALUES (4,20,'2026-11-04T04:24:34.731Z');
INSERT INTO "ticket_reads" VALUES (4,21,'2026-11-04T04:24:34.736Z');
INSERT INTO "ticket_reads" VALUES (4,22,'2026-11-04T04:24:34.742Z');
INSERT INTO "ticket_reads" VALUES (1,1,'2026-11-04T04:24:34.747Z');
INSERT INTO "ticket_reads" VALUES (1,2,'2026-11-04T04:24:34.752Z');
INSERT INTO "ticket_reads" VALUES (1,3,'2026-11-05T06:06:51.414Z');
INSERT INTO "ticket_reads" VALUES (1,4,'2026-11-04T04:24:34.762Z');
INSERT INTO "ticket_reads" VALUES (1,5,'2026-11-04T04:24:34.767Z');
INSERT INTO "ticket_reads" VALUES (1,6,'2026-11-05T08:16:40.677Z');
INSERT INTO "ticket_reads" VALUES (1,7,'2026-11-04T09:12:14.979Z');
INSERT INTO "ticket_reads" VALUES (1,8,'2026-11-04T04:24:34.783Z');
INSERT INTO "ticket_reads" VALUES (1,9,'2026-11-04T04:24:34.788Z');
INSERT INTO "ticket_reads" VALUES (1,10,'2026-11-04T04:24:34.793Z');
INSERT INTO "ticket_reads" VALUES (1,11,'2026-11-04T04:24:34.798Z');
INSERT INTO "ticket_reads" VALUES (1,12,'2026-11-04T04:24:34.803Z');
INSERT INTO "ticket_reads" VALUES (1,13,'2026-11-04T04:24:34.808Z');
INSERT INTO "ticket_reads" VALUES (1,14,'2026-11-04T04:24:34.813Z');
INSERT INTO "ticket_reads" VALUES (1,15,'2026-11-04T04:24:34.818Z');
INSERT INTO "ticket_reads" VALUES (1,16,'2026-11-05T07:29:41.199Z');
INSERT INTO "ticket_reads" VALUES (1,17,'2026-11-04T04:24:34.828Z');
INSERT INTO "ticket_reads" VALUES (1,18,'2026-11-04T04:24:34.833Z');
INSERT INTO "ticket_reads" VALUES (1,19,'2026-11-04T04:24:34.838Z');
INSERT INTO "ticket_reads" VALUES (1,20,'2026-11-04T04:24:34.843Z');
INSERT INTO "ticket_reads" VALUES (1,21,'2026-11-04T04:24:34.850Z');
INSERT INTO "ticket_reads" VALUES (1,22,'2026-11-04T04:24:34.856Z');
INSERT INTO "ticket_reads" VALUES (5,23,'2026-11-07T03:00:17.726Z');
INSERT INTO "ticket_reads" VALUES (1,23,'2026-11-07T02:41:17.031Z');
INSERT INTO "ticket_reads" VALUES (2,23,'2026-11-11T04:01:47.374Z');
INSERT INTO "ticket_reads" VALUES (11,25,'2026-11-11T01:57:19.368Z');
INSERT INTO "ticket_reads" VALUES (1,25,'2026-11-07T03:58:48.992Z');
INSERT INTO "ticket_reads" VALUES (2,25,'2026-11-11T01:46:27.500Z');
INSERT INTO "ticket_reads" VALUES (5,37,'2026-11-11T01:46:08.725Z');
INSERT INTO "ticket_reads" VALUES (1,37,'2026-11-07T01:38:11.396Z');
INSERT INTO "ticket_reads" VALUES (5,166,'2026-11-11T02:39:51.073Z');
INSERT INTO "ticket_reads" VALUES (1,166,'2026-11-09T06:14:39.404Z');
INSERT INTO "ticket_reads" VALUES (2,166,'2026-11-11T02:09:52.018Z');
INSERT INTO "ticket_tags" VALUES (37,5);
INSERT INTO "ticket_tags" VALUES (37,1);
INSERT INTO "ticket_tags" VALUES (37,6);
INSERT INTO "ticket_tags" VALUES (166,5);
INSERT INTO "ticket_tags" VALUES (166,7);
INSERT INTO "ticket_tags" VALUES (166,6);
INSERT INTO "tickets" VALUES (1,'SIQ-1001',5,NULL,'SSO login loop after identity provider change','Since our identity provider migration this morning, signing in sends me straight back to the SupportIQ login page in a loop. I''ve tried Chrome and Safari. This is blocking month-end close for the finance team.','Account access','urgent','open','portal',NULL,'2026-11-04T01:24:33.051Z','2026-11-04T01:25:33.051Z',NULL,NULL,NULL,'2026-11-04T02:24:33.051Z','2026-11-04T05:24:33.051Z',NULL,NULL,NULL,NULL,0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (2,'SIQ-1002',6,2,'Webhook deliveries returning 502 since yesterday''s deploy','Starting around 02:10 UTC, every webhook delivery to our endpoint returns 502 and then retries. Our nightly sync is blocked. Latest trace ID is tr_9f2c4a. The endpoint itself is healthy and answers synthetic checks.','Technical issue','high','in_progress','assistant',1,'2026-11-02T21:24:33.082Z','2026-11-03T09:24:33.082Z','2026-11-02T22:54:33.082Z',NULL,NULL,'2026-11-02T23:24:33.082Z','2026-11-03T05:24:33.082Z',NULL,NULL,NULL,NULL,0,1,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (3,'SIQ-1003',7,3,'October invoice shows the wrong account tier','Our October invoice (INV-88421) appears to bill us at the Enterprise tier, but our contract is for Growth. Could you check the account mapping and reissue the invoice? Finance is holding the payment run.','Billing & invoices','normal','resolved','portal',NULL,'2026-10-31T04:24:33.160Z','2026-11-01T04:24:33.160Z','2026-10-31T09:24:33.160Z','2026-11-01T00:24:33.160Z',NULL,'2026-10-31T12:24:33.160Z','2026-11-01T04:24:33.160Z','The billing account was mapped to the wrong tier after the October migration. Reissued invoice INV-88421 with the correct Growth contract details; finance confirmed the ledger entry.',5,'Priya sorted the invoice issue in less than a day. Clear updates the whole way.','2026-11-01T04:24:33.160Z',0,4,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (4,'SIQ-1004',5,3,'Desktop app crashes when opening shared dashboards','SupportIQ desktop 4.18.2 crashes every time I open a dashboard shared by another workspace. It happens on macOS 15.3. Local dashboards are fine. I''ll add a screenshot once I''m back at my desk.','Technical issue','normal','waiting_customer','portal',NULL,'2026-11-02T04:24:33.230Z','2026-11-04T00:24:33.230Z','2026-11-02T05:04:33.230Z',NULL,NULL,'2026-11-02T12:24:33.230Z','2026-11-03T04:24:33.230Z',NULL,NULL,NULL,NULL,0,5,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (5,'SIQ-1005',6,NULL,'Invited second admin never appears under Members','Our new ops lead accepted the invitation, but she doesn''t appear under Members and can''t access the workspace. Invite email was sent yesterday to ops-lead@lumenpay.io.','Account access','low','open','portal',NULL,'2026-11-03T22:24:33.294Z','2026-11-03T22:25:33.294Z',NULL,NULL,NULL,'2026-11-04T22:24:33.294Z','2026-11-06T22:24:33.294Z',NULL,NULL,NULL,NULL,0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (6,'SIQ-1006',7,2,'Urgent: export job stalled at 60%','The audit export we started at 06:00 is stuck at 60% for almost an hour. This is blocking our security review today. Export ID: exp_77121.','Data & exports','urgent','resolved','portal',NULL,'2026-11-02T04:24:33.321Z','2026-11-05T05:38:04.706Z','2026-11-02T04:49:33.321Z','2026-11-02T06:49:33.321Z',NULL,'2026-11-02T05:24:33.321Z','2026-11-02T08:24:33.321Z','The export worker had stalled on a lock held by the nightly archive job. Requeued the export, verified the 100% file, and added a runbook note for on-call.',4,'Fast fix once Alex picked it up. The export page could explain the retry state better.','2026-11-02T07:24:33.321Z',0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (7,'SIQ-1007',5,NULL,'App freezes when opening shared dashboards','The web app freezes for 5–10 seconds whenever I open a shared dashboard, then recovers. Started after this morning''s release. Chrome 141 on Windows. It''s slowing down our stand-up.','Technical issue','high','open','portal',NULL,'2026-11-04T03:59:33.381Z','2026-11-04T04:00:33.381Z',NULL,NULL,NULL,'2026-11-04T05:59:33.381Z','2026-11-04T11:59:33.381Z',NULL,NULL,NULL,NULL,0,5,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (8,'SIQ-1008',6,4,'Password reset email never arrives','I requested a password reset three times and no email arrives. I can still use my current session, but I need to reset before it expires. Checked spam already.','Account access','normal','resolved','portal',NULL,'2026-10-29T04:24:33.406Z','2026-11-01T04:24:33.406Z','2026-10-29T06:24:33.406Z','2026-10-31T06:24:33.406Z',NULL,'2026-10-29T12:24:33.406Z','2026-10-30T04:24:33.406Z','Reset delivery was blocked by the customer''s mail gateway. Re-sent via a verified backup address, confirmed sign-in, and flagged the gateway rule for their IT.',3,'Reset eventually worked, but it took a while to hear back.','2026-11-01T04:24:33.406Z',0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (9,'SIQ-1009',7,4,'Alert routing silently dropping critical events','Critical alert events are intermittently not reaching our on-call rotation. We saw three missed pages last night. Routing rule is set to ''Critical → On-call''. Nothing in the audit log.','Technical issue','high','in_progress','portal',NULL,'2026-11-02T04:24:33.471Z','2026-11-04T00:24:33.471Z','2026-11-02T13:24:33.471Z',NULL,NULL,'2026-11-02T06:24:33.471Z','2026-11-02T12:24:33.471Z',NULL,NULL,NULL,NULL,0,1,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (10,'SIQ-1010',5,3,'Need a copy of our full data export','Please prepare a full workspace export for our data retention review. We need it in CSV with the schema documentation if available.','Data & exports','low','resolved','portal',NULL,'2026-10-23T04:24:33.530Z','2026-10-26T03:44:33.530Z','2026-10-23T07:24:33.530Z','2026-10-24T04:24:33.530Z',NULL,'2026-10-24T04:24:33.530Z','2026-10-26T04:24:33.530Z','Prepared a signed data export link valid for seven days and confirmed the download completed successfully.',5,'Exactly what I needed, with a checksum included.','2026-10-26T03:44:33.530Z',0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (11,'SIQ-1011',6,2,'Mobile app scroll position jumps on iOS','On the iOS app, scrolling through a long request thread jumps back to the top whenever a new message arrives. This makes live threads impossible to follow. iPhone 15, iOS 19.2.','Technical issue','normal','closed','portal',NULL,'2026-10-17T04:24:33.586Z','2026-10-22T16:24:33.586Z','2026-10-17T10:24:33.586Z','2026-10-20T04:24:33.586Z','2026-10-22T04:24:33.586Z','2026-10-17T12:24:33.586Z','2026-10-18T04:24:33.586Z','Patched iOS scroll restoration in 4.16.3. Verified on iPhone 15 and iPhone 13; customer confirmed after updating.',2,'The fix landed, but updates were slow and I had to chase twice.','2026-10-22T16:24:33.586Z',0,5,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (12,'SIQ-1012',7,2,'Replacing a lost two-factor authentication device','One of our workspace admins lost their phone and can''t complete 2FA. We need to remove the old device and enroll a new one. Identity has been verified internally.','Account access','normal','in_progress','portal',NULL,'2026-11-02T22:24:33.657Z','2026-11-03T23:24:33.657Z','2026-11-03T01:24:33.657Z',NULL,NULL,'2026-11-03T06:24:33.657Z','2026-11-03T22:24:33.657Z',NULL,NULL,NULL,NULL,0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (13,'SIQ-1013',5,3,'Billing receipt needs our VAT number','Please add our VAT number to the October and November billing receipts. Our finance system rejects them without it. VAT: GB 412 8891 23.','Billing & invoices','high','in_progress','portal',NULL,'2026-11-04T00:24:33.712Z','2026-11-04T02:24:33.712Z','2026-11-04T00:54:33.712Z',NULL,NULL,'2026-11-04T02:24:33.712Z','2026-11-04T08:24:33.712Z',NULL,NULL,NULL,NULL,0,4,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (14,'SIQ-1014',6,4,'Docs search returns stale results','Searching the docs portal for “ingest limits” returns a 2024 page that contradicts the current API reference. Team members are following outdated guidance. Cache purge didn''t help.','Technical issue','high','waiting_customer','portal',NULL,'2026-11-02T04:24:33.767Z','2026-11-03T23:44:33.767Z','2026-11-02T05:09:33.767Z',NULL,NULL,'2026-11-02T06:24:33.767Z','2026-11-02T12:24:33.767Z',NULL,NULL,NULL,NULL,0,2,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (15,'SIQ-1015',7,3,'Exporting audit logs to our SIEM','We want to stream audit logs to our SIEM. Is there a supported integration, and what retention does the API provide? We need this for our next security review.','How-to question','normal','resolved','portal',NULL,'2026-10-27T04:24:33.828Z','2026-10-28T22:24:33.828Z','2026-10-27T08:24:33.828Z','2026-10-28T10:24:33.828Z',NULL,'2026-10-27T12:24:33.828Z','2026-10-28T04:24:33.828Z','Enabled audit log streaming with a scoped API key and walked through the SIEM field mapping. Retention question answered in-thread.',4,'Helpful walkthrough. Waiting on one security questionnaire, otherwise great.','2026-10-28T22:24:33.828Z',0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (16,'SIQ-1016',5,2,'Desktop app won''t install on Windows 11','The installer runs and then closes with no error. Windows 11 24H2. We''ve tried running as administrator. Two other machines installed fine last week.','Device & hardware','normal','closed','portal',NULL,'2026-10-26T04:24:33.897Z','2026-11-05T06:57:23.816Z','2026-10-26T06:24:33.897Z','2026-10-26T10:24:33.897Z','2026-11-05T06:57:23.816Z','2026-10-26T12:24:33.897Z','2026-10-27T04:24:33.897Z','Installer failed on a stale Visual C++ redistributable. Provided the supported installer package and verified launch after reboot.',5,'Alex nailed it on the first reply.','2026-10-26T20:24:33.897Z',0,5,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (17,'SIQ-1017',6,4,'API keys page returns 403 for team members','Workspace members get a 403 on Settings → API keys, even though they have the Developer role. Workspace owners can access the page. Is this a permissions bug?','Account access','high','resolved','portal',NULL,'2026-10-30T04:24:33.951Z','2026-10-30T12:44:33.951Z','2026-10-30T05:24:33.951Z','2026-10-30T10:44:33.951Z',NULL,'2026-10-30T06:24:33.951Z','2026-10-30T12:24:33.951Z','The Developer role policy was missing the API keys read scope. Added the scope for workspace members and verified with the customer''s test account.',5,'Fast and precise.','2026-10-30T12:44:33.951Z',0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (18,'SIQ-1018',7,3,'How do we bulk-import users?','We''re onboarding 400 staff next month. Is there a CSV template for bulk user import, and what are the limits per upload?','How-to question','low','closed','portal',NULL,'2026-10-22T04:24:34.013Z','2026-10-27T13:04:34.013Z','2026-10-22T09:24:34.013Z','2026-10-22T18:24:34.013Z','2026-10-27T04:24:34.013Z','2026-10-23T04:24:34.013Z','2026-10-25T04:24:34.013Z','Shared the supported CSV template and import limits; customer imported 412 users and confirmed all records.',4,'Clear instructions; would like a bulk-import template.','2026-10-27T13:04:34.013Z',0,2,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (19,'SIQ-1019',5,2,'Intermittent latency on EU endpoint','API calls to the EU region are taking 4–8 seconds intermittently since 09:00 UTC. US calls are normal. Request IDs in the attached log range from 09:04 to 09:22.','Technical issue','high','resolved','portal',NULL,'2026-10-24T04:24:34.078Z','2026-10-24T18:24:34.078Z','2026-10-24T05:54:34.078Z','2026-10-24T09:24:34.078Z',NULL,'2026-10-24T06:24:34.078Z','2026-10-24T12:24:34.078Z','The EU edge pool was undersized during a traffic spike. Capacity increased by 40%; latency returned to baseline over 90 minutes.',4,'Fixed the routing issue. Communication was good.','2026-10-24T18:24:34.078Z',0,1,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (20,'SIQ-1020',6,NULL,'Request to enable 400-day audit log retention','For our compliance program we need audit log retention beyond the default window. Can you enable the 400-day retention on our workspace, or tell us what the process is?','Feature request','normal','open','portal',NULL,'2026-11-03T18:24:34.143Z','2026-11-03T18:25:34.143Z',NULL,NULL,NULL,'2026-11-04T02:24:34.143Z','2026-11-04T18:24:34.143Z',NULL,NULL,NULL,NULL,0,3,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (21,'SIQ-1021',7,4,'Return label for replaced laptop','Please send a prepaid return label for the laptop you replaced last week. The depot said they can''t accept it without a label. Serial is ARL-2291.','Device & hardware','low','closed','portal',NULL,'2026-10-15T04:24:34.170Z','2026-10-19T04:24:34.170Z','2026-10-16T00:24:34.170Z','2026-10-17T04:24:34.170Z','2026-10-18T04:24:34.170Z','2026-10-16T04:24:34.170Z','2026-10-18T04:24:34.170Z','Issued a prepaid return label and confirmed the depot received the laptop.',5,'Return label arrived the same day.','2026-10-19T04:24:34.170Z',0,5,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (22,'SIQ-1022',5,NULL,'Scheduled report didn''t run this morning','Our daily usage report is set for 06:00 UTC and didn''t run today. The schedule still shows active. Yesterday''s run completed normally.','How-to question','normal','open','portal',NULL,'2026-11-04T03:24:34.232Z','2026-11-04T03:25:34.232Z',NULL,NULL,NULL,'2026-11-04T11:24:34.232Z','2026-11-05T03:24:34.232Z',NULL,NULL,NULL,NULL,0,2,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (23,'SIQ-1023',5,2,'I keep getting redirected when I sign in with SSO.','qwe','Feature request','high','closed','assistant',3,'2026-11-05T00:53:52.275Z','2026-11-07T02:19:22.941Z','2026-11-05T01:06:39.067Z','2026-11-07T02:18:59.295Z','2026-11-07T02:19:17.461Z','2026-11-05T02:53:52.275Z','2026-11-07T10:18:16.022Z','Done',5,'So Good','2026-11-07T02:19:22.941Z',5,3,'2026-11-07T02:19:17.461Z',NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (25,'SIQ-1025',11,2,'Help me','Hello Beulah','Data & exports','urgent','in_progress','assistant',7,'2026-11-05T05:42:58.654Z','2026-11-11T01:46:27.435Z','2026-11-05T05:44:01.336Z',NULL,NULL,'2026-11-05T06:42:58.654Z','2026-11-05T09:42:58.654Z',NULL,NULL,NULL,NULL,0,5,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (37,'SIQ-1037',5,3,'Talk to IT support','09088184444','Technical issue','urgent','open','portal',NULL,'2026-11-05T09:02:43.607Z','2026-11-07T01:45:35.904Z',NULL,NULL,NULL,'2026-11-05T10:02:43.607Z','2026-11-05T13:02:43.607Z',NULL,NULL,NULL,NULL,0,2,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (166,'SIQ-1166',5,2,'Test Video call','Gwapo ko','Device & hardware','urgent','open','portal',NULL,'2026-11-09T06:14:17.774Z','2026-11-11T01:49:35.004Z',NULL,NULL,NULL,'2026-11-09T07:14:17.774Z','2026-11-09T10:14:17.774Z',NULL,NULL,NULL,NULL,0,5,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (452,'TEST-REMOTE-1794364911306-ea1d2b3e7b36c8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:41:51.305Z','2026-11-11T02:41:51.305Z',NULL,NULL,NULL,'2026-11-11T02:41:51.305Z','2026-11-11T02:41:51.305Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (453,'TEST-REMOTE-1794364911395-aa2b873f4f5ab',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:41:51.395Z','2026-11-11T02:41:51.395Z',NULL,NULL,NULL,'2026-11-11T02:41:51.395Z','2026-11-11T02:41:51.395Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (454,'TEST-REMOTE-1794364911481-6e721bab4840d8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:41:51.481Z','2026-11-11T02:41:51.481Z',NULL,NULL,NULL,'2026-11-11T02:41:51.481Z','2026-11-11T02:41:51.481Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (455,'TEST-REMOTE-1794364927743-11f46a3471bb7',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:42:07.743Z','2026-11-11T02:42:07.743Z',NULL,NULL,NULL,'2026-11-11T02:42:07.743Z','2026-11-11T02:42:07.743Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (456,'TEST-REMOTE-1794364927850-cef904360c7958',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:42:07.850Z','2026-11-11T02:42:07.850Z',NULL,NULL,NULL,'2026-11-11T02:42:07.850Z','2026-11-11T02:42:07.850Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (457,'TEST-REMOTE-1794364927947-1508d48ff7088',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:42:07.946Z','2026-11-11T02:42:07.946Z',NULL,NULL,NULL,'2026-11-11T02:42:07.946Z','2026-11-11T02:42:07.946Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (463,'TEST-REMOTE-1794365073358-0ba7a3fc40a6f',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:44:33.357Z','2026-11-11T02:44:33.357Z',NULL,NULL,NULL,'2026-11-11T02:44:33.357Z','2026-11-11T02:44:33.357Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (464,'TEST-REMOTE-1794365073466-ddf721d855cc2',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:44:33.466Z','2026-11-11T02:44:33.466Z',NULL,NULL,NULL,'2026-11-11T02:44:33.466Z','2026-11-11T02:44:33.466Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (465,'TEST-REMOTE-1794365073582-bd656e11b175f8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:44:33.582Z','2026-11-11T02:44:33.582Z',NULL,NULL,NULL,'2026-11-11T02:44:33.582Z','2026-11-11T02:44:33.582Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (480,'TEST-REMOTE-1794365146533-0c72d6dc8721c8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:45:46.532Z','2026-11-11T02:45:46.532Z',NULL,NULL,NULL,'2026-11-11T02:45:46.532Z','2026-11-11T02:45:46.532Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (481,'TEST-REMOTE-1794365146627-aec072b57b0e7',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T02:45:46.627Z','2026-11-11T02:45:46.627Z',NULL,NULL,NULL,'2026-11-11T02:45:46.627Z','2026-11-11T02:45:46.627Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (483,'TEST-REMOTE-1794366301027-af88789a7d5458',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:05:01.026Z','2026-11-11T03:05:01.026Z',NULL,NULL,NULL,'2026-11-11T03:05:01.026Z','2026-11-11T03:05:01.026Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (484,'TEST-REMOTE-1794366301137-95812977339f8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:05:01.137Z','2026-11-11T03:05:01.137Z',NULL,NULL,NULL,'2026-11-11T03:05:01.137Z','2026-11-11T03:05:01.137Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (490,'TEST-REMOTE-1794366352839-9a67eb17bd36',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:05:52.838Z','2026-11-11T03:05:52.838Z',NULL,NULL,NULL,'2026-11-11T03:05:52.838Z','2026-11-11T03:05:52.838Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (491,'TEST-REMOTE-1794366352930-57ec706cae708',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:05:52.930Z','2026-11-11T03:05:52.930Z',NULL,NULL,NULL,'2026-11-11T03:05:52.930Z','2026-11-11T03:05:52.930Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (508,'TEST-REMOTE-1794366687554-18d5e4d078b6f',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:11:27.553Z','2026-11-11T03:11:27.553Z',NULL,NULL,NULL,'2026-11-11T03:11:27.553Z','2026-11-11T03:11:27.553Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (509,'TEST-REMOTE-1794366687684-2888663b71e07',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:11:27.684Z','2026-11-11T03:11:27.684Z',NULL,NULL,NULL,'2026-11-11T03:11:27.684Z','2026-11-11T03:11:27.684Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (513,'TEST-REMOTE-1794367526228-72ffd9bff3cd78',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:25:26.227Z','2026-11-11T03:25:26.227Z',NULL,NULL,NULL,'2026-11-11T03:25:26.227Z','2026-11-11T03:25:26.227Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (514,'TEST-REMOTE-1794367526342-8612b351f6acf8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:25:26.341Z','2026-11-11T03:25:26.341Z',NULL,NULL,NULL,'2026-11-11T03:25:26.341Z','2026-11-11T03:25:26.341Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (536,'TEST-REMOTE-1794369082110-64021eb2e849d8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:51:22.110Z','2026-11-11T03:51:22.110Z',NULL,NULL,NULL,'2026-11-11T03:51:22.110Z','2026-11-11T03:51:22.110Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (537,'TEST-REMOTE-1794369082210-536f3f40d865c8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:51:22.210Z','2026-11-11T03:51:22.210Z',NULL,NULL,NULL,'2026-11-11T03:51:22.210Z','2026-11-11T03:51:22.210Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (557,'TEST-REMOTE-1794369270726-5082a66ccfdf5',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:54:30.726Z','2026-11-11T03:54:30.726Z',NULL,NULL,NULL,'2026-11-11T03:54:30.726Z','2026-11-11T03:54:30.726Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (558,'TEST-REMOTE-1794369270823-e86103a12fe14',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T03:54:30.823Z','2026-11-11T03:54:30.823Z',NULL,NULL,NULL,'2026-11-11T03:54:30.823Z','2026-11-11T03:54:30.823Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (578,'TEST-REMOTE-1794370144635-b43c17687e8bc8',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T04:09:04.634Z','2026-11-11T04:09:04.634Z',NULL,NULL,NULL,'2026-11-11T04:09:04.634Z','2026-11-11T04:09:04.634Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (579,'TEST-REMOTE-1794370144744-0a6a6f5d84c608',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T04:09:04.744Z','2026-11-11T04:09:04.744Z',NULL,NULL,NULL,'2026-11-11T04:09:04.744Z','2026-11-11T04:09:04.744Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (596,'TEST-REMOTE-1794373890018-0288fc28493b4',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T05:11:30.018Z','2026-11-11T05:11:30.018Z',NULL,NULL,NULL,'2026-11-11T05:11:30.018Z','2026-11-11T05:11:30.018Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (597,'TEST-REMOTE-1794373890148-ab0ea4aa60e7b',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T05:11:30.148Z','2026-11-11T05:11:30.148Z',NULL,NULL,NULL,'2026-11-11T05:11:30.148Z','2026-11-11T05:11:30.148Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (623,'TEST-REMOTE-1794373902063-06b59001e48388',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T05:11:42.062Z','2026-11-11T05:11:42.062Z',NULL,NULL,NULL,'2026-11-11T05:11:42.062Z','2026-11-11T05:11:42.062Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (624,'TEST-REMOTE-1794373902157-df3283c0f1ed4',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T05:11:42.157Z','2026-11-11T05:11:42.157Z',NULL,NULL,NULL,'2026-11-11T05:11:42.157Z','2026-11-11T05:11:42.157Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (644,'TEST-REMOTE-1794373906372-8d863db05f1e2',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T05:11:46.371Z','2026-11-11T05:11:46.371Z',NULL,NULL,NULL,'2026-11-11T05:11:46.371Z','2026-11-11T05:11:46.371Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (645,'TEST-REMOTE-1794373906474-8f10cde8421de',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T05:11:46.474Z','2026-11-11T05:11:46.474Z',NULL,NULL,NULL,'2026-11-11T05:11:46.474Z','2026-11-11T05:11:46.474Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (665,'TEST-REMOTE-1794373911528-6012ea05481b48',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T05:11:51.527Z','2026-11-11T05:11:51.527Z',NULL,NULL,NULL,'2026-11-11T05:11:51.527Z','2026-11-11T05:11:51.527Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "tickets" VALUES (666,'TEST-REMOTE-1794373911623-7c5c08ec3409f',5,2,'Remote support test request','Testing the native SupportIQ Agent remote flow.','Technical issue','normal','open','portal',NULL,'2026-11-11T05:11:51.623Z','2026-11-11T05:11:51.623Z',NULL,NULL,NULL,'2026-11-11T05:11:51.623Z','2026-11-11T05:11:51.623Z',NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "users" VALUES (1,'Jordan Blake','admin@supportiq.app','9c6a01dbf31bf434555247cba42a4ed1:93090dd2fb3fcb20f6bc4c082bd0d482c8b63514bc4d78bb79395b6b7083026afa7ec77fd321455aa308ebe0fb12a8d5d856ee74c5cd09e1d06b81cc4d663f2a','admin',NULL,'Head of Customer Operations',1,'2026-09-20T04:24:32.808Z');
INSERT INTO "users" VALUES (2,'Alex Rivera','alex@supportiq.app','9c6a01dbf31bf434555247cba42a4ed1:93090dd2fb3fcb20f6bc4c082bd0d482c8b63514bc4d78bb79395b6b7083026afa7ec77fd321455aa308ebe0fb12a8d5d856ee74c5cd09e1d06b81cc4d663f2a','it',NULL,'Tier 2 Support Engineer',1,'2026-09-20T04:24:32.823Z');
INSERT INTO "users" VALUES (3,'Priya Nair','priya@supportiq.app','9b295aa43a1b48c5d46512ebf15a034e:c8c0f035597ce109ea280ddf16310928cf883b348e8275792ef099199006d3cf79065a9f9926788cbc89e25ba7a3bd76565381a71692763b68152d5608879ee3','it',NULL,'Support Specialist',1,'2026-09-20T04:24:32.830Z');
INSERT INTO "users" VALUES (4,'Marcus Lee','marcus@supportiq.app','9b295aa43a1b48c5d46512ebf15a034e:c8c0f035597ce109ea280ddf16310928cf883b348e8275792ef099199006d3cf79065a9f9926788cbc89e25ba7a3bd76565381a71692763b68152d5608879ee3','it',NULL,'Solutions Engineer',1,'2026-09-20T04:24:32.836Z');
INSERT INTO "users" VALUES (5,'Maya Chen','maya@northwind.co','9c6a01dbf31bf434555247cba42a4ed1:93090dd2fb3fcb20f6bc4c082bd0d482c8b63514bc4d78bb79395b6b7083026afa7ec77fd321455aa308ebe0fb12a8d5d856ee74c5cd09e1d06b81cc4d663f2a','customer','Northwind Labs',NULL,1,'2026-09-20T04:24:32.841Z');
INSERT INTO "users" VALUES (6,'Daniel Osei','daniel@lumenpay.io','9b295aa43a1b48c5d46512ebf15a034e:c8c0f035597ce109ea280ddf16310928cf883b348e8275792ef099199006d3cf79065a9f9926788cbc89e25ba7a3bd76565381a71692763b68152d5608879ee3','customer','LumenPay',NULL,1,'2026-09-20T04:24:32.851Z');
INSERT INTO "users" VALUES (7,'Elena Rossi','elena@arclight.health','9b295aa43a1b48c5d46512ebf15a034e:c8c0f035597ce109ea280ddf16310928cf883b348e8275792ef099199006d3cf79065a9f9926788cbc89e25ba7a3bd76565381a71692763b68152d5608879ee3','customer','Arclight Health',NULL,1,'2026-09-20T04:24:32.856Z');
INSERT INTO "users" VALUES (9,'Marisse Beulah','marissebeulah@gmail.com','186d09059c2ae2b13f841bd517f0a6f7:98c6546d52953b91e83cb79dc98604c8aafd9dac6fea35c5f83dd933e565de39e3741a3763d3b1a66d0b483f94610614e561a360da1423aa43a5c31c6028bf50','customer',NULL,NULL,1,'2026-11-05T05:12:23.316Z');
INSERT INTO "users" VALUES (11,'ADMIN','admin@example.com','b201beef857504388b1879e352115fb5:09dbe9c9d567a1f2237474c6d4c5a6badfe1785b70cc095c37706afc9e09f722ea1c3eca9279f567d864d6d794f8c0dc7f9e08d0e32d5d17feccf3e0c5c9ae7f','customer',NULL,NULL,1,'2026-11-05T05:41:44.255Z');
CREATE INDEX IF NOT EXISTS "idx_activity_ticket" ON "activity" (
	"ticket_id",
	"created_at"
);
CREATE INDEX IF NOT EXISTS "idx_agent_devices_user" ON "agent_devices" (
	"user_id"
);
CREATE INDEX IF NOT EXISTS "idx_agent_pairing_codes_hash" ON "agent_pairing_codes" (
	"code_hash"
);
CREATE INDEX IF NOT EXISTS "idx_attachments_ticket" ON "attachments" (
	"ticket_id"
);
CREATE INDEX IF NOT EXISTS "idx_bot_conversations_product" ON "bot_conversations" (
	"product_id"
);
CREATE INDEX IF NOT EXISTS "idx_bot_messages_conversation" ON "bot_messages" (
	"conversation_id",
	"created_at"
);
CREATE INDEX IF NOT EXISTS "idx_calls_status" ON "calls" (
	"status"
);
CREATE INDEX IF NOT EXISTS "idx_calls_ticket" ON "calls" (
	"ticket_id",
	"created_at"
);
CREATE INDEX IF NOT EXISTS "idx_customer_tags_customer" ON "customer_tags" (
	"customer_id"
);
CREATE INDEX IF NOT EXISTS "idx_internal_chat_members_user" ON "internal_chat_members" (
	"user_id",
	"chat_id"
);
CREATE INDEX IF NOT EXISTS "idx_internal_chat_messages_chat" ON "internal_chat_messages" (
	"chat_id",
	"id"
);
CREATE INDEX IF NOT EXISTS "idx_messages_ticket" ON "messages" (
	"ticket_id",
	"created_at"
);
CREATE INDEX IF NOT EXISTS "idx_remote_sessions_status" ON "remote_sessions" (
	"status"
);
CREATE INDEX IF NOT EXISTS "idx_remote_sessions_ticket" ON "remote_sessions" (
	"ticket_id",
	"created_at"
);
CREATE INDEX IF NOT EXISTS "idx_sessions_user" ON "sessions" (
	"user_id"
);
CREATE INDEX IF NOT EXISTS "idx_ticket_tags_tag" ON "ticket_tags" (
	"tag_id"
);
CREATE INDEX IF NOT EXISTS "idx_ticket_tags_ticket" ON "ticket_tags" (
	"ticket_id"
);
CREATE INDEX IF NOT EXISTS "idx_tickets_assignee" ON "tickets" (
	"assignee_id"
);
CREATE INDEX IF NOT EXISTS "idx_tickets_customer" ON "tickets" (
	"customer_id"
);
CREATE INDEX IF NOT EXISTS "idx_tickets_product" ON "tickets" (
	"product_id"
);
CREATE INDEX IF NOT EXISTS "idx_tickets_status" ON "tickets" (
	"status"
);
CREATE INDEX IF NOT EXISTS "idx_tickets_updated" ON "tickets" (
	"updated_at"
);
COMMIT;
