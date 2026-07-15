import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// GET /api/cashflow/projection — 30/60/90 day cash flow forecast
router.get("/projection", async (req, res) => {
  const { ws } = req.workspace;
  const { scenario } = req.query; // 'expected' | 'worst_case' | 'best_case'

  // Current balance across all accounts
  const [currentState] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN a.type != 'credit_card' AND a.include_in_assets THEN b.current_balance ELSE 0 END), 0)::bigint AS total_assets,
      COALESCE(SUM(CASE WHEN a.type = 'credit_card' THEN ABS(b.current_balance) ELSE 0 END), 0)::bigint AS total_liabilities
    FROM accounts a
    LEFT JOIN account_balances b ON b.account_id = a.id
    WHERE a.workspace_id = ${ws} AND a.archived_at IS NULL
  `;

  const netCash = Number(currentState.total_assets) - Number(currentState.total_liabilities);

  // Upcoming income in 30/60/90 day windows
  const incomeBuckets = await sql`
    SELECT
      SUM(CASE WHEN occurred_on <= CURRENT_DATE + INTERVAL '30 days' THEN amount_minor ELSE 0 END)::bigint AS next_30,
      SUM(CASE WHEN occurred_on > CURRENT_DATE + INTERVAL '30 days' AND occurred_on <= CURRENT_DATE + INTERVAL '60 days' THEN amount_minor ELSE 0 END)::bigint AS next_60,
      SUM(CASE WHEN occurred_on > CURRENT_DATE + INTERVAL '60 days' AND occurred_on <= CURRENT_DATE + INTERVAL '90 days' THEN amount_minor ELSE 0 END)::bigint AS next_90
    FROM recurring_transactions
    WHERE workspace_id = ${ws}
      AND is_active = true
      AND txn_type = 'income'
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  `;

  // Upcoming expenses in same windows
  const expenseBuckets = await sql`
    SELECT
      SUM(CASE WHEN occurred_on <= CURRENT_DATE + INTERVAL '30 days' THEN amount_minor ELSE 0 END)::bigint AS next_30,
      SUM(CASE WHEN occurred_on > CURRENT_DATE + INTERVAL '30 days' AND occurred_on <= CURRENT_DATE + INTERVAL '60 days' THEN amount_minor ELSE 0 END)::bigint AS next_60,
      SUM(CASE WHEN occurred_on > CURRENT_DATE + INTERVAL '60 days' AND occurred_on <= CURRENT_DATE + INTERVAL '90 days' THEN amount_minor ELSE 0 END)::bigint AS next_90
    FROM recurring_transactions
    WHERE workspace_id = ${ws}
      AND is_active = true
      AND txn_type = 'expense'
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  `;

  // Overdue receivables (unpaid invoices past due)
  const [overdueReceivables] = await sql`
    SELECT COALESCE(SUM(amount_minor - COALESCE(paid_amount_minor, 0)), 0)::bigint AS total
    FROM transactions
    WHERE workspace_id = ${ws}
      AND txn_type = 'income'
      AND is_staged = false
      AND is_rejected = false
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
      AND (payment_status IS NULL OR payment_status IN ('unpaid', 'partial'))
  `;

  // Average payment collection time from audit trail
  const [paymentHistory] = await sql`
    SELECT
      COALESCE(
        EXTRACT(EPOCH FROM AVG(approve_time))::bigint, 0
      ) AS avg_collection_seconds
    FROM (
      SELECT MIN(a2.created_at) - MIN(a1.created_at) AS approve_time
      FROM transactions t
      JOIN transaction_audit a1 ON a1.transaction_id = t.id AND a1.action = 'INSERT'
      JOIN transaction_audit a2 ON a2.transaction_id = t.id AND a2.action IN ('UPDATE')
      WHERE t.workspace_id = ${ws}
        AND t.is_staged = false
      GROUP BY t.id
    ) sub
  `;

  const avgCollectionDays = Math.round(Number(paymentHistory.avg_collection_seconds) / 86400);

  // Build scenario-adjusted projections
  const scenarios = {
    expected: {
      collection_rate: 0.85,
      expense_rate: 1.0,
    },
    best_case: {
      collection_rate: 0.95,
      expense_rate: 0.9,
    },
    worst_case: {
      collection_rate: 0.6,
      expense_rate: 1.1,
    },
  };

  const activeScenario = scenario && scenarios[scenario] ? scenario : "expected";
  const params = scenarios[activeScenario];

  const income30 = Number(incomeBuckets[0]?.next_30 || 0) * params.collection_rate;
  const income60 = Number(incomeBuckets[0]?.next_60 || 0) * params.collection_rate;
  const income90 = Number(incomeBuckets[0]?.next_90 || 0) * params.collection_rate;
  const expense30 = Number(expenseBuckets[0]?.next_30 || 0) * params.expense_rate;
  const expense60 = Number(expenseBuckets[0]?.next_60 || 0) * params.expense_rate;
  const expense90 = Number(expenseBuckets[0]?.next_90 || 0) * params.expense_rate;

  const projection30 = netCash + income30 - expense30 + Number(overdueReceivables.total) * params.collection_rate * 0.5;
  const projection60 = projection30 + income60 - expense60 + Number(overdueReceivables.total) * params.collection_rate * 0.3;
  const projection90 = projection60 + income90 - expense90 + Number(overdueReceivables.total) * params.collection_rate * 0.2;

  const projections = [
    { days: 0, label: "Today", amount_cents: netCash },
    { days: 30, label: "30 Days", amount_cents: Math.round(projection30) },
    { days: 60, label: "60 Days", amount_cents: Math.round(projection60) },
    { days: 90, label: "90 Days", amount_cents: Math.round(projection90) },
  ];

  // Store projection
  const today = new Date().toISOString().slice(0, 10);
  for (const p of projections) {
    if (p.days === 0) continue;
    const projDate = new Date();
    projDate.setDate(projDate.getDate() + p.days);
    await sql`
      INSERT INTO cash_flow_projections (workspace_id, user_id, projection_date, projected_balance_minor, confidence, scenario_notes)
      VALUES (${ws}, ${req.user.userId}, ${projDate.toISOString().slice(0, 10)}, ${p.amount_cents}, ${activeScenario}, ${null})
      ON CONFLICT DO NOTHING
    `;
  }

  res.json({
    current_net_cash: netCash,
    scenario: activeScenario,
    projections,
    breakdown: {
      recurring_income_30: Math.round(income30),
      recurring_expense_30: Math.round(expense30),
      overdue_receivables: Number(overdueReceivables.total),
      avg_collection_days: avgCollectionDays,
    },
  });
});

// GET /api/cashflow/history — past projection accuracy
router.get("/history", async (req, res) => {
  const { ws } = req.workspace;

  const history = await sql`
    SELECT projection_date, projected_balance_minor, confidence, created_at
    FROM cash_flow_projections
    WHERE workspace_id = ${ws}
    ORDER BY projection_date DESC
    LIMIT 30
  `;

  res.json({ history });
});

// GET /api/cashflow/aging-breakdown — detailed aging of receivables/payables
router.get("/aging-breakdown", async (req, res) => {
  const { ws } = req.workspace;
  const { direction = "receivable" } = req.query; // 'receivable' or 'payable'

  const txnFilter = direction === "receivable" ? "income" : "expense";

  const buckets = await sql`
    SELECT
      CASE
        WHEN due_date IS NULL THEN 'no_due_date'
        WHEN due_date >= CURRENT_DATE THEN 'current'
        WHEN due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1-30 days'
        WHEN due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60 days'
        WHEN due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61-90 days'
        ELSE '90+ days'
      END AS bucket,
      COUNT(*)::int AS count,
      SUM(amount_minor - COALESCE(paid_amount_minor, 0))::bigint AS total_remaining
    FROM transactions
    WHERE workspace_id = ${ws}
      AND txn_type = ${txnFilter}
      AND is_staged = false
      AND is_rejected = false
      AND (payment_status IS NULL OR payment_status IN ('unpaid', 'partial'))
    GROUP BY bucket
    ORDER BY MIN(CASE
      WHEN due_date IS NULL THEN '9999-12-31'
      WHEN due_date >= CURRENT_DATE THEN '0001-01-01'
      WHEN due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '0001-01-02'
      WHEN due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '0001-01-03'
      WHEN due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '0001-01-04'
      ELSE '0001-01-05'
    END)
  `;

  const totalOutstanding = buckets.reduce((s, b) => s + Number(b.total_remaining), 0);

  res.json({ direction, buckets, total_outstanding: totalOutstanding });
});

export default router;
