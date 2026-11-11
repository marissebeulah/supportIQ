import express from "express";
import {
  cookieOptions,
  createSession,
  destroySession,
  hashPassword,
  publicUser,
  requireAuth,
  rateLimit,
  SESSION_COOKIE,
  verifyPassword,
} from "../auth.js";
import { db, nowIso } from "../db.js";

const router = express.Router();

router.post(
  "/register",
  rateLimit({
    limit: 5,
    windowMs: 60 * 60 * 1000,
    message: "Too many account requests. Try again later.",
    skipInDevelopment: true,
  }),
  (req, res) => {
    const name = String(req.body?.name ?? "").replace(/\u0000/g, "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: "Enter a name between 2 and 80 characters." });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid work email address." });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "Use a password between 8 and 128 characters." });
    }
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    try {
      const info = db.prepare(
        `INSERT INTO users (name, email, password_hash, role, created_at)
         VALUES (?, ?, ?, 'customer', ?)`,
      ).run(name, email, hashPassword(password), nowIso());
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(info.lastInsertRowid));
      return res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if (String(error?.code ?? "").includes("CONSTRAINT_UNIQUE")) {
        return res.status(409).json({ error: "An account with that email already exists." });
      }
      throw error;
    }
  },
);

router.post(
  "/login",
  rateLimit({ limit: 12, windowMs: 15 * 60 * 1000, skipInDevelopment: true }),
  (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!email || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const session = createSession(user.id);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions());
    return res.json({ user: publicUser(user) });
  },
);

router.post("/logout", (req, res) => {
  destroySession(req.sessionToken);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

router.post("/logout-all", requireAuth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.user.id);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.post("/forgot-password", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const user = db.prepare("SELECT id FROM users WHERE email = ? AND active = 1").get(email);
  if (user) {
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    db.prepare("INSERT INTO password_resets (user_id, token, created_at) VALUES (?, ?, ?)").run(user.id, token, new Date().toISOString());
  }
  return res.json({ ok: true, message: "If that account exists, a recovery token has been generated. Contact your administrator to get your new password." });
});

export default router;
