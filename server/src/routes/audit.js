import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";
import { requireWorkspaceRoleOrAuditor } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// GET /api/audit/transactions — full audit trail for the workspace
router.get("/transactions", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { action, user_id, limit = 50, offset = 0, from, to } = req.query;

  let query = sql`
    SELECT at.id, at.transaction_id, at.user_id, at.action, at.before, at.after, at.created_at
    FROM transaction_audit at
    JOIN transactions t ON t.id = at.transaction_id
    WHERE t.workspace_id = ${ws}
  `;

  if (action) query = sql`${query} AND at.action = ${action}`;
  if (user_id) query = sql`${query} AND at.user_id = ${user_id}`;
  if (from) query = sql`${query} AND at.created_at >= ${from}::timestamp`;
  if (to) query = sql`${query} AND at.created_at <= ${to}::timestamp`;

  query = sql`${query} ORDER BY at.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const entries = await query;

  const [countResult] = await sql`
    SELECT COUNT(*)::int AS total
    FROM transaction_audit at
    JOIN transactions t ON t.id = at.transaction_id
    WHERE t.workspace_id = ${ws}
    ${action ? sql`AND at.action = ${action}` : sql``}
  `;

  res.json({ entries, total: countResult.total });
});

// GET /api/audit/transactions/:id — full trail for a specific transaction
router.get("/transactions/:id", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;

  const [txn] = await sql`
    SELECT id FROM transactions WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!txn) return res.status(404).json({ message: "Transaction not found in this workspace" });

  const entries = await sql`
    SELECT at.id, at.transaction_id, at.user_id, at.action, at.before, at.after, at.created_at
    FROM transaction_audit at
    WHERE at.transaction_id = ${req.params.id}
    ORDER BY at.created_at DESC
  `;

  res.json({ entries, transaction_id: req.params.id });
});

// GET /api/audit/summary — aggregation counts per action type
router.get("/summary", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;

  const rows = await sql`
    SELECT at.action, COUNT(*)::int AS count
    FROM transaction_audit at
    JOIN transactions t ON t.id = at.transaction_id
    WHERE t.workspace_id = ${ws}
    GROUP BY at.action
    ORDER BY at.action
  `;

  const [userCount] = await sql`
    SELECT COUNT(DISTINCT at.user_id)::int AS distinct_users
    FROM transaction_audit at
    JOIN transactions t ON t.id = at.transaction_id
    WHERE t.workspace_id = ${ws}
  `;

  res.json({ actions: rows, distinct_users: userCount.distinct_users });
});

export default router;
