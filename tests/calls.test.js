import assert from "node:assert/strict";
import test from "node:test";
import callRouter from "../server/routes/calls.routes.js";
import { db, nowIso } from "../server/db.js";
import { addClient, removeClient } from "../server/realtime.js";

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

    callRouter.handle(req, res, (error) => {
      if (error) done(500, { error: error.message });
      else done(res.statusCode, res.body);
    });
  });
}

function userByRole(role, excludeId = null) {
  if (excludeId) {
    return db
      .prepare("SELECT * FROM users WHERE role = ? AND active = 1 AND id != ? ORDER BY id LIMIT 1")
      .get(role, excludeId);
  }
  return db.prepare("SELECT * FROM users WHERE role = ? AND active = 1 ORDER BY id LIMIT 1").get(role);
}

function createTicket(customerId, assigneeId) {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO tickets
        (ref, customer_id, assignee_id, subject, description, category, priority, status, channel,
         created_at, updated_at, response_due_at, resolve_due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `TEST-CALL-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      customerId,
      assigneeId,
      "Call test request",
      "Testing voice and video calls.",
      "Technical issue",
      "normal",
      "open",
      "portal",
      now,
      now,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

test("call lifecycle: ring, accept, signal, history, end", async () => {
  const customer = userByRole("customer");
  const agent = userByRole("it");
  const otherAgent = userByRole("it", agent.id);
  const ticketId = createTicket(customer.id, agent.id);

  // Simulate the callee having an open realtime stream.
  const onlineClient = addClient(agent, { write() {} });

  try {
    const created = await runRoute({
      url: "/calls",
      method: "POST",
      user: customer,
      body: { ticketId, kind: "video" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.call.status, "ringing");
    assert.equal(created.body.call.caller.id, customer.id);
    assert.equal(created.body.call.callee.id, agent.id);
    const callId = created.body.call.id;

    const wrongAgent = await runRoute({
      url: `/calls/${callId}/accept`,
      method: "POST",
      user: otherAgent,
    });
    assert.equal(wrongAgent.status, 403);

    const accepted = await runRoute({
      url: `/calls/${callId}/accept`,
      method: "POST",
      user: agent,
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.call.status, "active");
    assert.ok(accepted.body.call.answeredAt);

    const signal = await runRoute({
      url: `/calls/${callId}/signal`,
      method: "POST",
      user: customer,
      body: { type: "offer", payload: { type: "offer", sdp: "v=0 test" } },
    });
    assert.equal(signal.status, 200);
    assert.equal(signal.body.ok, true);

    const cameraState = await runRoute({
      url: `/calls/${callId}/signal`,
      method: "POST",
      user: customer,
      body: { type: "state", payload: { cameraOn: false } },
    });
    assert.equal(cameraState.status, 200);
    assert.equal(cameraState.body.ok, true);

    const history = await runRoute({
      url: `/calls/ticket/${ticketId}`,
      method: "GET",
      user: customer,
    });
    assert.equal(history.status, 200);
    assert.equal(history.body.calls.length, 1);
    assert.equal(history.body.calls[0].status, "active");

    const ended = await runRoute({
      url: `/calls/${callId}/end`,
      method: "POST",
      user: customer,
    });
    assert.equal(ended.status, 200);
    assert.equal(ended.body.call.status, "ended");
    assert.ok(ended.body.call.endedAt);
  } finally {
    removeClient(onlineClient);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
  }
});

test("a new call clears an orphaned ringing call on the same request", async () => {
  const customer = userByRole("customer");
  const agent = userByRole("it");
  const ticketId = createTicket(customer.id, agent.id);

  const stale = db
    .prepare(
      `INSERT INTO calls (ticket_id, caller_id, callee_id, kind, status, created_at)
       VALUES (?, ?, ?, 'audio', 'ringing', ?)`,
    )
    .run(ticketId, customer.id, agent.id, nowIso());
  const staleId = Number(stale.lastInsertRowid);

  const onlineClient = addClient(agent, { write() {} });
  try {
    const created = await runRoute({
      url: "/calls",
      method: "POST",
      user: customer,
      body: { ticketId, kind: "audio" },
    });
    assert.equal(created.status, 201);
    const old = db.prepare("SELECT status FROM calls WHERE id = ?").get(staleId);
    assert.equal(old.status, "ended");
  } finally {
    removeClient(onlineClient);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
  }
});

test("a customer cannot call an unassigned request", async () => {
  const customer = userByRole("customer");
  const ticketId = createTicket(customer.id, null);

  try {
    const created = await runRoute({
      url: "/calls",
      method: "POST",
      user: customer,
      body: { ticketId, kind: "audio" },
    });
    assert.equal(created.status, 400);
    assert.match(created.body.error, /No IT agent is assigned/i);
  } finally {
    db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
  }
});
