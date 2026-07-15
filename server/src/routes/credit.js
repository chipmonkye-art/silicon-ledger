import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";
import { requireWorkspaceRole } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// Check credit limit before creating a transaction (used by client on save)
router.post("/check", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id, amount_minor, txn_type, exclude_transaction_id } = req.body;

  if (!account_id || !amount_minor || !txn_type) {
    return res.status(422).json({ message: "account_id, amount_minor, txn_type required" });
  }

  const [account] = await sql`
    SELECT id, name, credit_limit, credit_limit_type, credit_used_minor
    FROM accounts WHERE id = ${account_id} AND workspace_id = ${ws}
  `;

  if (!account) return res.status(404).json({ message: "Account not found" });
  if (!account.credit_limit) return res.json({ allowed: true, message: "No credit limit set" });

  // Calculate current credit usage for this account
  const [usage] = await sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN txn_type = 'income' THEN amount_minor
        WHEN txn_type = 'expense' THEN amount_minor
        WHEN txn_type = 'transfer' AND account_id = ${account_id} THEN amount_minor
        ELSE 0
      END
    ), 0)::bigint AS used
    FROM transactions
    WHERE workspace_id = ${ws}
      AND account_id = ${account_id}
      AND is_staged = false
      AND is_rejected = false
  `;

  let currentUsage = Number(usage.used);
  if (exclude_transaction_id) {
    const [exclude] = await sql`
      SELECT amount_minor FROM transactions WHERE id = ${exclude_transaction_id}
    `;
    if (exclude) currentUsage = Math.max(0, currentUsage - exclude.amount_minor);
  }

  const newTotal = currentUsage + Math.abs(Math.round(amount_minor));
  const limit = account.credit_limit;
  const isOverLimit = newTotal > limit;
  const usagePct = limit > 0 ? Math.round((newTotal / limit) * 100) : 0;

  if (isOverLimit && account.credit_limit_type === "hard") {
    return res.json({
      allowed: false,
      block: true,
      limit_type: "hard",
      credit_limit: limit,
      current_usage: currentUsage,
      would_be: newTotal,
      usage_pct: usagePct,
      message: `Hard credit limit of $${(limit / 100).toFixed(2)} exceeded`,
    });
  }

  if (isOverLimit && account.credit_limit_type === "soft") {
    return res.json({
      allowed: true,
      warning: true,
      limit_type: "soft",
      credit_limit: limit,
      current_usage: currentUsage,
      would_be: newTotal,
      usage_pct: usagePct,
      message: `Soft credit limit of $${(limit / 100).toFixed(2)} exceeded — requires manager override`,
    });
  }

  res.json({
    allowed: true,
    limit_type: account.credit_limit_type || "none",
    credit_limit: limit,
    current_usage: currentUsage,
    would_be: newTotal,
    usage_pct: usagePct,
  });
});

// Set credit limit on an account
router.put("/limits/:accountId", requireWorkspaceRole("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { credit_limit, credit_limit_type } = req.body;

  if (credit_limit !== null && (typeof credit_limit !== "number" || credit_limit < 0)) {
    return res.status(422).json({ message: "credit_limit must be a non-negative integer (cents)" });
  }
  if (credit_limit_type && !["soft", "hard"].includes(credit_limit_type)) {
    return res.status(422).json({ message: "credit_limit_type must be 'soft' or 'hard'" });
  }

  const [account] = await sql`
    UPDATE accounts SET
      credit_limit = ${credit_limit != null ? Math.round(credit_limit) : null},
      credit_limit_type = ${credit_limit_type || null}
    WHERE id = ${req.params.accountId} AND workspace_id = ${ws}
    RETURNING id, name, credit_limit, credit_limit_type
  `;

  if (!account) return res.status(404).json({ message: "Account not found" });
  res.json({ account });
});

// Record a credit override (manager approves exceeding soft limit)
router.post("/override", requireWorkspaceRole("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { userId } = req.user;
  const { account_id, transaction_id, override_type, reason } = req.body;

  if (!account_id || !override_type) {
    return res.status(422).json({ message: "account_id, override_type required" });
  }
  if (!["hard_limit", "soft_limit", "credit_freeze"].includes(override_type)) {
    return res.status(422).json({ message: "Invalid override_type" });
  }

  const [override] = await sql`
    INSERT INTO credit_overrides (workspace_id, user_id, account_id, transaction_id, override_type, reason)
    VALUES (${ws}, ${userId}, ${account_id}, ${transaction_id || null}, ${override_type}, ${reason || null})
    RETURNING *
  `;

  res.status(201).json({ override });
});

// Get credit status for all accounts
router.get("/status", async (req, res) => {
  const { ws } = req.workspace;

  const accounts = await sql`
    SELECT id, name, type, credit_limit, credit_limit_type, credit_used_minor,
      COALESCE(b.current_balance, opening_balance) AS current_balance
    FROM accounts a
    LEFT JOIN account_balances b ON b.account_id = a.id
    WHERE a.workspace_id = ${ws} AND a.credit_limit IS NOT NULL
    ORDER BY a.name
  `;

  const enriched = accounts.map((a) => {
    const limit = a.credit_limit || 0;
    const usage = Math.abs(Number(a.current_balance));
    return {
      ...a,
      credit_remaining: Math.max(0, limit - usage),
      usage_pct: limit > 0 ? Math.round((usage / limit) * 100) : 0,
      is_over_limit: limit > 0 && usage > limit,
    };
  });

  res.json({ accounts: enriched });
});

// Invoice lifecycle: get outstanding invoices
router.get("/outstanding", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id, days_overdue } = req.query;

  let query = sql`
    SELECT t.*, a.name AS account_name,
      CASE
        WHEN t.due_date IS NULL THEN NULL
        WHEN t.due_date < CURRENT_DATE THEN 'overdue'
        WHEN t.due_date = CURRENT_DATE THEN 'due_today'
        ELSE 'pending'
      END AS aging_status,
      CASE
        WHEN t.due_date IS NOT NULL THEN (CURRENT_DATE - t.due_date)
        ELSE NULL
      END AS days_overdue
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.workspace_id = ${ws}
      AND t.txn_type IN ('income', 'expense')
      AND t.is_staged = false
      AND t.is_rejected = false
      AND (t.payment_status IS NULL OR t.payment_status IN ('unpaid', 'partial'))
  `;

  if (account_id) query = sql`${query} AND t.account_id = ${account_id}`;
  if (days_overdue) query = sql`${query} AND t.due_date < CURRENT_DATE - ${Number(days_overdue)}::integer`;

  query = sql`${query} ORDER BY t.due_date ASC NULLS LAST, t.occurred_on DESC`;

  const invoices = await query;

  const summary = {
    total_outstanding: invoices.reduce((s, i) => s + i.amount_minor, 0),
    total_overdue: invoices.filter((i) => i.aging_status === "overdue").reduce((s, i) => s + i.amount_minor, 0),
    count: invoices.length,
    overdue_count: invoices.filter((i) => i.aging_status === "overdue").length,
  };

  res.json({ invoices, summary });
});

// Match a payment to an invoice (partial payment settlement)
router.post("/match-payment", requireWorkspaceRole("owner", "manager", "staff"), async (req, res) => {
  const { ws } = req.workspace;
  const { invoice_id, payment_id, amount_minor } = req.body;

  if (!invoice_id || !payment_id || !amount_minor) {
    return res.status(422).json({ message: "invoice_id, payment_id, amount_minor required" });
  }

  const [invoice] = await sql`
    SELECT id, amount_minor, paid_amount_minor FROM transactions
    WHERE id = ${invoice_id} AND workspace_id = ${ws}
  `;
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });

  const paidSoFar = invoice.paid_amount_minor || 0;
  const newPaid = paidSoFar + Math.abs(Math.round(amount_minor));
  const totalDue = invoice.amount_minor;

  let paymentStatus = "partial";
  if (newPaid >= totalDue) paymentStatus = "paid";
  if (newPaid > totalDue) paymentStatus = "overpaid";

  await sql`
    UPDATE transactions SET
      paid_amount_minor = ${newPaid},
      payment_status = ${paymentStatus},
      payment_matched_transaction_id = COALESCE(payment_matched_transaction_id, ${payment_id})
    WHERE id = ${invoice_id}
  `;

  res.json({ invoice_id, paid: newPaid, total: totalDue, status: paymentStatus });
});

// MSME compliance check — flag invoices exceeding statutory 45-day credit
router.get("/msme-check", async (req, res) => {
  const { ws } = req.workspace;

  const msmeInvoices = await sql`
    SELECT t.id, t.bill_reference, t.description, t.amount_minor, t.occurred_on,
      t.due_date, t.msme_credit_days, a.name AS account_name,
      (CURRENT_DATE - t.due_date) AS days_past_due
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.workspace_id = ${ws}
      AND t.is_msme_record = true
      AND t.due_date IS NOT NULL
      AND t.due_date < CURRENT_DATE
      AND (t.payment_status IS NULL OR t.payment_status IN ('unpaid', 'partial'))
    ORDER BY t.due_date ASC
  `;

  const flagged = msmeInvoices.filter((i) => Number(i.days_past_due) > 45);

  res.json({
    total_msme: msmeInvoices.length,
    flagged_violations: flagged.length,
    invoices: msmeInvoices,
    flagged,
  });
});

export default router;
