import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware);

function enforceFinancialRules(body) {
  const errors = [];
  if (!body.account_id) errors.push("account_id is required");
  if (!body.type) errors.push("type is required");
  if (!body.amount || body.amount <= 0) errors.push("amount must be a positive integer (cents)");
  if (!body.description) errors.push("description is required");

  if (body.type === "transfer") {
    if (!body.to_account_id) errors.push("Transfer requires to_account_id");
    if (body.category) errors.push("Transfers cannot have categories");
    if (body.to_account_id === body.account_id) errors.push("Cannot transfer to the same account");
  } else {
    if (!body.project_id) errors.push("project_id is required for income/expense");
  }

  return errors;
}

router.get("/", async (req, res) => {
  const { project_id, account_id, type, is_staged, limit = 50, offset = 0 } = req.query;
  let query = sql`SELECT t.*, a.name AS account_name, a2.name AS to_account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    WHERE 1=1`;
  if (project_id) query = sql`${query} AND t.project_id = ${project_id}`;
  if (account_id) query = sql`${query} AND (t.account_id = ${account_id} OR t.to_account_id = ${account_id})`;
  if (type) query = sql`${query} AND t.type = ${type}`;
  if (is_staged !== undefined) query = sql`${query} AND t.is_staged = ${is_staged === "true"}`;
  query = sql`${query} ORDER BY t.date DESC, t.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const transactions = await query;
  res.json({ transactions });
});

router.get("/summary", async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const rows = await sql`
    SELECT type, SUM(amount) AS total
    FROM transactions
    WHERE created_by = ${req.user.userId}
      AND date >= ${startOfMonth}
      AND date <= ${endOfMonth}
      AND type IN ('income', 'expense')
      AND is_staged = false
    GROUP BY type
  `;

  const income = Number(rows.find((r) => r.type === "income")?.total || 0);
  const expense = Number(rows.find((r) => r.type === "expense")?.total || 0);

  res.json({ month: { income, expense, balance: income - expense } });
});

router.get("/staged", async (req, res) => {
  const staged = await sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    WHERE t.created_by = ${req.user.userId} AND t.is_staged = true
    ORDER BY t.date DESC, t.created_at DESC
  `;

  const income = staged.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = staged.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const transfers = staged.filter((t) => t.type === "transfer").reduce((s, t) => s + Number(t.amount), 0);

  res.json({
    staged,
    summary: { income, expense, transfers, count: staged.length },
  });
});

router.post("/bulk-approve", requireRole("finance"), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(422).json({ message: "ids must be a non-empty array" });
  }

  const result = await sql`
    UPDATE transactions SET is_staged = false, approved_by = ${req.user.userId}, approved_at = now()
    WHERE id = ANY(${ids}) AND is_staged = true
    RETURNING id
  `;

  for (const t of result) {
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, after_data)
      VALUES (${req.user.userId}, 'BULK_APPROVE', 'transactions', ${t.id}, jsonb_build_object('approved_by', ${req.user.userId}))
    `;
  }

  res.json({ approved: result.length });
});

router.post("/bulk-reject", requireRole("finance"), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(422).json({ message: "ids must be a non-empty array" });
  }

  const result = await sql`
    DELETE FROM transactions WHERE id = ANY(${ids}) AND is_staged = true RETURNING id
  `;

  for (const t of result) {
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, after_data)
      VALUES (${req.user.userId}, 'BULK_REJECT', 'transactions', ${t.id}, jsonb_build_object('reason', 'rejected'))
    `;
  }

  res.json({ rejected: result.length });
});

router.get("/calendar", async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const year = parseInt(month.slice(0, 4));
  const monthNum = parseInt(month.slice(5, 7));
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);

  const transactions = await sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    WHERE t.created_by = ${req.user.userId}
      AND t.date >= ${startDate}
      AND t.date <= ${endDate}
    ORDER BY t.date, t.created_at
  `;

  const monthIncome = transactions
    .filter((t) => t.type === "income" && !t.is_staged)
    .reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = transactions
    .filter((t) => t.type === "expense" && !t.is_staged)
    .reduce((s, t) => s + Number(t.amount), 0);

  const [carryoverResult] = await sql`
    SELECT COALESCE(SUM(current_balance), 0) AS current_total FROM account_balances
    WHERE user_id = ${req.user.userId} AND include_in_assets = true AND type != 'credit_card'
  `;
  const currentNetWorth = Number(carryoverResult.current_total);
  const carryover = currentNetWorth - monthIncome + monthExpense;

  res.json({
    transactions,
    carryover,
    totals: { income: monthIncome, expense: monthExpense, balance: monthIncome - monthExpense },
  });
});

router.get("/:id", async (req, res) => {
  const [txn] = await sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    WHERE t.id = ${req.params.id}
  `;
  if (!txn) return res.status(404).json({ message: "Transaction not found" });
  res.json({ transaction: txn });
});

router.post("/", async (req, res) => {
  const errors = enforceFinancialRules(req.body);
  if (errors.length > 0) {
    return res.status(422).json({ message: "Validation failed", errors });
  }

  const { project_id, account_id, to_account_id, type, amount, description, category, vendor_id, land_owner_id, date } = req.body;

  const [txn] = await sql`
    INSERT INTO transactions (project_id, account_id, to_account_id, type, amount, description, category, vendor_id, land_owner_id, date, created_by)
    VALUES (${project_id || null}, ${account_id}, ${to_account_id || null}, ${type}, ${Math.round(amount)}, ${description}, ${category || null}, ${vendor_id || null}, ${land_owner_id || null}, ${date || new Date()}, ${req.user.userId})
    RETURNING *
  `;

  res.status(201).json({ transaction: txn });
});

router.put("/:id", requireRole("finance"), async (req, res) => {
  const [existing] = await sql`SELECT * FROM transactions WHERE id = ${req.params.id}`;
  if (!existing) return res.status(404).json({ message: "Transaction not found" });

  const { amount, description, category, account_id } = req.body;

  const [txn] = await sql`
    UPDATE transactions SET
      amount = COALESCE(${amount != null ? Math.round(amount) : null}, amount),
      description = COALESCE(${description}, description),
      category = COALESCE(${category}, category),
      account_id = COALESCE(${account_id}, account_id),
      updated_at = now()
    WHERE id = ${req.params.id}
    RETURNING *
  `;

  res.json({ transaction: txn });
});

router.post("/:id/approve", requireRole("finance"), async (req, res) => {
  const [txn] = await sql`
    UPDATE transactions SET is_staged = false, approved_by = ${req.user.userId}, approved_at = now()
    WHERE id = ${req.params.id} RETURNING *
  `;
  if (!txn) return res.status(404).json({ message: "Transaction not found" });
  res.json({ transaction: txn });
});

router.post("/:id/reject", requireRole("finance"), async (req, res) => {
  const [txn] = await sql`
    DELETE FROM transactions WHERE id = ${req.params.id} AND is_staged = true RETURNING *
  `;
  if (!txn) return res.status(404).json({ message: "Staged transaction not found" });
  res.json({ message: "Transaction rejected and removed" });
});

export default router;
