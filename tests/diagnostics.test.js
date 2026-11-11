import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";
import diagnosticsRouter from "../server/routes/diagnostics.routes.js";
import agentRouter, { AGENT_VERSION } from "../server/routes/agent.routes.js";
import { db } from "../server/db.js";

function runRoute({ router, url, method = "GET", user, headers = {}, body = {} }) {
  return new Promise((resolve) => {
    let finished = false;
    const done = (status, payload) => {
      if (finished) return;
      finished = true;
      resolve({ status, body: payload });
    };

    const req = {
      user,
      query: {},
      params: {},
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
        done(this.statusCode, payload);
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(payload = null) {
        this.body = payload;
        done(this.statusCode, this.body);
        return this;
      },
    };

    router.handle(req, res, (error) => {
      if (error) done(500, { error: error.message });
      else done(res.statusCode, res.body);
    });
  });
}

function customerUsers(count) {
  return db
    .prepare("SELECT * FROM users WHERE role = 'customer' AND active = 1 ORDER BY id LIMIT ?")
    .all(count);
}

function staffUser() {
  return db.prepare("SELECT * FROM users WHERE role = 'it' AND active = 1 ORDER BY id LIMIT 1").get();
}

async function pairDevice(customer, deviceName) {
  const code = await runRoute({
    router: agentRouter,
    url: "/pairing-codes",
    method: "POST",
    user: customer,
  });
  assert.equal(code.status, 201);
  const paired = await runRoute({
    router: agentRouter,
    url: "/pair",
    method: "POST",
    body: { code: code.body.code, deviceName, platform: "windows", agentVersion: "1.0.5" },
  });
  assert.equal(paired.status, 201);
  return { ...paired.body, pairingId: code.body.pairingId };
}

test("agent: server-info gives a paired PC the address to type in", async () => {
  const [customer] = customerUsers(1);

  const anonymous = await runRoute({ router: agentRouter, url: "/server-info" });
  assert.equal(anonymous.status, 401);

  const info = await runRoute({
    router: agentRouter,
    url: "/server-info",
    user: customer,
    headers: { host: "192.168.1.27:3001" },
  });
  assert.equal(info.status, 200);
  assert.equal(info.body.version, AGENT_VERSION);
  assert.equal(info.body.serverUrl, process.env.PUBLIC_AGENT_SERVER || "http://192.168.1.27:3001");

  const expectedFallback =
    process.env.PUBLIC_AGENT_SERVER_FALLBACK ||
    `http://${os.hostname()}:${process.env.PORT || 3001}`;
  assert.equal(info.body.fallbackServerUrl, expectedFallback);
  assert.equal(typeof info.body.downloadAvailable, "boolean");
});

test("diagnostics: connection snapshot for customers and staff", async (t) => {
  const [first, second] = customerUsers(2);
  assert.ok(first && second, "seed needs two active customers");
  const staff = staffUser();

  const suffix = Date.now().toString(36);
  const firstName = `Diagnostics PC ${suffix}`;
  const secondName = `Other customer PC ${suffix}`;

  const mine = await pairDevice(first, firstName);
  const theirs = await pairDevice(second, secondName);

  t.after(() => {
    for (const paired of [mine, theirs]) {
      db.prepare("DELETE FROM agent_devices WHERE id = ?").run(paired.device.id);
      db.prepare("DELETE FROM agent_pairing_codes WHERE id = ?").run(paired.pairingId);
    }
  });

  const asCustomer = await runRoute({ router: diagnosticsRouter, url: "/", user: first });
  assert.equal(asCustomer.status, 200);
  assert.equal(asCustomer.body.server.hostname, os.hostname());
  assert.equal(asCustomer.body.persistence.ok, true);
  assert.equal(asCustomer.body.agent.version, AGENT_VERSION);
  assert.ok(asCustomer.body.agent.serverUrl.startsWith("http://"));

  const ownNames = asCustomer.body.devices.map((device) => device.name);
  assert.ok(ownNames.includes(firstName));
  assert.equal(ownNames.includes(secondName), false, "customers only see their own PCs");
  for (const device of asCustomer.body.devices) {
    assert.equal(device.owner, null);
    assert.ok(device.lastSeenAt, "a pairing means the PC checked in");
  }

  const asStaff = await runRoute({ router: diagnosticsRouter, url: "/", user: staff });
  assert.equal(asStaff.status, 200);
  const staffNames = asStaff.body.devices.map((device) => device.name);
  assert.ok(staffNames.includes(firstName) && staffNames.includes(secondName));
  const other = asStaff.body.devices.find((device) => device.name === secondName);
  assert.equal(other.owner.email, second.email);
  assert.equal(other.agentVersion, "1.0.5");

  const anonymous = await runRoute({ router: diagnosticsRouter, url: "/" });
  assert.equal(anonymous.status, 401);

  // The endpoint must never leak device tokens.
  assert.equal(JSON.stringify(asStaff.body).includes(theirs.token), false);
});

