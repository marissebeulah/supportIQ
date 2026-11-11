import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import { requireAuth } from "../auth.js";
import { UPLOAD_DIR, db, nowIso } from "../db.js";
import { canAccessTicket } from "../serialize.js";

const router = express.Router();

const ALLOWED = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = ALLOWED[file.mimetype] ?? "";
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED[file.mimetype]) {
      return callback(new Error("Only PNG, JPEG, WebP, GIF, and PDF files are supported."));
    }
    callback(null, true);
  },
});

function hasValidSignature(mime, filePath) {
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (mime === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/gif") return buffer.subarray(0, 4).toString() === "GIF8";
  if (mime === "image/webp") {
    return buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  }
  if (mime === "application/pdf") return buffer.subarray(0, 4).toString() === "%PDF";
  return false;
}

function safeFilename(name) {
  return String(name)
    .replace(/[\\/\r\n"]/g, "_")
    .replace(/[\u0000-\u001f]/g, "")
    .slice(0, 160) || "attachment";
}

router.post("/uploads", requireAuth, (req, res) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "That file is over the 5 MB limit."
          : error.message || "Upload failed.";
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a file to upload." });

    const filePath = path.join(UPLOAD_DIR, req.file.filename);
    if (!hasValidSignature(req.file.mimetype, filePath)) {
      fs.rmSync(filePath, { force: true });
      return res.status(400).json({ error: "The file contents don't match its type." });
    }

    const filename = safeFilename(req.file.originalname);
    const createdAt = nowIso();
    const info = db
      .prepare(
        `INSERT INTO attachments (ticket_id, message_id, uploader_id, filename, stored_name, mime, size, created_at)
         VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?)`,
      )
      .run(req.user.id, filename, req.file.filename, req.file.mimetype, req.file.size, createdAt);

    res.status(201).json({
      attachment: {
        id: Number(info.lastInsertRowid),
        filename,
        mime: req.file.mimetype,
        size: req.file.size,
        createdAt,
        url: `/api/attachments/${Number(info.lastInsertRowid)}`,
      },
    });
  });
});

router.get("/attachments/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "Attachment not found." });
  const attachment = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id);
  if (!attachment) return res.status(404).json({ error: "Attachment not found." });

  let allowed = req.user.role === "admin";
  if (attachment.ticket_id) {
    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(attachment.ticket_id);
    allowed = allowed || canAccessTicket(ticket, req.user);
  } else {
    allowed = allowed || attachment.uploader_id === req.user.id;
  }
  if (!allowed) return res.status(403).json({ error: "You don't have access to this file." });

  const filePath = path.join(UPLOAD_DIR, path.basename(attachment.stored_name));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File is no longer available." });

  const fallback = attachment.filename.replace(/[^\x20-\x7e]/g, "_");
  res.setHeader("Content-Type", attachment.mime);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
  );
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(filePath);
});

export default router;
