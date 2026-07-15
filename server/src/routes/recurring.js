import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

const VALID_INTERVALS = ["daily", "weekly", "monthly", "yearly", "custom"];

router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const templates = await sql`
    SELECT rt.*, a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
    FROM recurring_transactions rt
    LEFT JOIN accounts a ON a.id = rt.account_id
    LEFT JOIN accounts a2 ON a2.id = rt.to_account_id
    LEFT JOIN categories c ON c.id = rt.category_id
    WHERE rt.workspace_id = ${ws}
    ORDER BY rt.start_date
  `;

  const intervalLabels = {
    daily: (v) => (v === 1 ? "Daily" : `Every ${v} days`),
    weekly: (v) => (v === 1 ? "Weekly" : `Every ${v} weeks`),
    monthly: (v) => (v === 1 ? "Monthly" : `Every ${v} months`),
    yearly: (v) => (v === 1 ? "Yearly" : `Every ${v} years`),
    custom: (v) => `Every ${v || "?"} days`,
  };

  const grouped = {};
  for (const t of templates) {
    const label = intervalLabels[t.interval_type]?.(t.interval_days) || t.interval_type;
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(t);
  }

  res.json({ templates, grouped });
});

router.get("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [template] = await sql`
    SELECT rt.*, a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
    FROM recurring_transactions rt
    LEFT JOIN accounts a ON a.id = rt.account_id
    LEFT JOIN accounts a2 ON a2.id = rt.to_account_id
    LEFT JOIN categories c ON c.id = rt.category_id
    WHERE rt.id = ${req.params.id} AND rt.workspace_id = ${ws}
  `;
  if (!template) return res.status(404).json({ message: "Recurring template not found" });
  res.json({ template });
});

router.post("/", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id, to_account_id, category_id, txn_type, amount_minor, currency, description, note, interval_type, interval_days, start_date, end_date, occurrences_remaining } = req.body;

  if (!account_id || !txn_type || !amount_minor || !interval_type || !start_date) {
    return res.status(422).json({ message: "account_id, txn_type, amount_minor, interval_type, and start_date are required" });
  }
  if (!VALID_INTERVALS.includes(interval_type)) {
    return res.status(422).json({ message: `Invalid interval_type. Must be one of: ${VALID_INTERVALS.join(", ")}` });
  }
  if (interval_type === "custom" && (!interval_days || interval_days <= 0)) {
    return res.status(422).json({ message: "custom interval requires interval_days > 0" });
  }
  if (txn_type === "transfer" && !to_account_id) {
    return res.status(422).json({ message: "Transfer requires to_account_id" });
  }
  if (txn_type !== "transfer" && !category_id) {
    return res.status(422).json({ message: "category_id is required for income/expense" });
  }

  const [template] = await sql`
    INSERT INTO recurring_transactions (user_id, workspace_id, account_id, to_account_id, category_id, txn_type, amount_minor, currency, description, note, interval_type, interval_days, start_date, end_date, occurrences_remaining)
    VALUES (${req.user.userId}, ${ws}, ${account_id}, ${to_account_id || null}, ${category_id || null}, ${txn_type}, ${Math.round(amount_minor)}, ${currency || "USD"}, ${description || ""}, ${note || ""}, ${interval_type}, ${interval_type === "custom" ? interval_days : null}, ${start_date}, ${end_date || null}, ${occurrences_remaining || null})
    RETURNING *
  `;
  res.status(201).json({ template });
});

router.put("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const { amount_minor, description, category_id, account_id, to_account_id, interval_type, interval_days, end_date, occurrences_remaining, is_active } = req.body;

  const [template] = await sql`
    UPDATE recurring_transactions SET
      amount_minor = COALESCE(${amount_minor != null ? Math.round(amount_minor) : null}, amount_minor),
      description = COALESCE(${description}, description),
      category_id = COALESCE(${category_id}, category_id),
      account_id = COALESCE(${account_id}, account_id),
      to_account_id = COALESCE(${to_account_id}, to_account_id),
      interval_type = COALESCE(${interval_type}, interval_type),
      interval_days = COALESCE(${interval_type === "custom" ? interval_days : null}, interval_days),
      end_date = COALESCE(${end_date}, end_date),
      occurrences_remaining = COALESCE(${occurrences_remaining != null ? occurrences_remaining : null}, occurrences_remaining),
      is_active = COALESCE(${is_active != null ? is_active : null}, is_active)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!template) return res.status(404).json({ message: "Recurring template not found" });
  res.json({ template });
});

router.delete("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [template] = await sql`
    DELETE FROM recurring_transactions WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING id
  `;
  if (!template) return res.status(404).json({ message: "Recurring template not found" });
  res.status(204).end();
});

export default router;
