import crypto from "node:crypto";
import { db, nowIso } from "./db.js";

export const SESSION_COOKIE = "siq_session";
const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  try {
    const expected = Buffer.from(hash, "hex");
    const actual = crypto.scryptSync(password, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    company: user.company ?? null,
    title: user.title ?? null,
  };
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    createdAt,
    expiresAt,
  );
  return { token, expiresAt };
}

export function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function attachUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  req.sessionToken = token || null;
  req.user = null;
  if (token) {
    const row = db
      .prepare(
        `SELECT u.*, s.expires_at FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND u.active = 1`,
      )
      .get(token);
    if (row && new Date(row.expires_at).getTime() > Date.now()) {
      req.user = row;
    } else {
      destroySession(token);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have access to this area." });
    }
    next();
  };
}

const attempts = new Map();

export function rateLimit({
  windowMs = 15 * 60 * 1000,
  limit = 10,
  message = "Too many attempts. Please try again shortly.",
  skipInDevelopment = false,
} = {}) {
  return (req, res, next) => {
    if (skipInDevelopment && process.env.NODE_ENV === "development") return next();
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const record = attempts.get(key);
    if (!record || now > record.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    record.count += 1;
    if (record.count > limit) {
      res.setHeader("Retry-After", String(Math.ceil((record.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    if (now > record.resetAt) attempts.delete(key);
  }
}, 5 * 60 * 1000).unref();
