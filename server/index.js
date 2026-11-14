import fs from "node:fs";
import path from "node:path";
import express from "express";
import { attachUser, requireAuth } from "./auth.js";
import { db } from "./db.js";
import { addClient, removeClient } from "./realtime.js";
import { ensureSeed } from "./seed.js";
import { processDueFollowUps } from "./follow-ups.js";
import authRoutes from "./routes/auth.routes.js";
import ticketRoutes from "./routes/ticket.routes.js";
import botRoutes from "./routes/bot.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import internalMessageRoutes from "./routes/internal-messages.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import callRoutes from "./routes/calls.routes.js";
import remoteRoutes from "./routes/remote.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import diagnosticsRoutes from "./routes/diagnostics.routes.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const distDir = path.resolve(process.cwd(), "dist");

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(attachUser);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self)");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.get("/api/health", (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    return res.json({
      ok: true,
      status: "healthy",
      service: "SupportIQ",
      services: { api: "healthy", persistence: "healthy" },
      time: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({
      ok: false,
      status: "unhealthy",
      service: "SupportIQ",
      services: { api: "healthy", persistence: "unhealthy" },
      time: new Date().toISOString(),
    });
  }
});

app.get("/api/events", requireAuth, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  const client = addClient(req.user, res);
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);
  heartbeat.unref();

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(client);
    res.end();
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/agent/performance", (req, res, next) => {
  req.url = "/performance";
  reportsRoutes(req, res, next);
});
// Agent routes authenticate with a device token, not a browser session, so they
// must be mounted before the /api routers that gate every request with requireAuth.
app.use("/api/agent", agentRoutes);
app.use("/api/diagnostics", diagnosticsRoutes);
app.use("/api", ticketRoutes);
app.use("/api/bot", botRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/internal-messages", internalMessageRoutes);
app.use("/api", callRoutes);
app.use("/api", remoteRoutes);
app.use("/api", notificationRoutes);
app.use("/api", uploadRoutes);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    const indexPath = path.join(distDir, "index.html");
    if (!fs.existsSync(indexPath)) return next();
    res.sendFile(indexPath);
  });
}

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "That request wasn't valid JSON." });
  }
  if (error?.name === "MulterError") {
    return res.status(400).json({ error: error.message });
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
});

const seedResult = ensureSeed();
if (seedResult.seeded) {
  console.log(
    `SupportIQ demo data ready: ${seedResult.tickets} requests seeded, sample refs ${seedResult.seededTicketRefs.join(", ")}.`,
  );
}

function deliverDueFollowUps() {
  try {
    processDueFollowUps();
  } catch (error) {
    console.error("Could not deliver scheduled customer follow-ups:", error);
  }
}

deliverDueFollowUps();
const followUpTimer = setInterval(deliverDueFollowUps, 60_000);
followUpTimer.unref();

const server = app.listen(PORT, () => {
  console.log(`SupportIQ API listening on http://localhost:${PORT}`);
  if (!fs.existsSync(distDir)) {
    console.log("Frontend dev server expected separately (npm run dev).");
  }
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch {
      // Ignore close errors.
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
