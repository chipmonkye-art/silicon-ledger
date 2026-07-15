import { Router } from "express";
import crypto from "crypto";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
const INVITE_HMAC_SECRET = process.env.INVITE_HMAC_SECRET || "dev-invite-secret-change-in-production";

function decodeInviteCode(code) {
  try {
    const clean = code.replace(/-/g, "").toUpperCase();
    const decoded = Buffer.from(clean, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;
    const [workspaceId, role, expiresAt, hmac] = parts;
    const payload = `${workspaceId}:${role}:${expiresAt}`;
    const expected = crypto.createHmac("sha256", INVITE_HMAC_SECRET).update(payload).digest("hex").slice(0, 8);
    if (hmac !== expected) return null;
    if (parseInt(expiresAt) < Math.floor(Date.now() / 1000)) return null;
    if (!["owner", "manager", "staff"].includes(role)) return null;
    return { workspaceId, role };
  } catch {
    return null;
  }
}

router.get("/me", authMiddleware, async (req, res) => {
  let [profile] = await sql`
    SELECT id, base_currency, created_at FROM profiles WHERE id = ${req.user.userId}
  `;

  if (!profile) {
    [profile] = await sql`
      INSERT INTO profiles (id, base_currency)
      VALUES (${req.user.userId}, 'BDT')
      ON CONFLICT (id) DO NOTHING
      RETURNING id, base_currency, created_at
    `;
  }

  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*) FROM user_workspaces WHERE user_id = ${req.user.userId})::int AS workspace_count,
      (SELECT COUNT(*) FROM accounts WHERE user_id = ${req.user.userId})::int AS account_count,
      (SELECT COUNT(*) FROM transactions WHERE user_id = ${req.user.userId})::int AS transaction_count
  `;

  const workspaces = await sql`
    SELECT w.*, uw.role FROM workspaces w
    JOIN user_workspaces uw ON uw.workspace_id = w.id
    WHERE uw.user_id = ${req.user.userId}
    ORDER BY w.created_at
  `;

  res.json({ user: profile, counts, workspaces });
});

router.post("/seed", authMiddleware, async (req, res) => {
  await sql`SELECT seed_user_data()`;
  res.json({ message: "User data seeded" });
});

router.post("/generate-recurring", authMiddleware, async (req, res) => {
  const [result] = await sql`SELECT generate_recurring_transactions() AS generated`;
  res.json({ generated: result.generated });
});

router.post("/accept-invite", authMiddleware, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(422).json({ message: "code is required" });

  const decoded = decodeInviteCode(code);
  if (!decoded) return res.status(400).json({ message: "Invalid or expired invite code" });

  const { workspaceId, role } = decoded;

  const already = await sql`
    SELECT 1 FROM user_workspaces
    WHERE user_id = ${req.user.userId} AND workspace_id = ${workspaceId}
  `;
  if (already.length) return res.status(409).json({ message: "Already a member of this workspace" });

  const [workspace] = await sql`
    SELECT id, name FROM workspaces WHERE id = ${workspaceId}
  `;
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });

  const [membership] = await sql`
    INSERT INTO user_workspaces (user_id, workspace_id, role, invited_by)
    VALUES (${req.user.userId}, ${workspaceId}, ${role}, null)
    RETURNING *
  `;

  res.json({ workspace: { ...workspace, role: membership.role } });
});

// POST /api/auth/purge-account — GDPR right-to-erasure
// Anonymizes personal data, archives ledger records, revokes all sessions.
router.post("/purge-account", authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  // Revoke all sessions for this user
  const { default: sessionStore } = await import("../lib/sessionStore.js");
  await sessionStore.revokeAllUserSessions(userId);

  // Anonymize profile
  await sql`
    UPDATE profiles
    SET
      base_currency = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;

  // Remove from all workspaces
  await sql`DELETE FROM user_workspaces WHERE user_id = ${userId}`;

  // Anonymize transactions: null out user_id, keep financial data for audit
  await sql`
    UPDATE transactions
    SET user_id = NULL,
        description = CONCAT('[Archived] ', LEFT(description, 50))
    WHERE user_id = ${userId}
  `;

  // Anonymize recurring transactions
  await sql`
    UPDATE recurring_transactions
    SET user_id = NULL,
        description = '[Archived]'
    WHERE user_id = ${userId}
  `;

  // Delete biometric credentials
  await sql`DELETE FROM biometric_credentials WHERE user_id = ${userId}`;

  // Delete device tokens
  await sql`DELETE FROM device_tokens WHERE user_id = ${userId}`;

  // Delete notifications
  await sql`DELETE FROM notifications WHERE user_id = ${userId}`;

  // Delete auth challenges
  await sql`DELETE FROM auth_challenges WHERE user_id = ${userId}`;

  // Log audit entry
  await sql`
    INSERT INTO transaction_audit (action, before_value, after_value)
    VALUES ('PURGE_ACCOUNT', jsonb_build_object('user_id', ${userId}), '{}'::jsonb)
  `;

  res.json({
    message: "Account purged successfully. Personal data anonymized; financial records archived.",
    note: "This action cannot be undone. All sessions revoked.",
  });
});

export default router;
