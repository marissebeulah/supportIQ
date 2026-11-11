import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";
import remoteRouter from "../server/routes/remote.routes.js";
import agentRouter from "../server/routes/agent.routes.js";
import { db, nowIso } from "../server/db.js";

function runRoute({ router = remoteRouter, url, method, user, headers = {}, params = {}, body = {} }) {
  return new Promise((resolve) => {
    let finished = false;
    const done = (status, payload, rawBody = null, responseHeaders = {}) => {
      if (finished) return;
      finished = true;
      resolve({ status, body: payload, rawBody, headers: responseHeaders });
    };

    const query = {};
    const queryIndex = url.indexOf("?");
    if (queryIndex !== -1) {
      for (const pair of url.slice(queryIndex + 1).split("&")) {
        const [key, value = ""] = pair.split("=");
        query[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }

    const req = {
      user,
      query,
      params,
      url,
      method,
      headers: { ...headers },
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
        done(this.statusCode, payload, null, this.headers);
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(payload = null) {
        this.body = typeof payload === "string" ? payload : this.body;
        done(this.statusCode, this.body, Buffer.isBuffer(payload) ? payload : null, this.headers);
        return this;
      },
    };

    router.handle(req, res, (error) => {
      if (error) done(500, { error: error.message });
      else done(res.statusCode, res.body, null, res.headers);
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
      `TEST-REMOTE-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      customerId,
      assigneeId,
      "Remote support test request",
      "Testing the native SupportIQ Agent remote flow.",
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

async function pairDevice(customer, deviceName) {
  const code = await runRoute({
    router: agentRouter,
    url: "/pairing-codes",
    method: "POST",
    user: customer,
  });
  assert.equal(code.status, 201);
  assert.match(code.body.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.ok(code.body.serverUrl);

  const paired = await runRoute({
    router: agentRouter,
    url: "/pair",
    method: "POST",
    body: { code: code.body.code, deviceName, platform: "windows", agentVersion: "1.0.0" },
  });
  assert.equal(paired.status, 201);
  assert.ok(paired.body.token);
  assert.ok(paired.body.device.id);
  return paired.body;
}

function agentHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

test("native agent: pairing, consent, live frames, input, and stop", async () => {
  const customer = userByRole("customer");
  const agent = userByRole("it");
  const otherAgent = userByRole("it", agent.id);
  const ticketId = createTicket(customer.id, agent.id);

  const paired = await pairDevice(customer, "Customer workstation");
  const token = paired.token;
  const deviceId = paired.device.id;

  // Customers can't open a remote session; only IT can ask.
  const refused = await runRoute({
    url: "/remote-sessions",
    method: "POST",
    user: customer,
    body: { ticketId },
  });
  assert.equal(refused.status, 403);

  const created = await runRoute({
    url: "/remote-sessions",
    method: "POST",
    user: agent,
    body: { ticketId },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.remoteSession.status, "requested");
  assert.equal(created.body.remoteSession.customerPaired, true);
  const sessionId = created.body.remoteSession.id;

  // Reusing the open request avoids double prompts.
  const reused = await runRoute({
    url: "/remote-sessions",
    method: "POST",
    user: agent,
    body: { ticketId },
  });
  assert.equal(reused.status, 200);
  assert.equal(reused.body.reused, true);
  assert.equal(reused.body.remoteSession.id, sessionId);

  // The paired agent sees the pending request on its long-poll.
  const pendingPoll = await runRoute({
    router: agentRouter,
    url: "/poll?wait=0",
    method: "GET",
    headers: agentHeaders(token),
  });
  assert.equal(pendingPoll.status, 200);
  assert.equal(pendingPoll.body.device.id, deviceId);
  // The poll hands the agent a stable address so it can recover after an IP change.
  const expectedFallback =
    (process.env.PUBLIC_AGENT_SERVER_FALLBACK ?? "").replace(/\/+$/, "") ||
    `http://${os.hostname()}:${Number(process.env.PORT) || 3001}`;
  assert.equal(pendingPoll.body.fallbackServerUrl, expectedFallback);
  const pending = pendingPoll.body.sessions.find((item) => item.id === sessionId);
  assert.equal(pending.status, "requested");
  assert.equal(pending.requestedBy.id, agent.id);

  // No screen frame exists before the customer allows the session.
  const earlyFrame = await runRoute({
    url: `/remote-sessions/${sessionId}/frame`,
    method: "GET",
    user: agent,
  });
  assert.equal(earlyFrame.status, 204);

  // The customer approves inside the agent.
  const answered = await runRoute({
    router: agentRouter,
    url: `/sessions/${sessionId}/answer`,
    method: "POST",
    headers: agentHeaders(token),
    body: { allow: true },
  });
  assert.equal(answered.status, 200);
  assert.equal(answered.body.allowed, true);
  assert.equal(answered.body.remoteSession.status, "active");
  assert.equal(answered.body.remoteSession.agent.id, deviceId);
  assert.ok(answered.body.remoteSession.startedAt);

  // The technician's browser can read the live screen frame.
  const jpeg = Buffer.alloc(512, 0x7f);
  const posted = await runRoute({
    router: agentRouter,
    url: `/sessions/${sessionId}/frame`,
    method: "POST",
    headers: {
      ...agentHeaders(token),
      "x-frame-width": "1280",
      "x-frame-height": "720",
      "x-frame-sequence": "7",
    },
    body: jpeg,
  });
  assert.equal(posted.status, 204);

  const frame = await runRoute({
    url: `/remote-sessions/${sessionId}/frame`,
    method: "GET",
    user: agent,
  });
  assert.equal(frame.status, 200);
  assert.equal(frame.headers["Content-Type"], "image/jpeg");
  assert.equal(frame.rawBody.length, jpeg.length);
  assert.ok(frame.rawBody.equals(jpeg));

  // Someone outside the session can't read it.
  const outsider = userByRole("customer", customer.id);
  const forbiddenFrame = await runRoute({
    url: `/remote-sessions/${sessionId}/frame`,
    method: "GET",
    user: outsider,
  });
  assert.equal(forbiddenFrame.status, 403);

  // Technician input is queued until the agent polls for it.
  const input = await runRoute({
    url: `/remote-sessions/${sessionId}/input`,
    method: "POST",
    user: agent,
    body: {
      events: [
        { t: "m", x: 0.5, y: 0.25 },
        { t: "md", b: 0 },
        { t: "mu", b: 0 },
        { t: "kd", k: "a", c: "KeyA" },
        { t: "ku", k: "a", c: "KeyA" },
      ],
    },
  });
  assert.equal(input.status, 202);
  assert.equal(input.body.queued, 5);

  const otherControl = await runRoute({
    url: `/remote-sessions/${sessionId}/input`,
    method: "POST",
    user: otherAgent,
    body: { events: [{ t: "m", x: 0.1, y: 0.1 }] },
  });
  assert.equal(otherControl.status, 403);

  const activePoll = await runRoute({
    router: agentRouter,
    url: `/poll?wait=0&sessionId=${sessionId}`,
    method: "GET",
    headers: agentHeaders(token),
  });
  assert.equal(activePoll.status, 200);
  assert.equal(activePoll.body.session.status, "active");
  assert.equal(activePoll.body.commands.length, 5);
  assert.deepEqual(activePoll.body.commands[0], { t: "m", x: 0.5, y: 0.25 });
  assert.deepEqual(activePoll.body.commands[2], { t: "mu", b: 0 });

  // Input is delivered exactly once.
  const drained = await runRoute({
    router: agentRouter,
    url: `/poll?wait=0&sessionId=${sessionId}`,
    method: "GET",
    headers: agentHeaders(token),
  });
  assert.equal(drained.body.commands.length, 0);

  const keepalive = await runRoute({
    url: `/remote-sessions/${sessionId}/keepalive`,
    method: "POST",
    user: agent,
  });
  assert.equal(keepalive.status, 204);

  // The customer can stop sharing from the agent; the session ends for both.
  const stopped = await runRoute({
    router: agentRouter,
    url: `/sessions/${sessionId}/stop`,
    method: "POST",
    headers: agentHeaders(token),
  });
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.remoteSession.status, "ended");
  assert.equal(stopped.body.remoteSession.endedReason, "stopped_by_customer");

  const afterStop = await runRoute({
    url: `/remote-sessions/${sessionId}/input`,
    method: "POST",
    user: agent,
    body: { events: [{ t: "m", x: 0.2, y: 0.2 }] },
  });
  assert.equal(afterStop.status, 409);

  const history = await runRoute({
    url: `/remote-sessions/ticket/${ticketId}`,
    method: "GET",
    user: customer,
  });
  assert.equal(history.status, 200);
  assert.equal(history.body.remoteSessions.length, 1);
  assert.equal(history.body.remoteSessions[0].status, "ended");
});

test("native agent: decline, expiry, and access boundaries", async () => {
  const customer = userByRole("customer");
  const otherCustomer = userByRole("customer", customer.id);
  const agent = userByRole("it");
  const otherAgent = userByRole("it", agent.id);
  const ticketId = createTicket(customer.id, agent.id);

  const paired = await pairDevice(customer, "Customer PC");
  const otherPaired = await pairDevice(otherCustomer, "Someone else's PC");

  const outsider = await runRoute({
    url: "/remote-sessions",
    method: "POST",
    user: otherAgent,
    body: { ticketId },
  });
  assert.equal(outsider.status, 403);

  const created = await runRoute({
    url: "/remote-sessions",
    method: "POST",
    user: agent,
    body: { ticketId },
  });
  assert.equal(created.status, 201);
  const firstId = created.body.remoteSession.id;

  // A device paired to a different customer can't answer this request.
  const strangerAnswer = await runRoute({
    router: agentRouter,
    url: `/sessions/${firstId}/answer`,
    method: "POST",
    headers: agentHeaders(otherPaired.token),
    body: { allow: true },
  });
  assert.equal(strangerAnswer.status, 403);

  // The customer can decline from the portal before answering in the agent.
  const declined = await runRoute({
    url: `/remote-sessions/${firstId}/decline`,
    method: "POST",
    user: customer,
  });
  assert.equal(declined.status, 200);
  assert.equal(declined.body.remoteSession.status, "declined");

  // Declining inside the agent also closes the request.
  const second = await runRoute({
    url: "/remote-sessions",
    method: "POST",
    user: agent,
    body: { ticketId },
  });
  assert.equal(second.status, 201);
  const secondId = second.body.remoteSession.id;
  const declinedInAgent = await runRoute({
    router: agentRouter,
    url: `/sessions/${secondId}/answer`,
    method: "POST",
    headers: agentHeaders(paired.token),
    body: { allow: false },
  });
  assert.equal(declinedInAgent.status, 200);
  assert.equal(declinedInAgent.body.remoteSession.status, "declined");
  assert.equal(declinedInAgent.body.allowed, false);

  // Unanswered requests expire.
  const third = await runRoute({
    url: "/remote-sessions",
    method: "POST",
    user: agent,
    body: { ticketId },
  });
  assert.equal(third.status, 201);
  const thirdId = third.body.remoteSession.id;
  db.prepare("UPDATE remote_sessions SET expires_at = ? WHERE id = ?").run(
    new Date(Date.now() - 60_000).toISOString(),
    thirdId,
  );

  const history = await runRoute({
    url: `/remote-sessions/ticket/${ticketId}`,
    method: "GET",
    user: agent,
  });
  assert.equal(history.status, 200);
  assert.equal(history.body.remoteSessions.find((item) => item.id === thirdId).status, "expired");

  // A revoked device loses access immediately.
  const revoked = await runRoute({
    router: agentRouter,
    url: "/device",
    method: "DELETE",
    headers: agentHeaders(paired.token),
  });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.ok, true);

  const afterRevoke = await runRoute({
    router: agentRouter,
    url: "/poll?wait=0",
    method: "GET",
    headers: agentHeaders(paired.token),
  });
  assert.equal(afterRevoke.status, 401);
});

test("unattended access: customer opt-in, password connect, and limits", async (t) => {
  const customer = userByRole("customer");
  const agent = userByRole("it");
  const otherAgent = userByRole("it", agent.id);
  const ticketId = createTicket(customer.id, agent.id);
  const password = "unattended-pass-42";

  t.after(() => {
    db.prepare("DELETE FROM remote_sessions WHERE ticket_id = ?").run(ticketId);
    db.prepare(
      "DELETE FROM agent_devices WHERE user_id = ? AND name IN ('Unattended PC', 'Rate limited PC')",
    ).run(customer.id);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
  });

  const paired = await pairDevice(customer, "Unattended PC");
  const deviceId = paired.device.id;

  // Only the owner can turn unattended access on, and it requires 8+ characters.
  const stranger = await runRoute({
    router: agentRouter,
    url: `/devices/${deviceId}/unattended`,
    method: "PUT",
    user: agent,
    params: { id: String(deviceId) },
    body: { enabled: true, password },
  });
  assert.equal(stranger.status, 404);

  const short = await runRoute({
    router: agentRouter,
    url: `/devices/${deviceId}/unattended`,
    method: "PUT",
    user: customer,
    params: { id: String(deviceId) },
    body: { enabled: true, password: "short" },
  });
  assert.equal(short.status, 400);

  const enabled = await runRoute({
    router: agentRouter,
    url: `/devices/${deviceId}/unattended`,
    method: "PUT",
    user: customer,
    params: { id: String(deviceId) },
    body: { enabled: true, password },
  });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.device.unattendedEnabled, true);
  assert.equal(Object.hasOwn(enabled.body.device, "unattendedPasswordHash"), false);

  const stored = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(deviceId);
  assert.ok(stored.unattended_password_hash);
  assert.notEqual(stored.unattended_password_hash, password);

  // IT sees the device (without secrets) when choosing a PC to connect to.
  const devices = await runRoute({
    url: `/remote-sessions/ticket/${ticketId}/devices`,
    method: "GET",
    user: agent,
  });
  assert.equal(devices.status, 200);
  const listed = devices.body.devices.find((item) => item.id === deviceId);
  assert.equal(listed.unattendedEnabled, true);
  assert.equal(Object.hasOwn(listed, "unattendedPasswordHash"), false);

  // A different IT user who can't access the ticket also can't connect.
  const outsider = await runRoute({
    url: "/remote-sessions/unattended",
    method: "POST",
    user: otherAgent,
    body: { ticketId, deviceId, password },
  });
  assert.equal(outsider.status, 403);

  const wrong = await runRoute({
    url: "/remote-sessions/unattended",
    method: "POST",
    user: agent,
    body: { ticketId, deviceId, password: "not-the-password" },
  });
  assert.equal(wrong.status, 401);

  const connected = await runRoute({
    url: "/remote-sessions/unattended",
    method: "POST",
    user: agent,
    body: { ticketId, deviceId, password },
  });
  assert.equal(connected.status, 201);
  assert.equal(connected.body.remoteSession.status, "active");
  assert.equal(connected.body.remoteSession.startedWith, "password");
  assert.equal(connected.body.remoteSession.agent.id, deviceId);
  assert.ok(connected.body.remoteSession.startedAt);
  const sessionId = connected.body.remoteSession.id;

  // The agent can read the session status, which lets a consent prompt auto-close.
  const status = await runRoute({
    router: agentRouter,
    url: `/sessions/${sessionId}`,
    method: "GET",
    headers: agentHeaders(paired.token),
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.session.status, "active");

  // Input still flows, and the customer can still stop the unattended session.
  const input = await runRoute({
    url: `/remote-sessions/${sessionId}/input`,
    method: "POST",
    user: agent,
    body: { events: [{ t: "m", x: 0.4, y: 0.6 }] },
  });
  assert.equal(input.status, 202);

  const stopped = await runRoute({
    router: agentRouter,
    url: `/sessions/${sessionId}/stop`,
    method: "POST",
    headers: agentHeaders(paired.token),
  });
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.remoteSession.status, "ended");

  // Turning it off revokes password access immediately.
  const disabled = await runRoute({
    router: agentRouter,
    url: `/devices/${deviceId}/unattended`,
    method: "PUT",
    user: customer,
    params: { id: String(deviceId) },
    body: { enabled: false },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.device.unattendedEnabled, false);

  const afterDisable = await runRoute({
    url: "/remote-sessions/unattended",
    method: "POST",
    user: agent,
    body: { ticketId, deviceId, password },
  });
  assert.equal(afterDisable.status, 409);

  // A password connect supersedes a pending Allow prompt instead of opening a second session.
  await runRoute({
    router: agentRouter,
    url: `/devices/${deviceId}/unattended`,
    method: "PUT",
    user: customer,
    params: { id: String(deviceId) },
    body: { enabled: true, password },
  });
  const requested = await runRoute({
    url: "/remote-sessions",
    method: "POST",
    user: agent,
    body: { ticketId },
  });
  assert.equal(requested.status, 201);
  assert.equal(requested.body.remoteSession.status, "requested");
  const pendingId = requested.body.remoteSession.id;

  const superseded = await runRoute({
    url: "/remote-sessions/unattended",
    method: "POST",
    user: agent,
    body: { ticketId, deviceId, password },
  });
  assert.equal(superseded.status, 200);
  assert.equal(superseded.body.remoteSession.id, pendingId);
  assert.equal(superseded.body.remoteSession.status, "active");
  assert.equal(superseded.body.remoteSession.startedWith, "password");

  // The prompt's status check now reports active, so the agent closes the stale dialog.
  const promptCheck = await runRoute({
    router: agentRouter,
    url: `/sessions/${pendingId}`,
    method: "GET",
    headers: agentHeaders(paired.token),
  });
  assert.equal(promptCheck.body.session.status, "active");

  // Repeated wrong passwords lock out attempts for a while on a fresh device.
  const limited = await pairDevice(customer, "Rate limited PC");
  await runRoute({
    router: agentRouter,
    url: `/devices/${limited.device.id}/unattended`,
    method: "PUT",
    user: customer,
    params: { id: String(limited.device.id) },
    body: { enabled: true, password },
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failure = await runRoute({
      url: "/remote-sessions/unattended",
      method: "POST",
      user: agent,
      body: { ticketId, deviceId: limited.device.id, password: "wrong-password" },
    });
    assert.equal(failure.status, 401);
  }
  const locked = await runRoute({
    url: "/remote-sessions/unattended",
    method: "POST",
    user: agent,
    body: { ticketId, deviceId: limited.device.id, password },
  });
  assert.equal(locked.status, 429);
});

test("unattended access: IT saves the connect-anytime password on a request", async (t) => {
  const customer = userByRole("customer");
  const agent = userByRole("it");
  const otherAgent = userByRole("it", agent.id);
  const ticketId = createTicket(customer.id, agent.id);
  const password = "connect-anytime-42";

  t.after(() => {
    db.prepare("DELETE FROM remote_sessions WHERE ticket_id = ?").run(ticketId);
    db.prepare(
      "DELETE FROM agent_devices WHERE user_id = ? AND name = 'Connect anytime PC'",
    ).run(customer.id);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
  });

  const paired = await pairDevice(customer, "Connect anytime PC");
  const deviceId = paired.device.id;
  const route = `/remote-sessions/ticket/${ticketId}/devices/${deviceId}/unattended`;

  // Another IT user can't reach the request, and the customer can't save it from here.
  const outsider = await runRoute({
    url: route,
    method: "PUT",
    user: otherAgent,
    params: { ticketId: String(ticketId), deviceId: String(deviceId) },
    body: { enabled: true, password },
  });
  assert.equal(outsider.status, 403);

  const customerAttempt = await runRoute({
    url: route,
    method: "PUT",
    user: customer,
    params: { ticketId: String(ticketId), deviceId: String(deviceId) },
    body: { enabled: true, password },
  });
  assert.equal(customerAttempt.status, 403);

  const tooShort = await runRoute({
    url: route,
    method: "PUT",
    user: agent,
    params: { ticketId: String(ticketId), deviceId: String(deviceId) },
    body: { enabled: true, password: "short" },
  });
  assert.equal(tooShort.status, 400);

  const saved = await runRoute({
    url: route,
    method: "PUT",
    user: agent,
    params: { ticketId: String(ticketId), deviceId: String(deviceId) },
    body: { enabled: true, password },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.device.unattendedEnabled, true);
  assert.equal(Object.hasOwn(saved.body.device, "unattendedPasswordHash"), false);

  const stored = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(deviceId);
  assert.ok(stored.unattended_password_hash);
  assert.notEqual(stored.unattended_password_hash, password);

  // The saved password starts a session without the customer clicking Allow.
  const connected = await runRoute({
    url: "/remote-sessions/unattended",
    method: "POST",
    user: agent,
    body: { ticketId, deviceId, password },
  });
  assert.equal(connected.status, 201);
  assert.equal(connected.body.remoteSession.status, "active");
  assert.equal(connected.body.remoteSession.startedWith, "password");
  assert.equal(connected.body.remoteSession.agent.id, deviceId);

  // IT can clear it again from the same request.
  const cleared = await runRoute({
    url: route,
    method: "PUT",
    user: agent,
    params: { ticketId: String(ticketId), deviceId: String(deviceId) },
    body: { enabled: false },
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.device.unattendedEnabled, false);
});
