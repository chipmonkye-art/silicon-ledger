import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";
import { requireWorkspaceRole } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

function validate(body) {
  const errors = [];
  if (!body.account_id) errors.push("account_id is required");
  if (!body.txn_type) errors.push("txn_type is required");
  if (!["income", "expense", "transfer"].includes(body.txn_type)) {
    errors.push("txn_type must be 'income', 'expense', or 'transfer'");
  }
  if (body.amount_minor == null || typeof body.amount_minor !== "number" || body.amount_minor <= 0) {
    errors.push("amount_minor must be a positive integer (cents)");
  }
  if (!body.description) errors.push("description is required");
  if (!body.occurred_on) errors.push("occurred_on (date) is required");

  if (body.txn_type === "transfer") {
    if (!body.to_account_id) errors.push("Transfer requires to_account_id");
    if (body.category_id) errors.push("Transfers cannot have categories");
    if (body.to_account_id === body.account_id) errors.push("Cannot transfer to the same account");
  } else {
    if (!body.category_id) errors.push("category_id is required for income/expense");
    if (body.to_account_id) errors.push("Non-transfer transactions cannot have to_account_id");
  }
  return errors;
}

router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id, category_id, txn_type, is_staged, search, limit = 50, offset = 0 } = req.query;

  let query = sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.workspace_id = ${ws}
  `;

  if (account_id) query = sql`${query} AND (t.account_id = ${account_id} OR t.to_account_id = ${account_id})`;
  if (category_id) query = sql`${query} AND t.category_id = ${category_id}`;
  if (txn_type) query = sql`${query} AND t.txn_type = ${txn_type}`;
  if (is_staged !== undefined) query = sql`${query} AND t.is_staged = ${is_staged === "true"}`;
  if (search) {
    const term = `%${search}%`;
    query = sql`${query} AND (t.description ILIKE ${term} OR t.note ILIKE ${term})`;
  }

  query = sql`${query} ORDER BY t.occurred_on DESC, t.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const transactions = await query;

  const [totalResult] = await sql`
    SELECT COUNT(*)::int AS total FROM transactions WHERE workspace_id = ${ws}
  `;

  res.json({ transactions, total: totalResult.total });
});

router.get("/summary", async (req, res) => {
  const { ws } = req.workspace;
  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const rows = await sql`
    SELECT txn_type, SUM(amount_minor) AS total
    FROM transactions
    WHERE workspace_id = ${ws}
      AND occurred_on >= ${startOfMonth}
      AND occurred_on <= ${endOfMonth}
      AND txn_type IN ('income', 'expense')
      AND is_staged = false
    GROUP BY txn_type
  `;

  const income = Number(rows.find((r) => r.txn_type === "income")?.total || 0);
  const expense = Number(rows.find((r) => r.txn_type === "expense")?.total || 0);
  const totalAssets = await sql`
    SELECT COALESCE(SUM(current_balance), 0) AS total FROM account_balances
    WHERE workspace_id = ${ws} AND include_in_assets = true AND account_type != 'credit_card'
  `;
  const netWorth = Number(totalAssets[0]?.total || 0);

  res.json({ month: { income, expense, balance: income - expense }, netWorth });
});

router.get("/staged", async (req, res) => {
  const { ws } = req.workspace;
  const staged = await sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.workspace_id = ${ws} AND t.is_staged = true
    ORDER BY t.occurred_on DESC, t.created_at DESC
  `;

  const income = staged.filter((t) => t.txn_type === "income").reduce((s, t) => s + Number(t.amount_minor), 0);
  const expense = staged.filter((t) => t.txn_type === "expense").reduce((s, t) => s + Number(t.amount_minor), 0);
  const transfers = staged.filter((t) => t.txn_type === "transfer").reduce((s, t) => s + Number(t.amount_minor), 0);

  res.json({ staged, summary: { income, expense, transfers, count: staged.length } });
});

router.post("/bulk-approve", requireWorkspaceRole("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(422).json({ message: "ids must be a non-empty array" });
  }

  const result = await sql`
    UPDATE transactions SET is_staged = false
    WHERE id = ANY(${ids}) AND workspace_id = ${ws} AND is_staged = true
    RETURNING id
  `;

  res.json({ approved: result.length });
});

router.post("/bulk-reject", requireWorkspaceRole("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { ids, rejection_note } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(422).json({ message: "ids must be a non-empty array" });
  }

  const note = rejection_note || "Incomplete data — please review";
  const result = await sql`
    UPDATE transactions SET
      is_staged = false,
      is_rejected = true,
      rejection_note = ${note}
    WHERE id = ANY(${ids}) AND workspace_id = ${ws} AND is_staged = true
    RETURNING id
  `;

  res.json({ rejected: result.length });
});

router.get("/calendar", async (req, res) => {
  const { ws } = req.workspace;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const year = parseInt(month.slice(0, 4));
  const monthNum = parseInt(month.slice(5, 7));
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);

  const transactions = await sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.workspace_id = ${ws}
      AND t.occurred_on >= ${startDate}
      AND t.occurred_on <= ${endDate}
    ORDER BY t.occurred_on, t.created_at
  `;

  const income = transactions
    .filter((t) => t.txn_type === "income" && !t.is_staged)
    .reduce((s, t) => s + Number(t.amount_minor), 0);
  const expense = transactions
    .filter((t) => t.txn_type === "expense" && !t.is_staged)
    .reduce((s, t) => s + Number(t.amount_minor), 0);

  const [carryoverResult] = await sql`
    SELECT COALESCE(SUM(current_balance), 0) AS current_total
    FROM account_balances
    WHERE workspace_id = ${ws} AND include_in_assets = true AND account_type != 'credit_card'
  `;
  const currentNetWorth = Number(carryoverResult.current_total);
  const carryover = currentNetWorth - income + expense;

  res.json({
    transactions,
    carryover,
    totals: { income, expense, balance: income - expense },
  });
});

router.get("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [txn] = await sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.id = ${req.params.id} AND t.workspace_id = ${ws}
  `;
  if (!txn) return res.status(404).json({ message: "Transaction not found" });
  res.json({ transaction: txn });
});

router.post("/", async (req, res) => {
  const { ws } = req.workspace;
  const errors = validate(req.body);
  if (errors.length > 0) {
    return res.status(422).json({ message: "Validation failed", errors });
  }

  const { account_id, to_account_id, category_id, txn_type, amount_minor, currency, occurred_on, description, note } = req.body;

  const [txn] = await sql`
    INSERT INTO transactions (user_id, workspace_id, account_id, to_account_id, category_id, txn_type, amount_minor, currency, occurred_on, description, note)
    VALUES (${req.user.userId}, ${ws}, ${account_id}, ${to_account_id || null}, ${category_id || null}, ${txn_type}, ${Math.round(amount_minor)}, ${currency || "USD"}, ${occurred_on}, ${description}, ${note || ""})
    RETURNING *
  `;

  res.status(201).json({ transaction: txn });
});

router.put("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [existing] = await sql`
    SELECT * FROM transactions WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!existing) return res.status(404).json({ message: "Transaction not found" });

  const { amount_minor, description, category_id, account_id, note } = req.body;

  const [txn] = await sql`
    UPDATE transactions SET
      amount_minor = COALESCE(${amount_minor != null ? Math.round(amount_minor) : null}, amount_minor),
      description = COALESCE(${description}, description),
      category_id = COALESCE(${category_id}, category_id),
      account_id = COALESCE(${account_id}, account_id),
      note = COALESCE(${note}, note)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;

  res.json({ transaction: txn });
});

router.post("/:id/approve", requireWorkspaceRole("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const [txn] = await sql`
    UPDATE transactions SET is_staged = false
    WHERE id = ${req.params.id} AND workspace_id = ${ws} AND is_staged = true
    RETURNING *
  `;
  if (!txn) return res.status(404).json({ message: "Staged transaction not found" });
  res.json({ transaction: txn });
});

router.post("/:id/reject", requireWorkspaceRole("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { rejection_note } = req.body;
  const [txn] = await sql`
    UPDATE transactions SET
      is_staged = false,
      is_rejected = true,
      rejection_note = COALESCE(${rejection_note}, rejection_note, 'Sent back for correction')
    WHERE id = ${req.params.id} AND workspace_id = ${ws} AND is_staged = true
    RETURNING *
  `;
  if (!txn) return res.status(404).json({ message: "Staged transaction not found" });
  res.json({ transaction: txn, message: "Transaction sent back for correction" });
});

router.post("/:id/resubmit", async (req, res) => {
  const { ws } = req.workspace;
  const { amount_minor, description, category_id, note } = req.body;

  const [txn] = await sql`
    UPDATE transactions SET
      is_staged = true,
      is_rejected = false,
      rejection_note = null,
      amount_minor = COALESCE(${amount_minor != null ? Math.round(amount_minor) : null}, amount_minor),
      description = COALESCE(${description}, description),
      category_id = COALESCE(${category_id}, category_id),
      note = COALESCE(${note}, note)
    WHERE id = ${req.params.id} AND workspace_id = ${ws} AND is_rejected = true
    RETURNING *
  `;
  if (!txn) return res.status(404).json({ message: "Rejected transaction not found" });
  res.json({ transaction: txn, message: "Transaction resubmitted for approval" });
});

export default router;
