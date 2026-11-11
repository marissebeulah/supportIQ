import assert from "node:assert/strict";
import test from "node:test";
import reportsRouter from "../server/routes/reports.routes.js";
import { getAgentPerformance } from "../server/metrics.js";

function mockRequest({ user, query = {}, params = {}, url = "/" }) {
  return {
    user,
    query,
    params,
    url,
    method: "GET",
    headers: {},
  };
}

function runRoute(url, user, query = {}, params = {}) {
  return new Promise((resolve) => {
    let finished = false;
    const done = (status, body) => {
      if (!finished) {
        finished = true;
        resolve({ status, body });
      }
    };

    const req = mockRequest({ user, query, params, url });
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        done(this.statusCode, data);
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
        return this;
      },
    };

    reportsRouter.handle(req, res, (err) => {
      if (err) done(500, { error: err.message });
      else done(res.statusCode, res.body);
    });
  });
}

test("metrics: getAgentPerformance computes agent-specific metrics", () => {
  const agentPerf = getAgentPerformance(2); // Alex Rivera
  assert.ok(agentPerf, "Agent performance record should exist for agent 2");
  assert.equal(agentPerf.agent.id, 2);
  assert.equal(agentPerf.agent.name, "Alex Rivera");
  assert.ok(typeof agentPerf.stats.openAssigned === "number");
  assert.ok(typeof agentPerf.stats.resolved30d === "number");
  assert.ok(Array.isArray(agentPerf.feedback));
  assert.ok(Array.isArray(agentPerf.volume));
  assert.ok(Array.isArray(agentPerf.categories));
  assert.ok(Array.isArray(agentPerf.products));
  assert.ok(agentPerf.statusBreakdown);
});

test("permission: Customer has NO access to dashboard and reports", async () => {
  const customer = { id: 5, name: "Maya Chen", role: "customer" };

  const res1 = await runRoute("/dashboard", customer);
  assert.equal(res1.status, 403);
  assert.match(res1.body.error, /Customers do not have permission/i);
  assert.equal(res1.body.access, "No");

  const res2 = await runRoute("/performance", customer);
  assert.equal(res2.status, 403);
  assert.match(res2.body.error, /Customers do not have permission/i);

  const res3 = await runRoute("/overview", customer);
  assert.equal(res3.status, 403);

  const res4 = await runRoute("/agents", customer);
  assert.equal(res4.status, 403);
});

test("permission: IT Support Agent can view OWN performance only", async () => {
  const itAgent = { id: 2, name: "Alex Rivera", role: "it" };

  // 1. Can view own dashboard
  const ownDashboard = await runRoute("/dashboard", itAgent);
  assert.equal(ownDashboard.status, 200);
  assert.equal(ownDashboard.body.scope, "own_performance");
  assert.equal(ownDashboard.body.agent.id, 2);
  assert.equal(ownDashboard.body.agent.name, "Alex Rivera");

  // 2. Can view own performance endpoint
  const ownPerf = await runRoute("/performance", itAgent);
  assert.equal(ownPerf.status, 200);
  assert.equal(ownPerf.body.agent.id, 2);

  // 3. CANNOT view another agent's performance via query param
  const otherAgentQuery = await runRoute("/dashboard", itAgent, { agentId: "3" });
  assert.equal(otherAgentQuery.status, 403);
  assert.match(otherAgentQuery.body.error, /Support agents can only view their own performance/i);
  assert.equal(otherAgentQuery.body.access, "Own performance");

  // 4. CANNOT view another agent's performance via /agent/:id
  const otherAgentParam = await runRoute("/agent/3", itAgent, {}, { id: "3" });
  assert.equal(otherAgentParam.status, 403);
  assert.match(otherAgentParam.body.error, /Support agents can only view their own performance/i);

  // 5. CANNOT view organization-wide overview
  const orgOverview = await runRoute("/overview", itAgent);
  assert.equal(orgOverview.status, 403);
  assert.match(orgOverview.body.error, /Support agents cannot view organization-wide/i);

  // 6. CANNOT view team agents comparison list
  const teamList = await runRoute("/agents", itAgent);
  assert.equal(teamList.status, 403);
  assert.match(teamList.body.error, /Support agents cannot view team-wide/i);
});

test("permission: Admin can view ALL dashboard and reports", async () => {
  const admin = { id: 1, name: "Jordan Blake", role: "admin" };

  // 1. Can view full dashboard (all)
  const allDashboard = await runRoute("/dashboard", admin);
  assert.equal(allDashboard.status, 200);
  assert.equal(allDashboard.body.scope, "all");
  assert.ok(allDashboard.body.stats);
  assert.ok(allDashboard.body.agents);
  assert.ok(allDashboard.body.products);

  // 2. Can view specific agent's performance report via query param
  const agentQuery = await runRoute("/dashboard", admin, { agentId: "2" });
  assert.equal(agentQuery.status, 200);
  assert.equal(agentQuery.body.scope, "agent_performance");
  assert.equal(agentQuery.body.agent.id, 2);
  assert.equal(agentQuery.body.agent.name, "Alex Rivera");

  // 3. Can view specific agent via /agent/:id
  const agentRoute = await runRoute("/agent/2", admin, {}, { id: "2" });
  assert.equal(agentRoute.status, 200);
  assert.equal(agentRoute.body.agent.id, 2);

  // 4. Can view organization overview
  const overview = await runRoute("/overview", admin);
  assert.equal(overview.status, 200);
  assert.ok(overview.body.stats);

  // 5. Can view team agents comparison list
  const team = await runRoute("/agents", admin);
  assert.equal(team.status, 200);
  assert.ok(Array.isArray(team.body.agents));
});
