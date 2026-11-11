import assert from "node:assert/strict";
import test from "node:test";
import ticketRouter from "../server/routes/ticket.routes.js";
import { addHours, db, nowIso } from "../server/db.js";
import { getAgentPerformance } from "../server/metrics.js";

function runRoute({ url, method, user, params = {}, body = {} }) {
  return new Promise((resolve) => {
    let finished = false;
    const done = (status, payload) => {
      if (!finished) {
        finished = true;
        resolve({ status, body: payload });
      }
    };

    const req = {
      user,
      query: {},
      params,
      url,
      method,
      headers: {},
      body,
    };

    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      req,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        done(this.statusCode, payload);
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
    };

    ticketRouter.handle(req, res, (error) => {
      if (error) done(500, { error: error.message });
      else done(res.statusCode, res.body);
    });
  });
}

function activeUser(role) {
  return db.prepare("SELECT * FROM users WHERE role = ? AND active = 1 ORDER BY id LIMIT 1").get(role);
}

function createTicket(customerId, { status = "resolved", assigneeId = null, productId = null } = {}) {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO tickets
        (ref, customer_id, assignee_id, product_id, subject, description, category, priority, status, channel,
         created_at, updated_at, resolved_at, response_due_at, resolve_due_at, resolution_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `TEST-APPROVE-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      customerId,
      assigneeId,
      productId,
      "Approval flow test",
      "Temporary ticket for approval tests.",
      "Other",
      "normal",
      status,
      "portal",
      now,
      now,
      status === "resolved" ? now : null,
      addHours(now, 8),
      addHours(now, 24),
      "Restarted the service and confirmed the fix.",
    );
  return Number(result.lastInsertRowid);
}

function deleteTicket(ticketId) {
  db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
}

test("customer can approve a resolved request", async () => {
  const customer = activeUser("customer");
  assert.ok(customer, "A seeded customer is required");

  const ticketId = createTicket(customer.id);
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/approve`,
      method: "POST",
      user: customer,
      params: { id: String(ticketId) },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ticket.status, "closed");
    assert.ok(response.body.ticket.approvedAt, "approvedAt should be recorded");
    assert.equal(response.body.ticket.permissions.canApprove, false);

    const activity = db
      .prepare("SELECT type FROM activity WHERE ticket_id = ? AND type = 'approved'")
      .get(ticketId);
    assert.ok(activity, "Approval activity should be logged");
  } finally {
    deleteTicket(ticketId);
  }
});

test("customer cannot approve a request that is not resolved", async () => {
  const customer = activeUser("customer");
  assert.ok(customer, "A seeded customer is required");

  const ticketId = createTicket(customer.id, { status: "in_progress" });
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/approve`,
      method: "POST",
      user: customer,
      params: { id: String(ticketId) },
    });

    assert.equal(response.status, 409);
    assert.match(response.body.error, /isn't awaiting your approval/i);
  } finally {
    deleteTicket(ticketId);
  }
});

test("IT support cannot approve on the customer's behalf", async () => {
  const customer = activeUser("customer");
  const agent = activeUser("it");
  assert.ok(customer && agent, "Seeded customer and IT users are required");

  const ticketId = createTicket(customer.id);
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/approve`,
      method: "POST",
      user: agent,
      params: { id: String(ticketId) },
    });

    assert.equal(response.status, 403);
  } finally {
    deleteTicket(ticketId);
  }
});

test("customer can reject a resolved request and reopen it", async () => {
  const customer = activeUser("customer");
  assert.ok(customer, "A seeded customer is required");

  const ticketId = createTicket(customer.id);
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/reject`,
      method: "POST",
      user: customer,
      params: { id: String(ticketId) },
      body: { reason: "The export still fails at 60%." },
    });

    assert.equal(response.status, 200);
    assert.ok(["open", "in_progress"].includes(response.body.ticket.status));
    assert.ok(response.body.ticket.rejectedAt, "rejectedAt should be recorded");
    assert.equal(response.body.ticket.rejectionReason, "The export still fails at 60%.");
    assert.equal(response.body.ticket.resolvedAt, null);
    assert.equal(response.body.ticket.permissions.canApprove, false);
    assert.equal(response.body.ticket.permissions.canReject, false);

    const activity = db
      .prepare("SELECT note FROM activity WHERE ticket_id = ? AND type = 'rejected'")
      .get(ticketId);
    assert.ok(activity, "Rejection activity should be logged");
    assert.equal(activity.note, "The export still fails at 60%.");
  } finally {
    deleteTicket(ticketId);
  }
});

test("a rejection requires a reason", async () => {
  const customer = activeUser("customer");
  assert.ok(customer, "A seeded customer is required");

  const ticketId = createTicket(customer.id);
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/reject`,
      method: "POST",
      user: customer,
      params: { id: String(ticketId) },
      body: { reason: "  " },
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /what still needs fixing/i);
  } finally {
    deleteTicket(ticketId);
  }
});

test("IT support cannot reject on the customer's behalf", async () => {
  const customer = activeUser("customer");
  const agent = activeUser("it");
  assert.ok(customer && agent, "Seeded customer and IT users are required");

  const ticketId = createTicket(customer.id);
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/reject`,
      method: "POST",
      user: agent,
      params: { id: String(ticketId) },
      body: { reason: "Trying to reject as staff." },
    });

    assert.equal(response.status, 403);
  } finally {
    deleteTicket(ticketId);
  }
});

test("assigned IT agent can request admin help", async () => {
  const customer = activeUser("customer");
  const agent = activeUser("it");
  assert.ok(customer && agent, "Seeded customer and IT users are required");

  const ticketId = createTicket(customer.id, { status: "in_progress", assigneeId: agent.id });
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/request-admin`,
      method: "POST",
      user: agent,
      params: { id: String(ticketId) },
      body: { reason: "Customer wants an exception that needs admin approval." },
    });

    assert.equal(response.status, 200);
    assert.ok(response.body.ticket.adminHelpRequestedAt);
    assert.equal(response.body.ticket.adminHelpReason, "Customer wants an exception that needs admin approval.");
    assert.equal(response.body.ticket.permissions.canRequestAdminHelp, false);

    const activity = db
      .prepare("SELECT note FROM activity WHERE ticket_id = ? AND type = 'admin_help'")
      .get(ticketId);
    assert.ok(activity, "Admin help activity should be logged");
    assert.equal(activity.note, "Customer wants an exception that needs admin approval.");
  } finally {
    deleteTicket(ticketId);
  }
});

test("admin help requires a reason", async () => {
  const customer = activeUser("customer");
  const agent = activeUser("it");
  assert.ok(customer && agent, "Seeded customer and IT users are required");

  const ticketId = createTicket(customer.id, { status: "in_progress", assigneeId: agent.id });
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/request-admin`,
      method: "POST",
      user: agent,
      params: { id: String(ticketId) },
      body: { reason: " " },
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /what you need help with/i);
  } finally {
    deleteTicket(ticketId);
  }
});

test("another IT agent cannot request admin help on someone else's ticket", async () => {
  const customer = activeUser("customer");
  const agents = db.prepare("SELECT * FROM users WHERE role = 'it' AND active = 1 ORDER BY id LIMIT 2").all();
  assert.ok(customer && agents.length >= 2, "Two seeded IT users are required");

  const ticketId = createTicket(customer.id, { status: "in_progress", assigneeId: agents[0].id });
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/request-admin`,
      method: "POST",
      user: agents[1],
      params: { id: String(ticketId) },
      body: { reason: "I want to help but this is not my ticket." },
    });

    assert.equal(response.status, 403);
  } finally {
    deleteTicket(ticketId);
  }
});

test("an admin reply clears the help request and is marked as an admin message", async () => {
  const customer = activeUser("customer");
  const agent = activeUser("it");
  const admin = activeUser("admin");
  assert.ok(customer && agent && admin, "Seeded customer, IT and admin users are required");

  const ticketId = createTicket(customer.id, { status: "in_progress", assigneeId: agent.id });
  try {
    const help = await runRoute({
      url: `/tickets/${ticketId}/request-admin`,
      method: "POST",
      user: agent,
      params: { id: String(ticketId) },
      body: { reason: "Need approval for a policy exception." },
    });
    assert.equal(help.status, 200);

    const reply = await runRoute({
      url: `/tickets/${ticketId}/messages`,
      method: "POST",
      user: admin,
      params: { id: String(ticketId) },
      body: { body: "I've reviewed this and approved the exception.", isInternal: false },
    });

    assert.equal(reply.status, 201);
    assert.equal(reply.body.ticket.adminHelpRequestedAt, null);
    assert.equal(reply.body.ticket.adminHelpReason, null);

    const adminMessage = reply.body.ticket.messages.at(-1);
    assert.equal(adminMessage.senderRole, "admin");
    assert.equal(adminMessage.sender.id, admin.id);

    const joined = db
      .prepare("SELECT type FROM activity WHERE ticket_id = ? AND type = 'admin_joined'")
      .get(ticketId);
    assert.ok(joined, "Admin intervention activity should be logged");
  } finally {
    deleteTicket(ticketId);
  }
});

test("agent recent activity only includes actions performed by that agent", () => {
  const customer = activeUser("customer");
  const agent = activeUser("it");
  const admin = activeUser("admin");
  assert.ok(customer && agent && admin, "Seeded customer, IT and admin users are required");

  const ticketId = createTicket(customer.id, { status: "in_progress", assigneeId: agent.id });
  const marker = `SCOPE-${Date.now()}`;
  try {
    const insertActivity = db.prepare(
      "INSERT INTO activity (ticket_id, actor_id, type, note, created_at) VALUES (?, ?, 'test_note', ?, ?)",
    );
    insertActivity.run(ticketId, admin.id, `${marker}-OTHER`, new Date(Date.now() + 60_000).toISOString());
    insertActivity.run(ticketId, agent.id, `${marker}-OWN`, new Date(Date.now() + 120_000).toISOString());

    const labels = getAgentPerformance(agent.id).recentActivity.map((event) => event.label);
    assert.ok(labels.includes(`${marker}-OWN`), "The agent's own action should appear");
    assert.ok(!labels.includes(`${marker}-OTHER`), "Another user's action should not appear");
  } finally {
    deleteTicket(ticketId);
  }
});

test("agent product concerns only include that agent's assigned requests", () => {
  const customer = activeUser("customer");
  const agent = activeUser("it");
  const other = db
    .prepare("SELECT * FROM users WHERE role = 'it' AND active = 1 AND id <> ? ORDER BY id LIMIT 1")
    .get(agent.id);
  const product = db.prepare("SELECT id FROM products ORDER BY id LIMIT 1").get();
  assert.ok(customer && agent && other && product, "Seeded users and a product are required");

  const mine = createTicket(customer.id, { status: "in_progress", assigneeId: agent.id, productId: product.id });
  const theirs = createTicket(customer.id, { status: "in_progress", assigneeId: other.id, productId: product.id });
  try {
    const summary = getAgentPerformance(agent.id).products.find((item) => item.id === product.id);
    const expected = db
      .prepare("SELECT COUNT(*) AS count FROM tickets WHERE assignee_id = ? AND product_id = ?")
      .get(agent.id, product.id).count;

    assert.ok(summary, "The agent's product should be listed");
    assert.equal(summary.total, expected);

    const unscoped = db
      .prepare("SELECT COUNT(*) AS count FROM tickets WHERE product_id = ?")
      .get(product.id).count;
    assert.ok(unscoped > expected, "Another agent's request on the same product must not be counted");
  } finally {
    deleteTicket(mine);
    deleteTicket(theirs);
  }
});

test("resolving again clears the previous rejection", async () => {
  const customer = activeUser("customer");
  const admin = activeUser("admin");
  assert.ok(customer && admin, "Seeded customer and admin users are required");

  const ticketId = createTicket(customer.id);
  try {
    const rejected = await runRoute({
      url: `/tickets/${ticketId}/reject`,
      method: "POST",
      user: customer,
      params: { id: String(ticketId) },
      body: { reason: "Still broken after the restart." },
    });
    assert.equal(rejected.status, 200);

    const resolved = await runRoute({
      url: `/tickets/${ticketId}/status`,
      method: "PATCH",
      user: admin,
      params: { id: String(ticketId) },
      body: { status: "resolved", resolutionSummary: "Applied a fresh configuration and verified the export." },
    });

    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.ticket.status, "resolved");
    assert.equal(resolved.body.ticket.rejectedAt, null);
    assert.equal(resolved.body.ticket.rejectionReason, null);
  } finally {
    deleteTicket(ticketId);
  }
});
