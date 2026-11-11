import { db, getSetting, getSla, nowIso } from "./db.js";
import { hashPassword } from "./auth.js";
import { formatHours, renderTemplate } from "./format.js";
import { backfillProductAssignments } from "./products.js";

const MINUTE = 60 * 1000;
const password = "support123";

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

export function ensureSeed() {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (Number(existing.count) > 0) return { seeded: false };

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, company, title, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  const passwordHash = hashPassword(password);

  function createUser({ name, email, role, company = null, title = null }) {
    const info = insertUser.run(name, email, passwordHash, role, company, title, minutesAgo(60 * 24 * 45));
    return Number(info.lastInsertRowid);
  }

  const adminId = createUser({
    name: "Jordan Blake",
    email: "admin@supportiq.app",
    role: "admin",
    title: "Head of Customer Operations",
  });
  const alexId = createUser({
    name: "Alex Rivera",
    email: "alex@supportiq.app",
    role: "it",
    title: "Tier 2 Support Engineer",
  });
  const priyaId = createUser({
    name: "Priya Nair",
    email: "priya@supportiq.app",
    role: "it",
    title: "Support Specialist",
  });
  const marcusId = createUser({
    name: "Marcus Lee",
    email: "marcus@supportiq.app",
    role: "it",
    title: "Solutions Engineer",
  });
  const mayaId = createUser({
    name: "Maya Chen",
    email: "maya@northwind.co",
    role: "customer",
    company: "Northwind Labs",
  });
  const danielId = createUser({
    name: "Daniel Osei",
    email: "daniel@lumenpay.io",
    role: "customer",
    company: "LumenPay",
  });
  const elenaId = createUser({
    name: "Elena Rossi",
    email: "elena@arclight.health",
    role: "customer",
    company: "Arclight Health",
  });

  const users = {
    admin: adminId,
    alex: alexId,
    priya: priyaId,
    marcus: marcusId,
    maya: mayaId,
    daniel: danielId,
    elena: elenaId,
  };

  const customerIds = { maya: mayaId, daniel: danielId, elena: elenaId };

  const kb = [
    {
      question: "How do I reset my password?",
      answer:
        "Use the “Forgot password” link on the SupportIQ sign-in screen and follow the emailed reset link. The link expires after 30 minutes. If the email doesn't arrive within five minutes, check your spam folder, then create a request so IT can verify your account delivery details. Support will never ask you for your password.",
      keywords: "password, reset password, forgot password, reset link, locked out, sign in problem, login problem",
      category: "Account access",
    },
    {
      question: "I'm stuck in an SSO login loop",
      answer:
        "If your identity provider sends you back to the sign-in screen repeatedly, try a private browser window and confirm your SSO session hasn't expired at your provider. If the loop continues, create a request with the approximate time and your identity provider so IT can trace the sign-in attempt. Please don't send passwords or MFA codes here.",
      keywords: "sso, single sign on, login loop, redirect loop, identity provider, saml, sign in loop",
      category: "Account access",
    },
    {
      question: "The app isn't loading or shows an error",
      answer:
        "Start with a hard refresh, confirm your connection, and try a private window to rule out cached data. If the error persists, take a screenshot and note the time it happened. Create a support request and attach both so IT can correlate it with service logs. The assistant can't see your account or logs from this chat.",
      keywords: "not loading, error, blank screen, app crash, frozen, crashing, bug, 500 error, 502 error",
      category: "Technical issue",
    },
    {
      question: "Where can I find an invoice or receipt?",
      answer:
        "Invoices and receipts are in your account under Billing → Invoices. If a document is missing or shows incorrect account details, create a support request with the invoice date and IT will investigate. Billing records can't be changed from chat.",
      keywords: "invoice, receipt, billing document, vat number, billing history, download invoice",
      category: "Billing & invoices",
    },
    {
      question: "How long until support replies?",
      answer:
        "IT support works to response targets by priority: urgent within 1 hour, high within 2 hours, normal within 8 hours, and low within 1 day. Those are targets, not guarantees. Your request page shows live status, the assigned agent, and the response target. Admins monitor every request, including ones at risk of missing target.",
      keywords: "response time, how long, reply, sla, waiting, when will support respond, support hours",
      category: "Policies & expectations",
    },
    {
      question: "How do I attach a screenshot?",
      answer:
        "In a request or when creating one, use the attachment button and choose an image or PDF up to 5 MB. A screenshot with the error message and timestamp helps IT resolve issues faster. Attachments are only visible to you and the support team inside SupportIQ.",
      keywords: "screenshot, attach, attachment, upload, image, pdf, file",
      category: "How-to",
    },
    {
      question: "Where do I track my request?",
      answer:
        "Open My requests in the customer portal. Each request shows its stage, assigned agent, response target, and the full conversation. Replies and status changes appear there as they happen — everything stays inside SupportIQ.",
      keywords: "track request, status, ticket status, progress, my request, reference, siq",
      category: "How-to",
    },
    {
      question: "Can I export my account data?",
      answer:
        "Account owners can start an export from Settings → Data & exports. Large exports are prepared in the background and downloaded from the same page when ready. If an export fails or stalls, create a request with the export ID and approximate start time.",
      keywords: "export data, download data, csv, data export, audit log, export job",
      category: "Data & exports",
    },
    {
      question: "How do I add someone to my workspace?",
      answer:
        "Workspace admins can invite teammates from Settings → Members. If an invitation doesn't arrive, create a support request with the invited email so IT can check delivery. Membership and permissions can't be changed from chat.",
      keywords: "add teammate, invite, workspace members, user access, permissions, second admin",
      category: "Account access",
    },
  ];

  const insertKb = db.prepare(
    `INSERT INTO kb_entries (question, answer, keywords, category, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  );
  const kbIds = {};
  for (const entry of kb) {
    const info = insertKb.run(entry.question, entry.answer, entry.keywords, entry.category, minutesAgo(60 * 24 * 20), minutesAgo(60 * 24 * 20));
    kbIds[entry.question] = Number(info.lastInsertRowid);
  }

  const canned = [
    {
      title: "Request more detail",
      body:
        "Thanks for the details. To help us confirm what's happening, could you share a screenshot and the exact time the issue last occurred? If there's an error reference or trace ID, include that too.",
    },
    {
      title: "Investigating — first update",
      body:
        "We've reproduced the issue on our side and the team is working on a fix. I'll update you in this thread as soon as we have a verified resolution — no need to open a separate request.",
    },
    {
      title: "Fix applied — please verify",
      body:
        "A fix has been applied and verified internally. Please refresh and try again. If anything still looks wrong, reply here and we'll reopen the investigation in this same thread.",
    },
    {
      title: "Bringing in a specialist",
      body:
        "I'm bringing in a specialist from the platform team. They'll continue with you in this thread so the full context stays in one place.",
    },
  ];
  const insertCanned = db.prepare(
    "INSERT INTO canned_replies (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)",
  );
  for (const reply of canned) {
    insertCanned.run(reply.title, reply.body, minutesAgo(60 * 24 * 14), minutesAgo(60 * 24 * 14));
  }

  const insertBotConversation = db.prepare(
    "INSERT INTO bot_conversations (customer_id, created_at, updated_at) VALUES (?, ?, ?)",
  );
  const insertBotMessage = db.prepare(
    "INSERT INTO bot_messages (conversation_id, role, body, created_at) VALUES (?, ?, ?, ?)",
  );

  function createConversation(customerId, entries, startedMinutesAgo) {
    const createdAt = minutesAgo(startedMinutesAgo);
    const info = insertBotConversation.run(customerId, createdAt, createdAt);
    const conversationId = Number(info.lastInsertRowid);
    const name = db.prepare("SELECT name FROM users WHERE id = ?").get(customerId)?.name ?? "there";
    const first = renderTemplate(getSetting("bot_greeting"), {
      first_name: String(name).split(" ")[0],
    });
    let lastAt = createdAt;
    insertBotMessage.run(conversationId, "bot", first, createdAt);
    for (const entry of entries) {
      const at = new Date(new Date(createdAt).getTime() + entry.atMin * MINUTE).toISOString();
      insertBotMessage.run(conversationId, entry.role, entry.body, at);
      lastAt = at;
    }
    db.prepare("UPDATE bot_conversations SET updated_at = ? WHERE id = ?").run(lastAt, conversationId);
    return { id: conversationId, createdAt, lastAt };
  }

  const convDaniel = createConversation(
    danielId,
    [
      {
        role: "customer",
        atMin: 1,
        body:
          "Our webhook deliveries started failing with 502 errors after yesterday's deploy. It's blocking our nightly sync.",
      },
      {
        role: "bot",
        atMin: 2,
        body: getSetting("bot_fallback"),
      },
      {
        role: "customer",
        atMin: 5,
        body: "I need to talk to IT support — this is urgent.",
      },
      {
        role: "bot",
        atMin: 6,
        body: getSetting("bot_escalation"),
      },
    ],
    2040,
  );

  createConversation(
    elenaId,
    [
      { role: "customer", atMin: 1, body: "Where can I download last month's invoice?" },
      {
        role: "bot",
        atMin: 2,
        body: kb[3].answer,
      },
      { role: "customer", atMin: 3, body: "That worked, thanks." },
      {
        role: "bot",
        atMin: 4,
        body: "Glad that helped. If anything else comes up, I'm here for support questions — and you can always open a request so the IT team has the full picture.",
      },
    ],
    60 * 24 * 4,
  );

  createConversation(
    mayaId,
    [
      {
        role: "customer",
        atMin: 1,
        body: "I keep getting redirected when I sign in with SSO.",
      },
      { role: "bot", atMin: 2, body: kb[1].answer },
    ],
    60 * 24,
  );

  createConversation(
    danielId,
    [
      {
        role: "customer",
        atMin: 1,
        body: "Do you offer discounts for annual plans?",
      },
      { role: "bot", atMin: 2, body: getSetting("bot_guardrail") },
    ],
    60 * 24 * 2,
  );

  const conversationMessages = db
    .prepare("SELECT role, body FROM bot_messages WHERE conversation_id = ? ORDER BY created_at, id")
    .all(convDaniel.id);
  const transcript = [
    "Assistant conversation — captured when this request was created",
    ...conversationMessages.map(
      (message) => `${message.role === "customer" ? "Customer" : "SupportIQ Assistant"}: ${message.body}`,
    ),
  ].join("\n\n");

  const insertTicket = db.prepare(
    `INSERT INTO tickets (
      ref, customer_id, assignee_id, subject, description, category, priority, status, channel,
      bot_conversation_id, created_at, updated_at, first_response_at, resolved_at, closed_at,
      response_due_at, resolve_due_at, resolution_summary, rating, rating_comment, rated_at, reopened_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  const insertMessage = db.prepare(
    `INSERT INTO messages (ticket_id, sender_id, sender_role, body, is_internal, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertActivity = db.prepare(
    `INSERT INTO activity (ticket_id, actor_id, type, from_value, to_value, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  function createTicket(data) {
    const customerId = customerIds[data.customer];
    const assigneeId = data.assignee ? users[data.assignee] : null;
    const sla = getSla()[data.priority];
    const createdMs = Date.now() - data.createdMinutesAgo * MINUTE;
    const timeAt = (minutes) => new Date(createdMs + minutes * MINUTE).toISOString();
    const created = new Date(createdMs).toISOString();
    const responseDueAt = new Date(createdMs + sla.response_hours * 60 * MINUTE).toISOString();
    const resolveDueAt = new Date(createdMs + sla.resolve_hours * 60 * MINUTE).toISOString();
    const firstResponseAt =
      data.firstResponseAfterMin != null ? timeAt(data.firstResponseAfterMin) : null;
    const resolvedAt = data.resolvedAfterMin != null ? timeAt(data.resolvedAfterMin) : null;
    const closedAt =
      data.closedMinutesAgo != null ? minutesAgo(data.closedMinutesAgo) : null;
    let ratedAt = data.ratedMinutesAgo != null ? minutesAgo(data.ratedMinutesAgo) : null;
    if (ratedAt && resolvedAt && new Date(ratedAt) < new Date(resolvedAt)) {
      ratedAt = new Date(new Date(resolvedAt).getTime() + MINUTE).toISOString();
    }

    const messages = data.messages ?? [];
    const messageTimes = [
      created,
      timeAt(1),
      ...(firstResponseAt ? [firstResponseAt] : []),
      ...messages.map((message) => timeAt(message.atMin)),
      ...(data.statusChangeAfterMin != null ? [timeAt(data.statusChangeAfterMin)] : []),
      ...(resolvedAt ? [resolvedAt] : []),
      ...(closedAt ? [closedAt] : []),
      ...(ratedAt ? [ratedAt] : []),
    ];
    const updatedAt = messageTimes.reduce((latest, value) =>
      new Date(value) > new Date(latest) ? value : latest,
    );

    const info = insertTicket.run(
      `TMP-${data.subject.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      assigneeId,
      data.subject,
      data.description,
      data.category,
      data.priority,
      data.status,
      data.channel ?? "portal",
      data.botConversationId ?? null,
      created,
      updatedAt,
      firstResponseAt,
      resolvedAt,
      closedAt,
      responseDueAt,
      resolveDueAt,
      data.resolutionSummary ?? null,
      data.rating ?? null,
      data.ratingComment ?? null,
      ratedAt,
    );
    const ticketId = Number(info.lastInsertRowid);
    const ref = `SIQ-${1000 + ticketId}`;
    db.prepare("UPDATE tickets SET ref = ? WHERE id = ?").run(ref, ticketId);

    insertMessage.run(ticketId, customerId, "customer", data.description, 0, created);

    if (data.noAck !== true) {
      const name = db.prepare("SELECT name FROM users WHERE id = ?").get(customerId)?.name ?? "there";
      const ack = renderTemplate(getSetting("auto_ack"), {
        first_name: String(name).split(" ")[0],
        ticket_ref: ref,
        response_target: formatHours(sla.response_hours),
      });
      insertMessage.run(ticketId, null, "bot", ack, 0, timeAt(1));
    }

    for (const message of messages) {
      const senderRole = message.role ?? (message.user === data.customer ? "customer" : "it");
      const senderId =
        senderRole === "customer" ? customerId : users[message.user] ?? assigneeId ?? null;
      insertMessage.run(
        ticketId,
        senderId,
        senderRole,
        message.body,
        message.internal ? 1 : 0,
        timeAt(message.atMin),
      );
    }

    if (data.transcript) {
      insertMessage.run(ticketId, null, "system", data.transcript, 1, timeAt(2));
    }

    insertActivity.run(ticketId, customerId, "created", null, "open", null, created);
    if (data.channel === "assistant") {
      insertActivity.run(ticketId, customerId, "assistant", null, null, null, timeAt(2));
    }
    if (assigneeId) {
      const assigneeName = db.prepare("SELECT name FROM users WHERE id = ?").get(assigneeId)?.name;
      insertActivity.run(ticketId, adminId, "assigned", null, assigneeName, null, timeAt(2));
    }
    if (firstResponseAt) {
      insertActivity.run(ticketId, assigneeId ?? adminId, "status", "open", "in_progress", null, firstResponseAt);
    }
    if (data.status === "waiting_customer" && data.statusChangeAfterMin != null) {
      insertActivity.run(
        ticketId,
        assigneeId ?? adminId,
        "status",
        "in_progress",
        "waiting_customer",
        null,
        timeAt(data.statusChangeAfterMin),
      );
    }
    if (resolvedAt) {
      insertActivity.run(
        ticketId,
        assigneeId ?? adminId,
        "status",
        "in_progress",
        "resolved",
        null,
        resolvedAt,
      );
    }
    if (closedAt) {
      insertActivity.run(ticketId, assigneeId ?? adminId, "status", "resolved", "closed", null, closedAt);
    }
    if (ratedAt && data.rating) {
      insertActivity.run(ticketId, customerId, "rated", null, String(data.rating), null, ratedAt);
    }

    if (data.botConversationId) {
      db.prepare(
        "UPDATE bot_conversations SET escalated_ticket_id = ?, updated_at = ? WHERE id = ?",
      ).run(ticketId, created, data.botConversationId);
    }

    return { id: ticketId, ref };
  }

  const t1 = createTicket({
    customer: "maya",
    subject: "SSO login loop after identity provider change",
    description:
      "Since our identity provider migration this morning, signing in sends me straight back to the SupportIQ login page in a loop. I've tried Chrome and Safari. This is blocking month-end close for the finance team.",
    category: "Account access",
    priority: "urgent",
    status: "open",
    createdMinutesAgo: 180,
  });

  const t2 = createTicket({
    customer: "daniel",
    subject: "Webhook deliveries returning 502 since yesterday's deploy",
    description:
      "Starting around 02:10 UTC, every webhook delivery to our endpoint returns 502 and then retries. Our nightly sync is blocked. Latest trace ID is tr_9f2c4a. The endpoint itself is healthy and answers synthetic checks.",
    category: "Technical issue",
    priority: "high",
    status: "in_progress",
    assignee: "alex",
    channel: "assistant",
    botConversationId: convDaniel.id,
    transcript,
    createdMinutesAgo: 1860,
    firstResponseAfterMin: 90,
    messages: [
      {
        user: "alex",
        role: "it",
        atMin: 90,
        body:
          "Hi Daniel — we're seeing 502s from the egress layer and investigating with the platform team. I'll keep this thread updated. No need to redeploy on your side yet.",
      },
      {
        user: "daniel",
        role: "customer",
        atMin: 150,
        body:
          "Still failing. Latest trace ID is tr_9f2c4a and it started right after the 02:10 UTC deploy. We're losing roughly 400 events per retry window.",
      },
      {
        user: "alex",
        role: "it",
        atMin: 720,
        internal: true,
        body:
          "Traced to a stale gateway pool from the deploy. Platform team is cycling it; do not ask the customer to redeploy yet. Monitoring error rate for the next hour.",
      },
    ],
  });

  createTicket({
    customer: "elena",
    subject: "October invoice shows the wrong account tier",
    description:
      "Our October invoice (INV-88421) appears to bill us at the Enterprise tier, but our contract is for Growth. Could you check the account mapping and reissue the invoice? Finance is holding the payment run.",
    category: "Billing & invoices",
    priority: "normal",
    status: "resolved",
    assignee: "priya",
    createdMinutesAgo: 60 * 24 * 4,
    firstResponseAfterMin: 300,
    resolvedAfterMin: 1200,
    rating: 5,
    ratingComment: "Priya sorted the invoice issue in less than a day. Clear updates the whole way.",
    ratedMinutesAgo: 60 * 24 * 3,
    resolutionSummary:
      "The billing account was mapped to the wrong tier after the October migration. Reissued invoice INV-88421 with the correct Growth contract details; finance confirmed the ledger entry.",
    messages: [
      {
        user: "priya",
        role: "it",
        atMin: 300,
        body:
          "Thanks Elena. I can see the mismatch on the October invoice. Could you confirm the invoice number and the contract tier on your order form?",
      },
      {
        user: "elena",
        role: "customer",
        atMin: 360,
        body: "Invoice INV-88421, dated 1 October. Our order form says Growth, 40 seats.",
      },
      {
        user: "priya",
        role: "it",
        atMin: 1140,
        body:
          "Confirmed and corrected. I've reissued the invoice with the Growth mapping and asked finance to void the original. It should appear in your Billing portal shortly.",
      },
      { user: "elena", role: "customer", atMin: 1160, body: "Got the corrected invoice. Thank you." },
    ],
  });

  createTicket({
    customer: "maya",
    subject: "Desktop app crashes when opening shared dashboards",
    description:
      "SupportIQ desktop 4.18.2 crashes every time I open a dashboard shared by another workspace. It happens on macOS 15.3. Local dashboards are fine. I'll add a screenshot once I'm back at my desk.",
    category: "Technical issue",
    priority: "normal",
    status: "waiting_customer",
    assignee: "priya",
    createdMinutesAgo: 60 * 24 * 2,
    firstResponseAfterMin: 40,
    statusChangeAfterMin: 2640,
    messages: [
      {
        user: "priya",
        role: "it",
        atMin: 40,
        body:
          "Thanks Maya. I can reproduce a crash on macOS 15 when a shared dashboard contains a deleted widget. Could you attach a screenshot of the error and confirm your app version?",
      },
      {
        user: "priya",
        role: "it",
        atMin: 60,
        internal: true,
        body:
          "Reproduced locally. Waiting on the customer's screenshot and app version before escalating to desktop engineering.",
      },
      {
        user: "maya",
        role: "customer",
        atMin: 100,
        body: "App version is 4.18.2. I'll grab a screenshot after my next meeting.",
      },
      {
        user: "priya",
        role: "it",
        atMin: 2640,
        internal: true,
        body: "Screenshot still missing. Friendly follow-up sent; request left waiting on customer.",
      },
    ],
  });

  createTicket({
    customer: "daniel",
    subject: "Invited second admin never appears under Members",
    description:
      "Our new ops lead accepted the invitation, but she doesn't appear under Members and can't access the workspace. Invite email was sent yesterday to ops-lead@lumenpay.io.",
    category: "Account access",
    priority: "low",
    status: "open",
    createdMinutesAgo: 360,
  });

  createTicket({
    customer: "elena",
    subject: "Urgent: export job stalled at 60%",
    description:
      "The audit export we started at 06:00 is stuck at 60% for almost an hour. This is blocking our security review today. Export ID: exp_77121.",
    category: "Data & exports",
    priority: "urgent",
    status: "resolved",
    assignee: "alex",
    createdMinutesAgo: 60 * 24 * 2,
    firstResponseAfterMin: 25,
    resolvedAfterMin: 145,
    rating: 4,
    ratingComment: "Fast fix once Alex picked it up. The export page could explain the retry state better.",
    ratedMinutesAgo: 2700,
    resolutionSummary:
      "The export worker had stalled on a lock held by the nightly archive job. Requeued the export, verified the 100% file, and added a runbook note for on-call.",
    messages: [
      {
        user: "alex",
        role: "it",
        atMin: 25,
        body:
          "I can see the export holding a lock from the archive job. Requeuing it now and watching the worker — I'll confirm when the file is complete.",
      },
      {
        user: "alex",
        role: "it",
        atMin: 140,
        body:
          "The export completed and passed checksum verification. It's available from the same export page. I've also logged the lock contention for the platform team.",
      },
      { user: "elena", role: "customer", atMin: 160, body: "Downloaded and verified. Thank you." },
    ],
  });

  createTicket({
    customer: "maya",
    subject: "App freezes when opening shared dashboards",
    description:
      "The web app freezes for 5–10 seconds whenever I open a shared dashboard, then recovers. Started after this morning's release. Chrome 141 on Windows. It's slowing down our stand-up.",
    category: "Technical issue",
    priority: "high",
    status: "open",
    createdMinutesAgo: 25,
  });

  createTicket({
    customer: "daniel",
    subject: "Password reset email never arrives",
    description:
      "I requested a password reset three times and no email arrives. I can still use my current session, but I need to reset before it expires. Checked spam already.",
    category: "Account access",
    priority: "normal",
    status: "resolved",
    assignee: "marcus",
    createdMinutesAgo: 60 * 24 * 6,
    firstResponseAfterMin: 120,
    resolvedAfterMin: 3000,
    rating: 3,
    ratingComment: "Reset eventually worked, but it took a while to hear back.",
    ratedMinutesAgo: 4320,
    resolutionSummary:
      "Reset delivery was blocked by the customer's mail gateway. Re-sent via a verified backup address, confirmed sign-in, and flagged the gateway rule for their IT.",
    messages: [
      {
        user: "marcus",
        role: "it",
        atMin: 120,
        body:
          "Thanks for flagging. I can see the reset emails leaving our service but being deferred by your mail gateway. I'll verify the delivery path and come back with a fix.",
      },
      {
        user: "marcus",
        role: "it",
        atMin: 520,
        internal: true,
        body: "Gateway is greylisting our sending domain. Working with deliverability to request an allowlist on the customer side.",
      },
      {
        user: "marcus",
        role: "it",
        atMin: 2960,
        body:
          "I've re-sent the reset through a verified backup path and confirmed delivery. Please try again — the link is valid for 30 minutes.",
      },
      { user: "daniel", role: "customer", atMin: 2990, body: "That worked. Signed in and reset." },
    ],
  });

  createTicket({
    customer: "elena",
    subject: "Alert routing silently dropping critical events",
    description:
      "Critical alert events are intermittently not reaching our on-call rotation. We saw three missed pages last night. Routing rule is set to 'Critical → On-call'. Nothing in the audit log.",
    category: "Technical issue",
    priority: "high",
    status: "in_progress",
    assignee: "marcus",
    createdMinutesAgo: 60 * 24 * 2,
    firstResponseAfterMin: 540,
    messages: [
      {
        user: "marcus",
        role: "it",
        atMin: 540,
        body:
          "I'm sorry about the missed pages — that's a serious one. I can see gaps in the routing audit. Could you share one event ID from last night and the exact window?",
      },
      {
        user: "elena",
        role: "customer",
        atMin: 600,
        body:
          "Event evt_3f19 at 02:41 UTC and evt_3f22 at 02:58 UTC. Both were marked critical in our monitor. The third was around 04:10 but I don't have the ID.",
      },
      {
        user: "marcus",
        role: "it",
        atMin: 2640,
        internal: true,
        body:
          "Escalated to on-call. Root cause suspected in the routing-rules cache; no ETA yet. Customer is waiting on a status update by end of day.",
      },
    ],
  });

  createTicket({
    customer: "maya",
    subject: "Need a copy of our full data export",
    description:
      "Please prepare a full workspace export for our data retention review. We need it in CSV with the schema documentation if available.",
    category: "Data & exports",
    priority: "low",
    status: "resolved",
    assignee: "priya",
    createdMinutesAgo: 60 * 24 * 12,
    firstResponseAfterMin: 180,
    resolvedAfterMin: 1440,
    rating: 5,
    ratingComment: "Exactly what I needed, with a checksum included.",
    ratedMinutesAgo: 13000,
    resolutionSummary:
      "Prepared a signed data export link valid for seven days and confirmed the download completed successfully.",
    messages: [
      {
        user: "priya",
        role: "it",
        atMin: 180,
        body:
          "Happy to prepare this. I'll include the CSV schema and a checksum so you can verify integrity. The secure link will be valid for seven days.",
      },
      {
        user: "priya",
        role: "it",
        atMin: 1420,
        body: "Export is ready and attached to this request via a secure link. Checksum is in the link notes.",
      },
    ],
  });

  createTicket({
    customer: "daniel",
    subject: "Mobile app scroll position jumps on iOS",
    description:
      "On the iOS app, scrolling through a long request thread jumps back to the top whenever a new message arrives. This makes live threads impossible to follow. iPhone 15, iOS 19.2.",
    category: "Technical issue",
    priority: "normal",
    status: "closed",
    assignee: "alex",
    createdMinutesAgo: 60 * 24 * 18,
    firstResponseAfterMin: 360,
    resolvedAfterMin: 4320,
    closedMinutesAgo: 60 * 24 * 13,
    rating: 2,
    ratingComment: "The fix landed, but updates were slow and I had to chase twice.",
    ratedMinutesAgo: 60 * 24 * 12.5,
    resolutionSummary:
      "Patched iOS scroll restoration in 4.16.3. Verified on iPhone 15 and iPhone 13; customer confirmed after updating.",
    messages: [
      {
        user: "alex",
        role: "it",
        atMin: 360,
        body:
          "We've reproduced the jump on iOS 19 when a new message is appended. The mobile team is working on a scroll-position fix for the next patch.",
      },
      {
        user: "daniel",
        role: "customer",
        atMin: 2880,
        body: "Any update? This is still happening and we have had to move on-call handovers to a browser.",
      },
      {
        user: "alex",
        role: "it",
        atMin: 4300,
        body:
          "Fix is in 4.16.3, rolling out now. Please update and try a live thread. If it still jumps, reply here and I'll reopen.",
      },
    ],
  });

  createTicket({
    customer: "elena",
    subject: "Replacing a lost two-factor authentication device",
    description:
      "One of our workspace admins lost their phone and can't complete 2FA. We need to remove the old device and enroll a new one. Identity has been verified internally.",
    category: "Account access",
    priority: "normal",
    status: "in_progress",
    assignee: "alex",
    createdMinutesAgo: 1800,
    firstResponseAfterMin: 180,
    messages: [
      {
        user: "alex",
        role: "it",
        atMin: 180,
        body:
          "Thanks. I'll need the affected account email and a verification contact from your security team before I can reset MFA. Please don't post the phone number here.",
      },
      {
        user: "elena",
        role: "customer",
        atMin: 240,
        body: "Account is j.okafor@arclight.health. Security contact is our CISO, copied on the ticket.",
      },
      {
        user: "alex",
        role: "it",
        atMin: 1500,
        internal: true,
        body: "Out-of-band identity check complete. Removing old TOTP device and issuing a fresh enrollment link to the verified address.",
      },
    ],
  });

  createTicket({
    customer: "maya",
    subject: "Billing receipt needs our VAT number",
    description:
      "Please add our VAT number to the October and November billing receipts. Our finance system rejects them without it. VAT: GB 412 8891 23.",
    category: "Billing & invoices",
    priority: "high",
    status: "in_progress",
    assignee: "priya",
    createdMinutesAgo: 240,
    firstResponseAfterMin: 30,
    messages: [
      {
        user: "priya",
        role: "it",
        atMin: 30,
        body:
          "Thanks Maya. I've passed the VAT number to billing. Could you confirm the legal entity name exactly as it should appear on the receipts?",
      },
      {
        user: "maya",
        role: "customer",
        atMin: 60,
        body: "Northwind Labs Ltd.",
      },
      {
        user: "priya",
        role: "it",
        atMin: 120,
        internal: true,
        body: "Finance is regenerating both receipts with the VAT ID and entity name. ETA end of day.",
      },
    ],
  });

  createTicket({
    customer: "daniel",
    subject: "Docs search returns stale results",
    description:
      "Searching the docs portal for “ingest limits” returns a 2024 page that contradicts the current API reference. Team members are following outdated guidance. Cache purge didn't help.",
    category: "Technical issue",
    priority: "high",
    status: "waiting_customer",
    assignee: "marcus",
    createdMinutesAgo: 60 * 24 * 2,
    firstResponseAfterMin: 45,
    statusChangeAfterMin: 2600,
    messages: [
      {
        user: "marcus",
        role: "it",
        atMin: 45,
        body:
          "I can reproduce the stale result. Before I purge the search index, could you share the exact query and a screenshot of the result? I want to preserve the evidence.",
      },
      {
        user: "daniel",
        role: "customer",
        atMin: 120,
        body: "Query is “ingest limits”. The top result is a 2024 page titled “Ingest limits v1”. I'll attach a screenshot next.",
      },
      {
        user: "marcus",
        role: "it",
        atMin: 2600,
        internal: true,
        body: "Search index purged and reindexed. Waiting on the customer to confirm the stale page no longer appears.",
      },
    ],
  });

  createTicket({
    customer: "elena",
    subject: "Exporting audit logs to our SIEM",
    description:
      "We want to stream audit logs to our SIEM. Is there a supported integration, and what retention does the API provide? We need this for our next security review.",
    category: "How-to question",
    priority: "normal",
    status: "resolved",
    assignee: "priya",
    createdMinutesAgo: 60 * 24 * 8,
    firstResponseAfterMin: 240,
    resolvedAfterMin: 1800,
    rating: 4,
    ratingComment: "Helpful walkthrough. Waiting on one security questionnaire, otherwise great.",
    ratedMinutesAgo: 9000,
    resolutionSummary:
      "Enabled audit log streaming with a scoped API key and walked through the SIEM field mapping. Retention question answered in-thread.",
    messages: [
      {
        user: "priya",
        role: "it",
        atMin: 240,
        body:
          "We support streaming audit events with a scoped API key. Retention is 400 days for audit events, 90 days for API request logs. I'll send the field mapping and a sample payload.",
      },
      {
        user: "elena",
        role: "customer",
        atMin: 700,
        body: "Perfect. We'll need the security questionnaire for the scoped key — can you attach it?",
      },
      {
        user: "priya",
        role: "it",
        atMin: 1780,
        body: "Attached the completed questionnaire and the sample payload. The scoped key is active for your workspace.",
      },
    ],
  });

  createTicket({
    customer: "maya",
    subject: "Desktop app won't install on Windows 11",
    description:
      "The installer runs and then closes with no error. Windows 11 24H2. We've tried running as administrator. Two other machines installed fine last week.",
    category: "Device & hardware",
    priority: "normal",
    status: "resolved",
    assignee: "alex",
    createdMinutesAgo: 60 * 24 * 9,
    firstResponseAfterMin: 120,
    resolvedAfterMin: 360,
    rating: 5,
    ratingComment: "Alex nailed it on the first reply.",
    ratedMinutesAgo: 12000,
    resolutionSummary:
      "Installer failed on a stale Visual C++ redistributable. Provided the supported installer package and verified launch after reboot.",
    messages: [
      {
        user: "alex",
        role: "it",
        atMin: 120,
        body:
          "That silent exit usually means a stale Visual C++ redistributable. Please install the supported package from this link and reboot before running the SupportIQ installer again.",
      },
      { user: "maya", role: "customer", atMin: 340, body: "That fixed it. Installed and signed in." },
    ],
  });

  createTicket({
    customer: "daniel",
    subject: "API keys page returns 403 for team members",
    description:
      "Workspace members get a 403 on Settings → API keys, even though they have the Developer role. Workspace owners can access the page. Is this a permissions bug?",
    category: "Account access",
    priority: "high",
    status: "resolved",
    assignee: "marcus",
    createdMinutesAgo: 60 * 24 * 5,
    firstResponseAfterMin: 60,
    resolvedAfterMin: 380,
    rating: 5,
    ratingComment: "Fast and precise.",
    ratedMinutesAgo: 6700,
    resolutionSummary:
      "The Developer role policy was missing the API keys read scope. Added the scope for workspace members and verified with the customer's test account.",
    messages: [
      {
        user: "marcus",
        role: "it",
        atMin: 60,
        body:
          "I can see the Developer policy is missing the API keys read scope. I'm adding it now; you won't need to change anything on your side.",
      },
      {
        user: "marcus",
        role: "it",
        atMin: 360,
        body: "Scope added and verified with a test member account. Please have your team refresh and try again.",
      },
    ],
  });

  createTicket({
    customer: "elena",
    subject: "How do we bulk-import users?",
    description:
      "We're onboarding 400 staff next month. Is there a CSV template for bulk user import, and what are the limits per upload?",
    category: "How-to question",
    priority: "low",
    status: "closed",
    assignee: "priya",
    createdMinutesAgo: 60 * 24 * 13,
    firstResponseAfterMin: 300,
    resolvedAfterMin: 840,
    closedMinutesAgo: 60 * 24 * 8,
    rating: 4,
    ratingComment: "Clear instructions; would like a bulk-import template.",
    ratedMinutesAgo: 11000,
    resolutionSummary:
      "Shared the supported CSV template and import limits; customer imported 412 users and confirmed all records.",
    messages: [
      {
        user: "priya",
        role: "it",
        atMin: 300,
        body:
          "Yes — use the CSV template in Settings → Members → Import. The limit is 500 rows per upload, and email is the unique key. Required columns are name, email, and role.",
      },
      { user: "elena", role: "customer", atMin: 800, body: "Imported 412 users successfully. Thanks." },
    ],
  });

  createTicket({
    customer: "maya",
    subject: "Intermittent latency on EU endpoint",
    description:
      "API calls to the EU region are taking 4–8 seconds intermittently since 09:00 UTC. US calls are normal. Request IDs in the attached log range from 09:04 to 09:22.",
    category: "Technical issue",
    priority: "high",
    status: "resolved",
    assignee: "alex",
    createdMinutesAgo: 60 * 24 * 11,
    firstResponseAfterMin: 90,
    resolvedAfterMin: 300,
    rating: 4,
    ratingComment: "Fixed the routing issue. Communication was good.",
    ratedMinutesAgo: 15000,
    resolutionSummary:
      "The EU edge pool was undersized during a traffic spike. Capacity increased by 40%; latency returned to baseline over 90 minutes.",
    messages: [
      {
        user: "alex",
        role: "it",
        atMin: 90,
        body:
          "Thanks — the EU edge pool is saturated. We're adding capacity now and will watch p95 latency until it holds below 300 ms.",
      },
      {
        user: "alex",
        role: "it",
        atMin: 280,
        body: "Capacity added. p95 is back under 300 ms across the last 20 minutes.",
      },
    ],
  });

  createTicket({
    customer: "daniel",
    subject: "Request to enable 400-day audit log retention",
    description:
      "For our compliance program we need audit log retention beyond the default window. Can you enable the 400-day retention on our workspace, or tell us what the process is?",
    category: "Feature request",
    priority: "normal",
    status: "open",
    createdMinutesAgo: 600,
  });

  createTicket({
    customer: "elena",
    subject: "Return label for replaced laptop",
    description:
      "Please send a prepaid return label for the laptop you replaced last week. The depot said they can't accept it without a label. Serial is ARL-2291.",
    category: "Device & hardware",
    priority: "low",
    status: "closed",
    assignee: "marcus",
    createdMinutesAgo: 60 * 24 * 20,
    firstResponseAfterMin: 1200,
    resolvedAfterMin: 2880,
    closedMinutesAgo: 60 * 24 * 17,
    rating: 5,
    ratingComment: "Return label arrived the same day.",
    ratedMinutesAgo: 60 * 24 * 16,
    resolutionSummary:
      "Issued a prepaid return label and confirmed the depot received the laptop.",
    messages: [
      {
        user: "marcus",
        role: "it",
        atMin: 1200,
        body:
          "I've issued a prepaid return label to your registered address. The depot should accept the serial ARL-2291 with that label — no other paperwork needed.",
      },
      {
        user: "marcus",
        role: "it",
        atMin: 2860,
        body: "Depot has confirmed receipt of the laptop. Closing this request.",
      },
    ],
  });

  const t22 = createTicket({
    customer: "maya",
    subject: "Scheduled report didn't run this morning",
    description:
      "Our daily usage report is set for 06:00 UTC and didn't run today. The schedule still shows active. Yesterday's run completed normally.",
    category: "How-to question",
    priority: "normal",
    status: "open",
    createdMinutesAgo: 60,
  });

  // Populate the product dimension for demo data so every portal can show
  // product-specific concerns immediately.
  backfillProductAssignments(db);

  const insertRead = db.prepare(
    "INSERT OR REPLACE INTO ticket_reads (user_id, ticket_id, last_read_at) VALUES (?, ?, ?)",
  );

  const allTickets = db.prepare("SELECT * FROM tickets").all();
  for (const customer of Object.values(customerIds)) {
    for (const ticket of allTickets.filter((row) => row.customer_id === customer)) {
      if (["resolved", "closed"].includes(ticket.status)) {
        insertRead.run(customer, ticket.id, ticket.updated_at);
      } else {
        const lastOwn = db
          .prepare(
            "SELECT MAX(created_at) AS at FROM messages WHERE ticket_id = ? AND sender_id = ? AND is_internal = 0",
          )
          .get(ticket.id, customer);
        const readAt = lastOwn?.at
          ? new Date(new Date(lastOwn.at).getTime() + MINUTE).toISOString()
          : ticket.created_at;
        insertRead.run(customer, ticket.id, readAt);
      }
    }
  }

  for (const agentId of [alexId, priyaId, marcusId]) {
    for (const ticket of allTickets) {
      if (ticket.assignee_id === agentId && !["resolved", "closed"].includes(ticket.status)) {
        const lastOwn = db
          .prepare("SELECT MAX(created_at) AS at FROM messages WHERE ticket_id = ? AND sender_id = ?")
          .get(ticket.id, agentId);
        const readAt = lastOwn?.at ?? ticket.created_at;
        insertRead.run(agentId, ticket.id, readAt);
      } else {
        insertRead.run(agentId, ticket.id, nowIso());
      }
    }
  }
  for (const ticket of allTickets) {
    insertRead.run(adminId, ticket.id, nowIso());
  }

  return {
    seeded: true,
    tickets: allTickets.length,
    users: 7,
    sampleTicketRef: t22.ref,
    seededTicketRefs: [t1.ref, t2.ref, t22.ref],
  };
}
