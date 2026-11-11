import express from "express";
import { requireAuth } from "../auth.js";
import { getAgentPerformance, getOverview, getTeamPerformance } from "../metrics.js";

const router = express.Router();

// Require authenticated user
router.use(requireAuth);

// Customer has NO access to dashboard and reports
router.use((req, res, next) => {
  if (req.user.role === "customer") {
    return res.status(403).json({
      error: "Access denied. Customers do not have permission to view dashboard and reports.",
      permission: "View dashboard and reports",
      role: "customer",
      access: "No",
    });
  }
  next();
});

// GET /api/reports/dashboard
// - IT / Support Agent: Own Performance
// - Admin: All (or filtered by ?agentId)
router.get("/dashboard", (req, res) => {
  if (req.user.role === "it") {
    if (req.query.agentId && Number(req.query.agentId) !== req.user.id) {
      return res.status(403).json({
        error: "Access denied. Support agents can only view their own performance reports.",
        permission: "View dashboard and reports",
        role: "it",
        access: "Own performance",
      });
    }
    const report = getAgentPerformance(req.user.id);
    if (!report) return res.status(404).json({ error: "Agent performance record not found." });
    return res.json({
      scope: "own_performance",
      role: "it",
      ...report,
    });
  }

  // Admin has access to all
  if (req.query.agentId) {
    const targetId = Number(req.query.agentId);
    const report = getAgentPerformance(targetId);
    if (!report) return res.status(404).json({ error: "Agent not found." });
    return res.json({
      scope: "agent_performance",
      role: "admin",
      ...report,
    });
  }

  const overview = getOverview();
  return res.json({
    scope: "all",
    role: "admin",
    ...overview,
  });
});

// GET /api/reports/performance (alias for own performance or admin viewing specific agent)
router.get("/performance", (req, res) => {
  if (req.user.role === "it") {
    if (req.query.agentId && Number(req.query.agentId) !== req.user.id) {
      return res.status(403).json({
        error: "Access denied. Support agents can only view their own performance reports.",
        permission: "View dashboard and reports",
        role: "it",
        access: "Own performance",
      });
    }
    const report = getAgentPerformance(req.user.id);
    if (!report) return res.status(404).json({ error: "Agent performance record not found." });
    return res.json(report);
  }

  // Admin
  const targetId = req.query.agentId ? Number(req.query.agentId) : req.user.id;
  const report = getAgentPerformance(targetId);
  if (!report) return res.status(404).json({ error: "Agent not found." });
  return res.json(report);
});

// GET /api/reports/agent/:id
router.get("/agent/:id", (req, res) => {
  const targetId = Number(req.params.id);
  if (req.user.role === "it" && targetId !== req.user.id) {
    return res.status(403).json({
      error: "Access denied. Support agents can only view their own performance reports.",
      permission: "View dashboard and reports",
      role: "it",
      access: "Own performance",
    });
  }

  const report = getAgentPerformance(targetId);
  if (!report) return res.status(404).json({ error: "Agent not found." });
  return res.json(report);
});

// GET /api/reports/agents (team performance list, admin only)
router.get("/agents", (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Access denied. Support agents cannot view team-wide performance reports.",
      permission: "View dashboard and reports",
      role: req.user.role,
      access: "Own performance",
    });
  }

  res.json({ agents: getTeamPerformance() });
});

// GET /api/reports/overview (all organization metrics, admin only)
router.get("/overview", (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Access denied. Support agents cannot view organization-wide dashboard and reports.",
      permission: "View dashboard and reports",
      role: req.user.role,
      access: "Own performance",
    });
  }

  res.json(getOverview());
});

export default router;

