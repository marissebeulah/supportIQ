import { requireAuth } from "../auth.js";
import express from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from "../notifications.js";

const router = express.Router();

router.use(requireAuth);

router.get("/notifications", (req, res) => {
  res.json({
    notifications: listNotifications(req.user.id, req.query.limit),
    unread: unreadNotificationCount(req.user.id),
  });
});

router.post("/notifications/:id/read", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "That notification wasn't found." });
  }
  markNotificationRead(req.user.id, id);
  res.json({ unread: unreadNotificationCount(req.user.id) });
});

router.post("/notifications/read-all", (req, res) => {
  markAllNotificationsRead(req.user.id);
  res.json({ unread: 0 });
});

export default router;
