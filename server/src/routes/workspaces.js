import { Router } from "express";
import crypto from "crypto";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireWorkspaceRole } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware);

const INVITE_HMAC_SECRET = process.env.INVITE_HMAC_SECRET || "dev-invite-secret-change-in-production";

function encodeInviteCode(workspaceId, role) {
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
  const payload = `${workspaceId}:${role}:${expiresAt}`;
  const hmac = crypto.createHmac("sha256", INVITE_HMAC_SECRET).update(payload).digest("hex").slice(0, 8);
  const combined = `${payload}:${hmac}`;
  return Buffer.from(combined).toString("base64url").replace(/=+$/, "").replace(/(.{4})/g, "$1-").slice(0, -1);
}

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

router.get("/", async (req, res) => {
  const workspaces = await sql`
    SELECT w.*, uw.role FROM workspaces w
    JOIN user_workspaces uw ON uw.workspace_id = w.id
    WHERE uw.user_id = ${req.user.userId}
    ORDER BY w.created_at DESC
  `;
  res.json({ workspaces });
});

router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(422).json({ message: "name is required" });

  const [workspace] = await sql`
    INSERT INTO workspaces (name, created_by)
    VALUES (${name}, ${req.user.userId})
    RETURNING *
  `;

  await sql`
    INSERT INTO user_workspaces (user_id, workspace_id, role)
    VALUES (${req.user.userId}, ${workspace.id}, 'owner')
  `;

  res.status(201).json({ workspace });
});

router.get("/:id", async (req, res) => {
  const [workspace] = await sql`
    SELECT w.*, uw.role FROM workspaces w
    JOIN user_workspaces uw ON uw.workspace_id = w.id AND uw.user_id = ${req.user.userId}
    WHERE w.id = ${req.params.id}
  `;
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });
  res.json({ workspace });
});

router.put("/:id", requireWorkspaceRole("owner", "manager"), async (req, res) => {
  const { name } = req.body;
  const [workspace] = await sql`
    UPDATE workspaces SET name = COALESCE(${name}, name)
    WHERE id = ${req.params.id}
    RETURNING *
  `;
  res.json({ workspace });
});

router.get("/:id/members", async (req, res) => {
  const isMember = await sql`
    SELECT 1 FROM user_workspaces
    WHERE user_id = ${req.user.userId} AND workspace_id = ${req.params.id}
  `;
  if (!isMember.length) return res.status(403).json({ message: "Not a member of this workspace" });

  const members = await sql`
    SELECT uw.user_id, uw.role, uw.joined_at
    FROM user_workspaces uw
    WHERE uw.workspace_id = ${req.params.id}
    ORDER BY uw.joined_at
  `;
  res.json({ members });
});

router.post("/:id/invite", requireWorkspaceRole("owner"), async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) return res.status(422).json({ message: "email and role are required" });
  if (!["owner", "manager", "staff"].includes(role)) {
    return res.status(422).json({ message: "role must be owner, manager, or staff" });
  }

  const [profile] = await sql`
    SELECT id FROM profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE au.email = ${email}
  `;
  if (!profile) return res.status(404).json({ message: "No user found with that email" });

  const already = await sql`
    SELECT 1 FROM user_workspaces
    WHERE user_id = ${profile.id} AND workspace_id = ${req.params.id}
  `;
  if (already.length) return res.status(409).json({ message: "User is already a member" });

  const [membership] = await sql`
    INSERT INTO user_workspaces (user_id, workspace_id, role, invited_by)
    VALUES (${profile.id}, ${req.params.id}, ${role}, ${req.user.userId})
    RETURNING *
  `;
  res.status(201).json({ membership });
});

router.post("/:id/generate-invite", requireWorkspaceRole("owner"), async (req, res) => {
  const { role } = req.body;
  if (!role || !["manager", "staff"].includes(role)) {
    return res.status(422).json({ message: "role must be manager or staff" });
  }
  const code = encodeInviteCode(req.params.id, role);
  res.json({ code });
});

router.post("/:id/members/:userId", requireWorkspaceRole("owner"), async (req, res) => {
  const { role } = req.body;
  if (!role) return res.status(422).json({ message: "role is required" });

  const [membership] = await sql`
    UPDATE user_workspaces SET role = ${role}
    WHERE workspace_id = ${req.params.id} AND user_id = ${req.params.userId}
    RETURNING *
  `;
  if (!membership) return res.status(404).json({ message: "Membership not found" });
  res.json({ membership });
});

router.delete("/:id/members/:userId", requireWorkspaceRole("owner"), async (req, res) => {
  const [membership] = await sql`
    DELETE FROM user_workspaces
    WHERE workspace_id = ${req.params.id} AND user_id = ${req.params.userId}
    RETURNING user_id
  `;
  if (!membership) return res.status(404).json({ message: "Membership not found" });
  res.status(204).end();
});

export default router;
