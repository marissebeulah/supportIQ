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
      `TEST-COHELPER-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      customerId,
      assigneeId,
      "Co-helper flow test",
      "Temporary ticket for co-helper tests.",
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

test("admin can add and clear a second assignee", async () => {
  const customer = customerUser();
  const admin = adminUser();
  const [first, second] = itUsers();
  assert.ok(customer && admin && first && second, "Seeded users are required");

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
    assert.equal(added.body.ticket.coAssignee.id, second.id);
    assert.equal(added.body.ticket.permissions.canRemoveCoHelper, true);

    const notified = db
      .prepare("SELECT 1 FROM notifications WHERE user_id = ? AND ticket_id = ? AND type = 'co_helper_added'")
      .get(second.id, ticketId);
    assert.ok(notified, "The co-helper should be notified");

    const cleared = await runRoute({
      url: `/tickets/${ticketId}/co-assignee`,
      method: "PATCH",
      user: admin,
      params: { id: String(ticketId) },
      body: { coAssigneeId: null },
    });

    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.ticket.coAssignee, null);
  } finally {
    cleanup(ticketId);
  }
});

test("admin cannot make the assignee their own co-helper", async () => {
  const customer = customerUser();
  const admin = adminUser();
  const [first] = itUsers();
  assert.ok(customer && admin && first);

  const ticketId = createTicket(customer.id, first.id);
  try {
    const response = await runRoute({
      url: `/tickets/${ticketId}/co-assignee`,
      method: "PATCH",
      user: admin,
      params: { id: String(ticketId) },
      body: { coAssigneeId: first.id },
    });

    assert.equal(response.status, 400);
  } finally {
    cleanup(ticketId);
  }
});

test("assigned technician asks a teammate, who accepts and gains access", async () => {
  const customer = customerUser();
  const [first, second] = itUsers();
  assert.ok(customer && first && second);

  const ticketId = createTicket(customer.id, first.id);
  try {
    const asked = await runRoute({
      url: `/tickets/${ticketId}/co-helper`,
      method: "POST",
      user: first,
      params: { id: String(ticketId) },
      body: { targetId: second.id, note: "Customer's VPN drops during the export." },
    });

    assert.equal(asked.status, 200);
    const request = asked.body.ticket.coHelperRequest;
    assert.ok(request, "The pending request should be visible to the requester");
    assert.equal(request.target.id, second.id);
    assert.equal(request.canCancel, true);

    const invited = await runRoute({
      url: `/tickets/${ticketId}`,
      method: "GET",
      user: second,
      params: { id: String(ticketId) },
    });
    assert.equal(invited.status, 200, "The invited technician can open the ticket");
    assert.equal(invited.body.ticket.coHelperRequest.canRespond, true);

    const accepted = await runRoute({
      url: `/co-helper-requests/${request.id}/accept`,
      method: "POST",
      user: second,
      params: { id: String(request.id) },
    });

    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.ticket.coAssignee.id, second.id);
    assert.equal(accepted.body.ticket.coHelperRequest, null);

    const row = db.prepare("SELECT co_assignee_id FROM tickets WHERE id = ?").get(ticketId);
    assert.equal(row.co_assignee_id, second.id);

    const acceptedNote = db
      .prepare("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'co_helper_accepted'")
      .get(first.id);
    assert.ok(acceptedNote, "The requester should be told the co-helper accepted");

    const reply = await runRoute({
      url: `/tickets/${ticketId}/messages`,
      method: "POST",
      user: second,
      params: { id: String(ticketId) },
      body: { body: "I'll take a look at the VPN profile with you." },
    });
    assert.ok([200, 201].includes(reply.status), "The co-helper can reply to the customer");
  } finally {
    cleanup(ticketId);
  }
});

test("the assigned technician can remove a co-helper, but not add one", async () => {
  const customer = customerUser();
  const admin = adminUser();
  const itMembers = itUsers();
  assert.ok(customer && admin && itMembers.length >= 3);
  const [first, second, third] = itMembers;

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

    const directAdd = await runRoute({
      url: `/tickets/${ticketId}/co-assignee`,
      method: "PATCH",
      user: first,
      params: { id: String(ticketId) },
      body: { coAssigneeId: third.id },
    });
    assert.equal(directAdd.status, 403, "Only an admin can add a co-helper directly");

    const outsiderClear = await runRoute({
      url: `/tickets/${ticketId}/co-assignee`,
      method: "PATCH",
      user: third,
      params: { id: String(ticketId) },
      body: { coAssigneeId: null },
    });
    assert.equal(outsiderClear.status, 403, "Another technician can't clear the co-helper");

    const removed = await runRoute({
      url: `/tickets/${ticketId}/co-assignee`,
      method: "PATCH",
      user: first,
      params: { id: String(ticketId) },
      body: { coAssigneeId: null },
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.ticket.coAssignee, null);
    assert.equal(removed.body.ticket.permissions.canRemoveCoHelper, false);
  } finally {
    cleanup(ticketId);
  }
});

test("only the invited technician can accept a targeted request", async () => {
  const customer = customerUser();
  const itMembers = itUsers();
  assert.ok(customer && itMembers.length >= 3);
  const [first, second, third] = itMembers;

  const ticketId = createTicket(customer.id, first.id);
  try {
    const asked = await runRoute({
      url: `/tickets/${ticketId}/co-helper`,
      method: "POST",
      user: first,
      params: { id: String(ticketId) },
      body: { targetId: second.id },
    });
    assert.equal(asked.status, 200);
    const requestId = asked.body.ticket.coHelperRequest.id;

    const wrongTech = await runRoute({
      url: `/co-helper-requests/${requestId}/accept`,
      method: "POST",
      user: third,
      params: { id: String(requestId) },
    });
    assert.equal(wrongTech.status, 403);

    const requester = await runRoute({
      url: `/co-helper-requests/${requestId}/accept`,
      method: "POST",
      user: first,
      params: { id: String(requestId) },
    });
    assert.equal(requester.status, 403);
  } finally {
    cleanup(ticketId);
  }
});

test("a broadcast request can be declined by one technician and accepted by another", async () => {
  const customer = customerUser();
  const [first, second, third] = itUsers();
  assert.ok(customer && first && second);

  const ticketId = createTicket(customer.id, first.id);
  try {
    const asked = await runRoute({
      url: `/tickets/${ticketId}/co-helper`,
      method: "POST",
      user: first,
      params: { id: String(ticketId) },
      body: {},
    });
    assert.equal(asked.status, 200);
    const requestId = asked.body.ticket.coHelperRequest.id;

    const declined = await runRoute({
      url: `/co-helper-requests/${requestId}/decline`,
      method: "POST",
      user: second,
      params: { id: String(requestId) },
    });
    assert.equal(declined.status, 200);
    assert.equal(declined.body.requestOpen, true, "The broadcast request stays open");

    const accepted = await runRoute({
      url: `/co-helper-requests/${requestId}/accept`,
      method: "POST",
      user: third ?? second,
      params: { id: String(requestId) },
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.ticket.coAssignee.id, (third ?? second).id);
  } finally {
    cleanup(ticketId);
  }
});
