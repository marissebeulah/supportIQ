import assert from "node:assert/strict";
import test from "node:test";
import ticketRouter from "../server/routes/ticket.routes.js";
import { addHours, db, nowIso } from "../server/db.js";

function runRoute({ url, method, user, params = {}, body = {} }) {
  return new Promise((resolve) => {
    let finished = false;
    const done = (status, payload) => {
      if (!finished) {
        finished = true;
        resolve({ status, body: payload });
      }
    };

    const req = { user, query: {}, params, url, method, headers: {}, body };

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

const itUsers = () =>
  db.prepare("SELECT * FROM users WHERE role = 'it' AND active = 1 ORDER BY id").all();
const adminUser = () => db.prepare("SELECT * FROM users WHERE role = 'admin' AND active = 1 LIMIT 1").get();
const customerUser = () => db.prepare("SELECT * FROM users WHERE role = 'customer' AND active = 1 LIMIT 1").get();

function createTicket(customerId, assigneeId) {
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO tickets
        (ref, customer_id, assignee_id, subject, description, category, priority, status, channel,
         created_at, updated_at, response_due_at, resolve_due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `TEST-NOTIFY-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      customerId,
      assigneeId,
      "Notification flow test",
      "Temporary ticket for notification tests.",
      "Other",
      "normal",
      "in_progress",
      "portal",
      now,
      now,
      addHours(now, 8),
      addHours(now, 24),
    );
  return Number(info.lastInsertRowid);
}

function cleanup(ticketId) {
  db.prepare("DELETE FROM notifications WHERE ticket_id = ?").run(ticketId);
  db.prepare("DELETE FROM co_helper_requests WHERE ticket_id = ?").run(ticketId);
  db.prepare("DELETE FROM activity WHERE ticket_id = ?").run(ticketId);
  db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
}

function notificationFor(userId, ticketId, type) {
  return db
    .prepare("SELECT * FROM notifications WHERE user_id = ? AND ticket_id = ? AND type = ?")
    .get(userId, ticketId, type);
}

test("assigning a request notifies the technician", async () => {
  const customer = customerUser();
  const admin = adminUser();
  const [first] = itUsers();
  assert.ok(customer && admin && first, "Seeded users are required");

  const ticketId = createTicket(customer.id, null);
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/assign`,
      method: "PATCH",
      user: admin,
      params: { id: String(ticketId) },
      body: { assigneeId: first.id },
    });
    assert.equal(response.status, 200);

    const notification = notificationFor(first.id, ticketId, "ticket_assigned");
    assert.ok(notification, "The new assignee should get an inbox notification");
    assert.match(notification.body, /Notification flow test/);
  } finally {
    cleanup(ticketId);
  }
});

test("a customer reply notifies the assigned technician and co-helper", async () => {
  const customer = customerUser();
  const admin = adminUser();
  const [first, second] = itUsers();
  assert.ok(customer && admin && first && second);

  const ticketId = createTicket(customer.id, first.id);
  try {
    const added = await runRoute({
      url: `/tickets/${ticketId}/co-assignee`,
      method: "PATCH",
      user: admin,
      params: { id: String(ticketId) },
      body: { coAssigneeId: second.id },
    });
    assert.equal(added.status, 200);

    const reply = await runRoute({
      url: `/tickets/${ticketId}/messages`,
      method: "POST",
      user: customer,
      params: { id: String(ticketId) },
      body: { body: "The printer is still offline after the restart." },
    });
    assert.ok([200, 201].includes(reply.status));

    for (const staff of [first, second]) {
      const notification = notificationFor(staff.id, ticketId, "ticket_reply");
      assert.ok(notification, `Technician ${staff.name} should be notified`);
      assert.match(notification.body, /printer is still offline/);
    }
  } finally {
    cleanup(ticketId);
  }
});

test("an IT reply notifies the customer, but an internal note does not", async () => {
  const customer = customerUser();
  const [first] = itUsers();
  assert.ok(customer && first);

  const ticketId = createTicket(customer.id, first.id);
  try {
    const internal = await runRoute({
      url: `/tickets/${ticketId}/messages`,
      method: "POST",
      user: first,
      params: { id: String(ticketId) },
      body: { body: "Internal note: waiting on the vendor.", isInternal: true },
    });
    assert.equal(internal.status, 201);
    assert.equal(
      notificationFor(customer.id, ticketId, "ticket_reply"),
      undefined,
      "Internal notes must not reach the customer",
    );

    const reply = await runRoute({
      url: `/tickets/${ticketId}/messages`,
      method: "POST",
      user: first,
      params: { id: String(ticketId) },
      body: { body: "We restarted the print spooler for you." },
    });
    assert.equal(reply.status, 201);

    const notification = notificationFor(customer.id, ticketId, "ticket_reply");
    assert.ok(notification, "The customer should be told IT replied");
    assert.match(notification.body, /print spooler/);
  } finally {
    cleanup(ticketId);
  }
});

test("resolving a request notifies the customer and approval notifies staff", async () => {
  const customer = customerUser();
  const admin = adminUser();
  const [first] = itUsers();
  assert.ok(customer && admin && first);

  const ticketId = createTicket(customer.id, first.id);
  try {
    const resolved = await runRoute({
      url: `/tickets/${ticketId}/status`,
      method: "PATCH",
      user: first,
      params: { id: String(ticketId) },
      body: { status: "resolved", resolutionSummary: "Print spooler restarted." },
    });
    assert.equal(resolved.status, 200);

    const resolvedNote = notificationFor(customer.id, ticketId, "ticket_status");
    assert.ok(resolvedNote, "The customer should hear the resolution is ready");
    assert.equal(resolvedNote.title, "Resolution ready to review");

    const approved = await runRoute({
      url: `/tickets/${ticketId}/approve`,
      method: "POST",
      user: customer,
      params: { id: String(ticketId) },
    });
    assert.equal(approved.status, 200);

    assert.ok(notificationFor(first.id, ticketId, "resolution_approved"));
    assert.ok(notificationFor(admin.id, ticketId, "resolution_approved"));

    const reopened = await runRoute({
      url: `/tickets/${ticketId}/reject`,
      method: "POST",
      user: customer,
      params: { id: String(ticketId) },
      body: { reason: "The printer is offline again." },
    });
    assert.equal(reopened.status, 409, "An approved resolution can no longer be rejected");
  } finally {
    cleanup(ticketId);
  }
});

test("admin help requests land in the admins' notifications", async () => {
  const customer = customerUser();
  const admin = adminUser();
  const [first] = itUsers();
  assert.ok(customer && admin && first);

  const ticketId = createTicket(customer.id, first.id);
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/request-admin`,
      method: "POST",
      user: first,
      params: { id: String(ticketId) },
      body: { reason: "The customer needs a refund approval." },
    });
    assert.equal(response.status, 200);

    const notification = notificationFor(admin.id, ticketId, "admin_help");
    assert.ok(notification, "Admins should get an inbox notification");
    assert.match(notification.body, /refund approval/);
  } finally {
    cleanup(ticketId);
  }
});
