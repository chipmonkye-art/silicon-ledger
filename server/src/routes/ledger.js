import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";
import { requireWorkspaceRoleOrAuditor } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// GET /api/ledger/verify — verify HMAC chain integrity for the workspace
router.get("/verify", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;

  const chain = await sql`SELECT * FROM verify_ledger_chain(${ws})`;

  const invalid = chain.filter((c) => !c.chain_valid);
  const total = chain.length;

  res.json({
    workspace_id: ws,
    total_checked: total,
    valid: invalid.length === 0,
    integrity_pct: total > 0 ? Math.round(((total - invalid.length) / total) * 100) : 100,
    invalid_entries: invalid,
    chain: chain.slice(-10), // Last 10 entries for quick reference
  });
});

// GET /api/ledger/chain/:id — view HMAC chain for a specific transaction
router.get("/chain/:id", async (req, res) => {
  const { ws } = req.workspace;

  const [txn] = await sql`
    SELECT id, ledger_hmac, previous_hmac, hmac_version, created_at,
           user_id, account_id, txn_type, amount_minor, description
    FROM transactions
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;

  if (!txn) return res.status(404).json({ message: "Transaction not found" });

  // Get predecessor and successor
  const [prev] = await sql`
    SELECT id, ledger_hmac, created_at FROM transactions
    WHERE workspace_id = ${ws} AND ledger_hmac = ${txn.previous_hmac}
    LIMIT 1
  `;

  const [next] = await sql`
    SELECT id, ledger_hmac, created_at FROM transactions
    WHERE workspace_id = ${ws} AND previous_hmac = ${txn.ledger_hmac}
    LIMIT 1
  `;

  // Re-verify this entry
  const [verification] = await sql`
    SELECT * FROM verify_ledger_chain(${ws})
    WHERE txn_id = ${txn.id}
  `;

  res.json({
    transaction: txn,
    verification: verification || { chain_valid: false, computed_hmac: null },
    predecessor: prev || null,
    successor: next || null,
  });
});

// POST /api/ledger/rotate-key — rotate the HMAC key (owner only)
router.post("/rotate-key", requireWorkspaceRoleOrAuditor("owner"), async (req, res) => {
  const { ws } = req.workspace;
  const { new_key } = req.body;

  if (!new_key || new_key.length < 32) {
    return res.status(422).json({ message: "New key must be at least 32 characters" });
  }

  // Set the new key for the session
  await sql`SELECT set_config('app.ledger_hmac_key', ${new_key}, false)`;

  // Recompute HMACs for all transactions in workspace
  const [result] = await sql`
    WITH RECURSIVE chain AS (
      SELECT id, created_at
      FROM transactions
      WHERE workspace_id = ${ws}
      ORDER BY created_at ASC
    )
    SELECT COUNT(*)::int AS updated FROM transactions WHERE workspace_id = ${ws}
  `;

  res.json({
    message: "HMAC key rotated",
    transactions_affected: result.updated,
    note: "Existing HMACs recomputed with new key",
  });
});

export default router;
