import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { hashPassword, rateLimit, requireAuth } from "../auth.js";
import { db, nowIso } from "../db.js";
import { publish } from "../realtime.js";
import {
  ACTIVE_TTL_MS,
  PAIRING_TTL_MS,
  audience,
  closeSession,
  createPairingCode,
  expireStaleSessions,
  getSessionRow,
  hashSecret,
  listOpenSessionsForCustomer,
  normalizePairingCode,
  randomToken,
  serializeDevice,
  serializeSession,
  agentServerUrl,
  agentFallbackServerUrl,
} from "../remote-sessions.js";
import { notifyUser, setFrame, takeInput, waitForUser } from "../remote-hub.js";

const router = express.Router();

const AGENT_EXE = path.resolve(process.cwd(), "agent", "build", "SupportIQ-Agent.exe");
export const AGENT_VERSION = "1.0.6";
let buildCache = { mtimeMs: 0, size: 0, sha256: null };

/** Current agent build metadata; the hash lets the installed agent self-update. */
function agentBuildInfo() {
  if (!fs.existsSync(AGENT_EXE)) {
    return { available: false, version: AGENT_VERSION, size: 0, sha256: null };
  }
  const stat = fs.statSync(AGENT_EXE);
  if (buildCache.mtimeMs !== stat.mtimeMs || buildCache.size !== stat.size) {
    buildCache = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(AGENT_EXE)).digest("hex"),
    };
  }
  return { available: true, version: AGENT_VERSION, size: buildCache.size, sha256: buildCache.sha256 };
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function fail(res, status, message) {
  res.status(status).json({ error: message });
  return null;
}

function expiresFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function publicDevice(row) {
  return serializeDevice(row);
}

const lastFrameWrite = new Map();

/* --------------------------------------------------------------- Agent auth */

function requireAgent(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "Missing agent token." });
  const row = db
    .prepare(
      `SELECT d.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
         u.active AS user_active
       FROM agent_devices d
       JOIN users u ON u.id = d.user_id
       WHERE d.token_hash = ? AND d.revoked_at IS NULL`,
    )
    .get(hashSecret(token));
  if (!row || row.user_active !== 1) {
    return res.status(401).json({ error: "This agent isn't paired anymore. Pair it again." });
  }
  const reportedVersion = String(req.headers["x-agent-version"] || "").trim().slice(0, 24);
  if (reportedVersion) row.agent_version = reportedVersion;
  db.prepare(
    "UPDATE agent_devices SET last_seen_at = ?, agent_version = COALESCE(?, agent_version) WHERE id = ?",
  ).run(nowIso(), reportedVersion || null, row.id);
  req.agent = row;
  next();
}

/* --------------------------------------------------------------- Pairing API */

/** The address a paired agent should use on this network, for manual re-pairing. */
router.get("/server-info", requireAuth, (req, res) => {
  return res.json({
    serverUrl: agentServerUrl(req),
    fallbackServerUrl: agentFallbackServerUrl(),
    version: AGENT_VERSION,
    downloadAvailable: fs.existsSync(AGENT_EXE),
  });
});

/** Creates a short-lived code the customer types into the Windows agent. */
router.post("/pairing-codes", requireAuth, (req, res) => {
  if (req.user.role !== "customer") {
    return fail(res, 403, "Only a customer can pair their own computer.");
  }
  expireStaleSessions();
  const code = createPairingCode();
  const normalized = normalizePairingCode(code);
  const now = nowIso();
  db.prepare(
    "UPDATE agent_pairing_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
  ).run(now, req.user.id);
  const info = db
    .prepare(
      `INSERT INTO agent_pairing_codes (user_id, code_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(req.user.id, hashSecret(normalized), now, expiresFromNow(PAIRING_TTL_MS));
  return res.status(201).json({
    code,
    expiresAt: expiresFromNow(PAIRING_TTL_MS),
    serverUrl: agentServerUrl(req),
    agentVersion: AGENT_VERSION,
    downloadAvailable: fs.existsSync(AGENT_EXE),
    pairingId: Number(info.lastInsertRowid),
  });
});

/** The Windows agent exchanges a pairing code for a long-lived device token. */
router.post(
  "/pair",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 25,
    message: "Too many pairing attempts. Ask the customer for a fresh code.",
  }),
  (req, res) => {
    const normalized = normalizePairingCode(req.body?.code);
    if (normalized.length !== 8) {
      return fail(res, 400, "Enter the 8-character code shown in SupportIQ.");
    }
    const codeRow = db
      .prepare(
        `SELECT * FROM agent_pairing_codes
         WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`,
      )
      .get(hashSecret(normalized), nowIso());
    if (!codeRow) {
      return fail(res, 400, "That code is invalid or has expired. Generate a new one.");
    }
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(codeRow.user_id);
    if (!user || user.active !== 1) {
      return fail(res, 400, "This customer account is no longer active.");
    }

    const name = String(req.body?.deviceName ?? "").trim().slice(0, 64) || "Windows PC";
    const platform = String(req.body?.platform ?? "windows").trim().slice(0, 16) || "windows";
    const version = String(req.body?.agentVersion ?? "").trim().slice(0, 24) || null;
    const token = randomToken(32);
    const now = nowIso();

    db.exec("BEGIN");
    let deviceId;
    try {
      const used = db
        .prepare("UPDATE agent_pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL")
        .run(now, codeRow.id);
      if (!used.changes) {
        db.exec("ROLLBACK");
        return fail(res, 400, "That code was already used. Generate a new one.");
      }
      const info = db
        .prepare(
          `INSERT INTO agent_devices
            (user_id, name, platform, agent_version, token_hash, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(user.id, name, platform, version, hashSecret(token), now, now);
      deviceId = Number(info.lastInsertRowid);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const device = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(deviceId);
    notifyUser(user.id);
    return res.status(201).json({
      token,
      serverUrl: agentServerUrl(req),
      device: publicDevice(device),
      user: { id: user.id, name: user.name, email: user.email },
    });
  },
);

/** Paired computers for the signed-in customer. */
router.get("/devices", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM agent_devices WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC`,
    )
    .all(req.user.id);
  return res.json({ devices: rows.map(publicDevice) });
});

/** Revokes a paired computer and ends anything it is currently doing. */
router.delete("/devices/:id", requireAuth, (req, res) => {
  const deviceId = parseId(req.params.id);
  if (!deviceId) return fail(res, 404, "Paired computer not found.");
  const device = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(deviceId);
  if (!device || device.user_id !== req.user.id) {
    return fail(res, 404, "Paired computer not found.");
  }
  db.prepare("UPDATE agent_devices SET revoked_at = ? WHERE id = ?").run(nowIso(), device.id);
  const active = db
    .prepare(
      `SELECT * FROM remote_sessions
       WHERE agent_device_id = ? AND status IN ('requested', 'ready', 'active')`,
    )
    .all(device.id);
  for (const session of active) {
    closeSession(session, "ended", {
      userId: req.user.id,
      reason: "device_revoked",
    });
  }
  return res.json({ ok: true });
});

/* ------------------------------------------------- Unattended access setup */

/**
 * Turns unattended access on or off for one paired computer and stores only a
 * scrypt hash of the password. The owner (customer) is the only one who can
 * change it, so IT can never silently grant itself access.
 */
router.put("/devices/:id/unattended", requireAuth, (req, res) => {
  const deviceId = parseId(req.params.id);
  if (!deviceId) return fail(res, 404, "Paired computer not found.");
  const device = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(deviceId);
  if (!device || device.user_id !== req.user.id) {
    return fail(res, 404, "Paired computer not found.");
  }
  if (device.revoked_at) {
    return fail(res, 409, "This PC is no longer paired. Pair it again first.");
  }

  if (req.body?.enabled !== true) {
    db.prepare(
      `UPDATE agent_devices
       SET unattended_enabled = 0, unattended_password_hash = NULL, unattended_updated_at = ?
       WHERE id = ?`,
    ).run(nowIso(), device.id);
    const row = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(device.id);
    return res.json({ device: publicDevice(row) });
  }

  const password = String(req.body?.password ?? "");
  if (password.length > 0 && (password.length < 8 || password.length > 128)) {
    return fail(res, 400, "Use an unattended access password of 8 to 128 characters.");
  }
  if (password.length === 0 && !device.unattended_password_hash) {
    return fail(res, 400, "Choose a password with at least 8 characters.");
  }

  const hash = password.length > 0 ? hashPassword(password) : device.unattended_password_hash;
  db.prepare(
    `UPDATE agent_devices
     SET unattended_enabled = 1, unattended_password_hash = ?, unattended_updated_at = ?
     WHERE id = ?`,
  ).run(hash, nowIso(), device.id);
  const row = db.prepare("SELECT * FROM agent_devices WHERE id = ?").get(device.id);
  return res.json({ device: publicDevice(row) });
});

/* --------------------------------------------------------- Agent self-revoke */

/** The agent can revoke itself (the "Forget this PC" button) without a portal session. */
router.delete("/device", requireAgent, (req, res) => {
  db.prepare("UPDATE agent_devices SET revoked_at = ? WHERE id = ?").run(nowIso(), req.agent.id);
  const active = db
    .prepare(
      `SELECT * FROM remote_sessions
       WHERE agent_device_id = ? AND status IN ('requested', 'ready', 'active')`,
    )
    .all(req.agent.id);
  for (const session of active) {
    closeSession(session, "ended", { userId: req.agent.user_id, reason: "device_revoked" });
  }
  notifyUser(req.agent.user_id);
  return res.json({ ok: true });
});

/* -------------------------------------------------------- Long-poll for agent */

function buildPoll(agent, sessionId, fallbackServerUrl) {
  const rows = listOpenSessionsForCustomer(agent.user_id).filter(
    (row) =>
      row.status === "requested" ||
      (row.status === "active" && row.agent_device_id === agent.id),
  );
  let session = null;
  if (sessionId) {
    const row = getSessionRow(sessionId);
    if (row && row.customer_id === agent.user_id) session = row;
  }
  const commands =
    session && session.status === "active" && session.agent_device_id === agent.id
      ? takeInput(session.id)
      : [];
  return {
    device: publicDevice(agent),
    sessions: rows.map(serializeSession),
    session: serializeSession(session),
    commands,
    // The agent stores this so it can reconnect if the host's IP changes.
    fallbackServerUrl: fallbackServerUrl ?? null,
    serverTime: nowIso(),
  };
}

function pollHasWork(payload) {
  if (payload.sessions.length > 0) return true;
  if (payload.commands.length > 0) return true;
  // Tell the agent immediately when its session ends or changes state.
  return Boolean(payload.session && payload.session.status !== "active");
}

router.get("/poll", requireAgent, async (req, res) => {
  expireStaleSessions();
  const sessionId = parseId(req.query.sessionId);
  const waitSeconds = Math.min(Math.max(Number(req.query.wait ?? 20) || 0, 0), 25);
  const deadline = Date.now() + waitSeconds * 1000;
  const fallbackServerUrl = agentFallbackServerUrl();
  let payload = buildPoll(req.agent, sessionId, fallbackServerUrl);

  while (!pollHasWork(payload) && Date.now() < deadline) {
    if (req.destroyed || res.writableEnded) return;
    await waitForUser(req.agent.user_id, deadline - Date.now());
    if (req.destroyed || res.writableEnded) return;
    expireStaleSessions();
    payload = buildPoll(req.agent, sessionId, fallbackServerUrl);
  }
  if (!res.headersSent) return res.json(payload);
  return undefined;
});

/* --------------------------------------------------- Agent session lifecycle */

/** The customer sees a prompt in the agent and explicitly allows or denies. */
router.post("/sessions/:id/answer", requireAgent, (req, res) => {
  const sessionId = parseId(req.params.id);
  if (!sessionId) return fail(res, 404, "Remote session not found.");
  const session = getSessionRow(sessionId);
  if (!session) return fail(res, 404, "Remote session not found.");
  if (session.customer_id !== req.agent.user_id) {
    return fail(res, 403, "This request isn't for your account.");
  }
  if (session.status !== "requested" && session.status !== "ready") {
    return fail(res, 409, "This remote session is no longer waiting for an answer.");
  }

  if (req.body?.allow !== true) {
    const row = closeSession(session, "declined", {
      userId: session.customer_id,
      reason: "declined_in_agent",
      event: "remote:declined",
    });
    notifyUser(session.requested_by);
    return res.json({ remoteSession: serializeSession(row), allowed: false });
  }

  const now = nowIso();
  const info = db
    .prepare(
      `UPDATE remote_sessions
       SET status = 'active', approved_at = ?, started_at = ?, ready_at = COALESCE(ready_at, ?),
         agent_device_id = ?, expires_at = ?, started_with = 'consent'
       WHERE id = ? AND customer_id = ? AND status IN ('requested', 'ready')`,
    )
    .run(
      now,
      now,
      now,
      req.agent.id,
      expiresFromNow(ACTIVE_TTL_MS),
      session.id,
      session.customer_id,
    );
  if (!info.changes) {
    return fail(res, 409, "Another paired computer already answered this request.");
  }
  const row = getSessionRow(session.id);
  const payload = serializeSession(row);
  publish("remote:active", { sessionId: row.id, remoteSession: payload }, audience(row));
  notifyUser(row.customer_id);
  notifyUser(row.requested_by);
  return res.json({ remoteSession: payload, allowed: true });
});

/** Lets the agent re-check one session without waiting for the long-poll. */
router.get("/sessions/:id", requireAgent, (req, res) => {
  const sessionId = parseId(req.params.id);
  if (!sessionId) return fail(res, 404, "Remote session not found.");
  const session = getSessionRow(sessionId);
  if (!session || session.customer_id !== req.agent.user_id) {
    return fail(res, 404, "Remote session not found.");
  }
  return res.json({ session: serializeSession(session) });
});

/** Raw JPEG screen frame from the customer's computer. */
const rawFrame = express.raw({ type: () => true, limit: "3mb" });

router.post(
  "/sessions/:id/frame",
  requireAgent,
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) return next();
    return rawFrame(req, res, next);
  },
  (req, res) => {
    const sessionId = parseId(req.params.id);
    if (!sessionId) return fail(res, 404, "Remote session not found.");
    const session = getSessionRow(sessionId);
    if (!session || session.customer_id !== req.agent.user_id) {
      return fail(res, 404, "Remote session not found.");
    }
    if (session.status !== "active" || session.agent_device_id !== req.agent.id) {
      return fail(res, 409, "The remote session isn't active on this computer.");
    }
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length < 64) {
      return fail(res, 400, "No screen frame was received.");
    }
    setFrame(session.id, buffer, {
      width: Number(req.headers["x-frame-width"]) || 0,
      height: Number(req.headers["x-frame-height"]) || 0,
      sequence: Number(req.headers["x-frame-sequence"]) || 0,
    });
    const now = Date.now();
    const last = lastFrameWrite.get(session.id) ?? 0;
    if (now - last > 5000) {
      lastFrameWrite.set(session.id, now);
      db.prepare("UPDATE remote_sessions SET last_frame_at = ? WHERE id = ?").run(
        new Date(now).toISOString(),
        session.id,
      );
    }
    return res.status(204).end();
  },
);

/** The customer stops sharing from the agent window or tray. */
router.post("/sessions/:id/stop", requireAgent, (req, res) => {
  const sessionId = parseId(req.params.id);
  if (!sessionId) return fail(res, 404, "Remote session not found.");
  const session = getSessionRow(sessionId);
  if (!session || session.customer_id !== req.agent.user_id) {
    return fail(res, 404, "Remote session not found.");
  }
  if (!["requested", "ready", "active"].includes(session.status)) {
    return res.json({ remoteSession: serializeSession(session) });
  }
  const row = closeSession(session, "ended", {
    userId: session.customer_id,
    reason: "stopped_by_customer",
  });
  return res.json({ remoteSession: serializeSession(row) });
});

/* -------------------------------------------------------------- Agent build */

/** Finds an unused, unexpired pairing code and its (active) owner. */
function findPairingCode(rawCode) {
  const normalized = normalizePairingCode(rawCode);
  if (normalized.length !== 8) return null;
  return db
    .prepare(
      `SELECT pc.*, u.active AS user_active
       FROM agent_pairing_codes pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.code_hash = ? AND pc.used_at IS NULL AND pc.expires_at > ?`,
    )
    .get(hashSecret(normalized), nowIso());
}

/**
 * A single .cmd file the customer runs on their PC. It installs the tray app,
 * enables start-with-Windows, and launches it with the pairing details, so the
 * customer never has to copy a server address or code by hand.
 */
function installerScript(serverUrl, code) {
  const server = String(serverUrl).replace(/[^A-Za-z0-9._:\/-]/g, "");
  const pairingCode = normalizePairingCode(code);
  // The LAN dev server uses a self-signed certificate. The installer downloads
  // the agent before it is paired, so it must accept that certificate; the
  // short-lived pairing code is the capability that protects the download.
  const insecure = server.startsWith("https://") ? " -k" : "";
  return [
    "@echo off",
    "setlocal EnableExtensions",
    "title SupportIQ Agent Setup",
    "echo.",
    "echo   SupportIQ Agent - one-click setup",
    "echo   ---------------------------------",
    "echo.",
    `set "SERVER=${server}"`,
    `set "CODE=${pairingCode}"`,
    'set "INSTALL_DIR=%LOCALAPPDATA%\\Programs\\SupportIQ"',
    'set "EXE=%INSTALL_DIR%\\SupportIQ-Agent.exe"',
    'set "CONFIG_DIR=%APPDATA%\\SupportIQ"',
    'set "CONFIG=%CONFIG_DIR%\\agent.json"',
    'set "TMP_EXE=%TEMP%\\SupportIQ-Agent-setup.exe"',
    "",
    'if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" >nul 2>&1',
    'if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%" >nul 2>&1',
    "",
    "echo Stopping any running SupportIQ Agent...",
    "taskkill /F /IM SupportIQ-Agent.exe >nul 2>&1",
    "ping -n 3 127.0.0.1 >nul",
    "",
    "echo Downloading the agent from %SERVER% ...",
    "where curl.exe >nul 2>&1",
    "if errorlevel 1 goto download_powershell",
    `curl.exe -fsSL${insecure} --retry 2 "%SERVER%/api/agent/download-by-code?code=%CODE%" -o "%TMP_EXE%"`,
    "goto check_download",
    "",
    ":download_powershell",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }; try { Invoke-WebRequest -UseBasicParsing -Uri '%SERVER%/api/agent/download-by-code?code=%CODE%' -OutFile '%TMP_EXE%' } catch { exit 1 }"`,
    "",
    ":check_download",
    "if errorlevel 1 goto download_failed",
    'if not exist "%TMP_EXE%" goto download_failed',
    'for %%A in ("%TMP_EXE%") do if %%~zA LSS 10000 goto download_failed',
    "",
    "echo Installing...",
    'move /Y "%TMP_EXE%" "%EXE%" >nul',
    "if errorlevel 1 goto install_failed",
    "",
    'if not exist "%CONFIG%" (',
    '  echo {"serverUrl":"","token":"","deviceId":0,"deviceName":"","autoStart":"true"}> "%CONFIG%"',
    ")",
    "",
    "echo Creating the Start Menu shortcut...",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $lnk = $ws.CreateShortcut([IO.Path]::Combine($env:APPDATA,'Microsoft\\Windows\\Start Menu\\Programs\\SupportIQ Agent.lnk')); $lnk.TargetPath = '%EXE%'; $lnk.Description = 'SupportIQ remote support agent'; $lnk.Save()" >nul 2>&1`,
    "",
    "echo Starting the agent and pairing this PC...",
    'start "" "%EXE%" "--server=%SERVER%" "--code=%CODE%"',
    "",
    "echo.",
    "echo Done. The SupportIQ Agent is running in the system tray.",
    "echo You will see an Allow / Don't allow prompt for each support session.",
    "echo.",
    "ping -n 6 127.0.0.1 >nul",
    "exit /b 0",
    "",
    ":download_failed",
    "echo.",
    "echo Could not download the agent from %SERVER%.",
    "echo Check that this PC is on the same network, then generate a fresh code and try again.",
    "pause",
    "exit /b 1",
    "",
    ":install_failed",
    "echo.",
    "echo Could not install the agent to %INSTALL_DIR%.",
    "pause",
    "exit /b 1",
    "",
  ].join("\r\n");
}

/** Personalised one-click Windows installer for the signed-in customer. */
router.get("/installer", requireAuth, (req, res) => {
  if (req.user.role !== "customer") {
    return fail(res, 403, "Only a customer can install the agent on their own computer.");
  }
  const normalized = normalizePairingCode(req.query.code);
  if (normalized.length !== 8) {
    return fail(res, 400, "Generate a pairing code first, then download the installer.");
  }
  const codeRow = db
    .prepare(
      `SELECT * FROM agent_pairing_codes
       WHERE user_id = ? AND code_hash = ? AND used_at IS NULL AND expires_at > ?`,
    )
    .get(req.user.id, hashSecret(normalized), nowIso());
  if (!codeRow) {
    return fail(res, 400, "That pairing code has expired. Generate a new one and try again.");
  }
  if (!fs.existsSync(AGENT_EXE)) {
    return fail(res, 404, "The Windows agent build isn't available yet. Run npm run build:agent.");
  }
  const script = installerScript(agentServerUrl(req), normalized);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", 'attachment; filename="SupportIQ-Agent-Setup.cmd"');
  res.setHeader("Cache-Control", "no-store");
  return res.send(script);
});

/**
 * Unauthenticated build download used by the installer .cmd. The short-lived
 * pairing code is the capability; it is not consumed here, only on /pair.
 */
router.get(
  "/download-by-code",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    message: "Too many installer downloads. Try again in a minute.",
  }),
  (req, res) => {
    const row = findPairingCode(req.query.code);
    if (!row || row.user_active !== 1) {
      return fail(res, 400, "This installer link has expired. Generate a new one in SupportIQ.");
    }
    if (!fs.existsSync(AGENT_EXE)) {
      return fail(res, 404, "The Windows agent build isn't available yet. Run npm run build:agent.");
    }
    res.setHeader("Cache-Control", "no-store");
    return res.download(AGENT_EXE, "SupportIQ-Agent.exe");
  },
);

/** The paired agent checks this to see whether a newer build is published. */
router.get("/update", requireAgent, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(agentBuildInfo());
});

/** Authenticated download used by the agent's self-updater. */
router.get("/update/file", requireAgent, (_req, res) => {
  if (!fs.existsSync(AGENT_EXE)) {
    return res.status(404).json({ error: "No agent build is published yet." });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.download(AGENT_EXE, "SupportIQ-Agent.exe");
});

router.get("/download/info", requireAuth, (_req, res) => {
  const available = fs.existsSync(AGENT_EXE);
  let size = 0;
  if (available) {
    try {
      size = fs.statSync(AGENT_EXE).size;
    } catch {
      size = 0;
    }
  }
  return res.json({
    available,
    fileName: "SupportIQ-Agent.exe",
    version: AGENT_VERSION,
    size,
  });
});

router.get("/download", requireAuth, (_req, res) => {
  if (!fs.existsSync(AGENT_EXE)) {
    return res.status(404).json({
      error: "The Windows agent build isn't available yet. Run npm run build:agent.",
    });
  }
  res.setHeader("Content-Type", "application/octet-stream");
  return res.download(AGENT_EXE, "SupportIQ-Agent.exe");
});

export default router;
