import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { requireAuth } from "../auth.js";
import { db } from "../db.js";
import { clientCount } from "../realtime.js";
import { agentFallbackServerUrl, agentServerUrl } from "../remote-sessions.js";
import { AGENT_VERSION } from "./agent.routes.js";

const router = express.Router();

const AGENT_EXE = path.resolve(process.cwd(), "agent", "build", "SupportIQ-Agent.exe");
const STARTED_AT = Date.now();

router.use(requireAuth);

/**
 * Snapshot the connection check page renders: whether the API and database answer,
 * which address a paired agent should use, and how recently each PC checked in.
 * The browser measures its own round trip; this covers the server side.
 */
router.get("/", (req, res) => {
  const isStaff = req.user.role === "it" || req.user.role === "admin";

  let persistence = { ok: true, tickets: 0, devices: 0 };
  let devices = [];
  try {
    db.prepare("SELECT 1").get();
    persistence = {
      ok: true,
      tickets: db.prepare("SELECT COUNT(*) AS total FROM tickets").get().total,
      devices: db.prepare("SELECT COUNT(*) AS total FROM agent_devices WHERE revoked_at IS NULL").get().total,
    };

    const rows = isStaff
      ? db
          .prepare(
            `SELECT d.*, u.name AS owner_name, u.email AS owner_email
             FROM agent_devices d
             LEFT JOIN users u ON u.id = d.user_id
             WHERE d.revoked_at IS NULL
             ORDER BY d.last_seen_at DESC`,
          )
          .all()
      : db
          .prepare(
            `SELECT d.* FROM agent_devices d
             WHERE d.user_id = ? AND d.revoked_at IS NULL
             ORDER BY d.last_seen_at DESC`,
          )
          .all(req.user.id);

    devices = rows.map((row) => ({
      id: row.id,
      name: row.name,
      platform: row.platform,
      agentVersion: row.agent_version ?? null,
      unattendedEnabled: Number(row.unattended_enabled) === 1,
      lastSeenAt: row.last_seen_at ?? null,
      owner: isStaff
        ? { id: row.user_id, name: row.owner_name ?? "Unknown", email: row.owner_email ?? null }
        : null,
    }));
  } catch (error) {
    persistence = { ok: false, tickets: 0, devices: 0, error: String(error?.message ?? error) };
  }

  let downloadAvailable = false;
  try {
    downloadAvailable = fs.existsSync(AGENT_EXE);
  } catch {
    downloadAvailable = false;
  }

  return res.json({
    server: {
      time: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      hostname: os.hostname(),
      port: Number(process.env.PORT) || 3001,
      node: process.version,
      realtimeClients: clientCount(),
      role: req.user.role,
    },
    persistence,
    agent: {
      version: AGENT_VERSION,
      serverUrl: agentServerUrl(req),
      fallbackServerUrl: agentFallbackServerUrl(),
      downloadAvailable,
      installPath: downloadAvailable ? AGENT_EXE : null,
    },
    devices,
  });
});

export default router;
