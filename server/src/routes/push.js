import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();

// POST /api/v2/devices/register — register a device for push notifications
router.post("/devices/register", authMiddleware, async (req, res) => {
  const { userId } = req.user;
  const { platform, token } = req.body;

  if (!platform || !token) {
    return res.status(422).json({ message: "platform and token required" });
  }

  if (!["ios", "android", "web"].includes(platform)) {
    return res.status(422).json({ message: "platform must be ios, android, or web" });
  }

  const [device] = await sql`
    INSERT INTO device_tokens (user_id, platform, token)
    VALUES (${userId}, ${platform}, ${token})
    ON CONFLICT (user_id, platform, token) DO UPDATE SET
      is_active = true,
      updated_at = now()
    RETURNING id, platform, token
  `;

  res.json({ device, message: "Device registered" });
});

// DELETE /api/v2/devices/unregister — remove a device token
router.post("/devices/unregister", authMiddleware, async (req, res) => {
  const { userId } = req.user;
  const { token } = req.body;

  await sql`
    UPDATE device_tokens SET is_active = false
    WHERE user_id = ${userId} AND token = ${token}
  `;

  res.json({ message: "Device unregistered" });
});

// GET /api/v2/devices — list registered devices
router.get("/devices", authMiddleware, async (req, res) => {
  const { userId } = req.user;

  const devices = await sql`
    SELECT id, platform, token, is_active, created_at, updated_at
    FROM device_tokens
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;

  res.json({ devices });
});

// POST /api/v2/notifications/send — send a notification to workspace members
router.post("/notifications/send", authMiddleware, workspaceScope, async (req, res) => {
  const { ws } = req.workspace;
  const { userId } = req.user;
  const { type, title, body, target_user_id, link } = req.body;

  if (!type || !title) {
    return res.status(422).json({ message: "type and title required" });
  }

  let recipients;

  if (target_user_id) {
    // Send to specific user in workspace
    recipients = [{ user_id: target_user_id }];
    const [member] = await sql`
      SELECT 1 FROM user_workspaces
      WHERE user_id = ${target_user_id} AND workspace_id = ${ws}
    `;
    if (!member) return res.status(404).json({ message: "User not in workspace" });
  } else {
    // Send to all workspace members
    recipients = await sql`
      SELECT user_id FROM user_workspaces WHERE workspace_id = ${ws}
    `;
  }

  // Insert into notifications table
  for (const r of recipients) {
    await sql`
      INSERT INTO notifications (user_id, workspace_id, type, title, body, payload, link)
      VALUES (${r.user_id}, ${ws}, ${type}, ${title}, ${body || null}, ${JSON.stringify(req.body.payload || {})}, ${link || null})
    `;
  }

  // Get device tokens for push dispatch (in production, integrate FCM/APNs here)
  const tokens = await sql`
    SELECT dt.token, dt.platform
    FROM device_tokens dt
    WHERE dt.user_id = ANY(${recipients.map((r) => r.user_id)})
      AND dt.is_active = true
  `;

  // In production: dispatch via FCM (Android/web) and APNs (iOS)
  // This is a placeholder for the push dispatcher integration
  const dispatched = tokens.map((t) => ({
    token: t.token,
    platform: t.platform,
    notification: { title, body: body || "" },
  }));

  res.json({
    sent_to: recipients.length,
    recipients: recipients.map((r) => r.user_id),
    push_dispatched: dispatched.length,
    // In production, include FCM/APNs response here
  });
});

// GET /api/v2/notifications — list notifications for current user
router.get("/notifications", authMiddleware, async (req, res) => {
  const { userId } = req.user;

  const notifications = await sql`
    SELECT id, workspace_id, type, title, body, payload, link, read_at, created_at
    FROM notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  const [unread] = await sql`
    SELECT COUNT(*)::int AS count FROM notifications
    WHERE user_id = ${userId} AND read_at IS NULL
  `;

  res.json({ notifications, unread: unread.count });
});

// POST /api/v2/notifications/read — mark notification as read
router.post("/notifications/read", authMiddleware, async (req, res) => {
  const { userId } = req.user;
  const { id } = req.body;

  if (id === "all") {
    await sql`
      UPDATE notifications SET read_at = now()
      WHERE user_id = ${userId} AND read_at IS NULL
    `;
    res.json({ message: "All notifications marked as read" });
  } else {
    const [notif] = await sql`
      UPDATE notifications SET read_at = now()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `;
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification marked as read" });
  }
});

// POST /api/v2/notifications/digest — generate daily/weekly digest
router.post("/notifications/digest", authMiddleware, workspaceScope, async (req, res) => {
  const { ws } = req.workspace;

  const [summary] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM transactions WHERE workspace_id = ${ws} AND is_staged = true AND is_rejected = false) AS pending,
      (SELECT COUNT(*)::int FROM transactions WHERE workspace_id = ${ws} AND is_rejected = true) AS rejected,
      (SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM transactions WHERE workspace_id = ${ws} AND is_staged = false AND is_rejected = false AND occurred_on >= CURRENT_DATE - INTERVAL '7 days') AS weekly_volume
  `;

  res.json({
    workspace_id: ws,
    pending_approvals: summary.pending,
    needs_correction: summary.rejected,
    weekly_volume_cents: Number(summary.weekly_volume),
    generated_at: new Date().toISOString(),
  });
});

export default router;
