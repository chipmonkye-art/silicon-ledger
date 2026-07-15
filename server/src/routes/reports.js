import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

async function convertToBase(rows, amountField, userId) {
  const [profile] = await sql`
    SELECT base_currency FROM profiles WHERE id = ${userId}
  `;
  const baseCurrency = profile?.base_currency || "USD";
  return rows.map((r) => {
    const currency = r.currency || "USD";
    if (currency === baseCurrency) {
      return { ...r, [amountField]: Number(r[amountField]) };
    }
    // Conversion happens on frontend via fx_rates; server returns raw values for now
    return { ...r, [amountField]: Number(r[amountField]), baseCurrency };
  });
}

async function convertValue(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  const [rate] = await sql`
    SELECT rate FROM fx_rates
    WHERE quote_currency = ${fromCurrency} AND base_currency = ${toCurrency}
  `;
  if (rate) return Math.round(amount * Number(rate.rate));
  const [inverse] = await sql`
    SELECT rate FROM fx_rates
    WHERE quote_currency = ${toCurrency} AND base_currency = ${fromCurrency}
  `;
  if (inverse) return Math.round(amount / Number(inverse.rate));
  return amount;
}

router.get("/category-breakdown", async (req, res) => {
  const { ws } = req.workspace;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const year = parseInt(month.slice(0, 4));
  const monthNum = parseInt(month.slice(5, 7));
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);

  const [profile] = await sql`
    SELECT base_currency FROM profiles WHERE id = ${req.user.userId}
  `;
  const baseCurrency = profile?.base_currency || "USD";

  const rows = await sql`
    SELECT c.id, c.name, t.currency, SUM(t.amount_minor) AS total
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.workspace_id = ${ws}
      AND t.txn_type = 'expense'
      AND t.is_staged = false
      AND t.occurred_on >= ${startDate}
      AND t.occurred_on <= ${endDate}
    GROUP BY c.id, c.name, t.currency
    ORDER BY c.name
  `;

  // Aggregate across currencies per category
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.id]) grouped[r.id] = { id: r.id, name: r.name, total: 0 };
    grouped[r.id].total += await convertValue(Number(r.total), r.currency || "USD", baseCurrency);
  }

  const cats = Object.values(grouped).sort((a, b) => b.total - a.total);
  const total = cats.reduce((s, r) => s + r.total, 0);
  const colors = [
    "#dc2626", "#2563eb", "#16a34a", "#d97706", "#8b5cf6",
    "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
  ];

  const categories = cats.map((r, i) => ({
    id: r.id,
    name: r.name,
    amount: r.total,
    pct: total > 0 ? Math.round((r.total / total) * 100) : 0,
    color: colors[i % colors.length],
  }));

  res.json({ categories, total });
});

router.get("/monthly-trends", async (req, res) => {
  const { ws } = req.workspace;
  const [profile] = await sql`
    SELECT base_currency FROM profiles WHERE id = ${req.user.userId}
  `;
  const baseCurrency = profile?.base_currency || "USD";

  const rows = await sql`
    SELECT
      to_char(occurred_on, 'YYYY-MM') AS month,
      txn_type,
      currency,
      SUM(amount_minor) AS total
    FROM transactions
    WHERE workspace_id = ${ws}
      AND is_staged = false
      AND occurred_on >= (CURRENT_DATE - INTERVAL '1 year')
    GROUP BY month, txn_type, currency
    ORDER BY month
  `;

  const map = {};
  for (const r of rows) {
    if (!map[r.month]) map[r.month] = { income: 0, expense: 0 };
    const converted = await convertValue(Number(r.total), r.currency || "USD", baseCurrency);
    if (r.txn_type === "income") map[r.month].income += converted;
    if (r.txn_type === "expense") map[r.month].expense += converted;
  }

  const trends = Object.entries(map).map(([month, vals]) => ({
    month,
    income: vals.income,
    expense: vals.expense,
    balance: vals.income - vals.expense,
  }));

  res.json({ trends });
});

router.get("/export", async (req, res) => {
  const { ws } = req.workspace;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const year = parseInt(month.slice(0, 4));
  const monthNum = parseInt(month.slice(5, 7));
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);
  const monthLabel = new Date(year, monthNum - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const [profile] = await sql`
    SELECT base_currency FROM profiles WHERE id = ${req.user.userId}
  `;
  const baseCurrency = profile?.base_currency || "USD";

  const [totals] = await sql`
    SELECT
      COALESCE(SUM(amount_minor) FILTER (WHERE txn_type = 'income'), 0) AS income,
      COALESCE(SUM(amount_minor) FILTER (WHERE txn_type = 'expense'), 0) AS expense
    FROM transactions
    WHERE workspace_id = ${ws} AND is_staged = false
      AND occurred_on >= ${startDate} AND occurred_on <= ${endDate}
  `;

  const rows = await sql`
    SELECT t.occurred_on AS date, t.description, t.txn_type AS type, t.amount_minor AS amount,
           t.currency, c.name AS category_name, a.name AS account_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.workspace_id = ${ws} AND t.is_staged = false
      AND t.occurred_on >= ${startDate} AND t.occurred_on <= ${endDate}
    ORDER BY t.occurred_on, t.created_at
  `;

  const convertedRows = await Promise.all(rows.map(async (r) => ({
    ...r,
    amount_converted: await convertValue(Number(r.amount), r.currency || "USD", baseCurrency),
  })));

  const income = await convertValue(Number(totals.income), "USD", baseCurrency);
  const expense = await convertValue(Number(totals.expense), "USD", baseCurrency);
  const balance = income - expense;

  const fmtCents = (cents) =>
    (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

  const rowsHtml = convertedRows
    .map((r) => {
      const amt = r.amount_converted;
      const isIncome = r.type === "income";
      const isExpense = r.type === "expense";
      const label = r.currency !== baseCurrency ? ` (${r.currency})` : "";
      return `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-family:'JetBrains Mono',monospace;font-size:12px">${r.date}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px">${r.description} <span style="color:#999;font-size:10px">${r.category_name || ""}${label}</span></td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:#16a34a">${isIncome ? `+$${fmtCents(amt)}` : ""}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:#dc2626">${isExpense ? `-$${fmtCents(amt)}` : ""}</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${monthLabel} Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap');
  body { font-family: Inter, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; }
  h1 { font-size: 20px; margin: 0; }
  .sub { color: #666; font-size: 12px; margin-top: 4px; }
  .summary { display: flex; gap: 20px; margin: 24px 0; }
  .card { flex:1; border:1px solid #e5e5e5; border-radius:12px; padding:16px; }
  .card p { margin:0; font-size:11px; color:#666; text-transform:uppercase; letter-spacing:0.05em; }
  .card .num { font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:700; margin-top:4px; }
  table { width:100%; border-collapse:collapse; margin-top: 24px; }
  th { text-align:left; padding:6px 12px; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#666; border-bottom:2px solid #1a1a1a; }
  td { padding:6px 12px; border-bottom:1px solid #eee; font-size:12px; }
  .footer { text-align:center; margin-top:32px; font-size:10px; color:#999; }
</style>
</head>
<body>
  <h1>${monthLabel} Ledger Summary</h1>
  <p class="sub">Generated ${new Date().toISOString().slice(0, 10)}</p>
  <div class="summary">
    <div class="card"><p>Income</p><div class="num" style="color:#16a34a">+$${fmtCents(income)}</div></div>
    <div class="card"><p>Expense</p><div class="num" style="color:#dc2626">-$${fmtCents(expense)}</div></div>
    <div class="card"><p>Balance</p><div class="num" style="color:${balance >= 0 ? "#16a34a" : "#dc2626"}">${balance >= 0 ? "+" : "-"}$${fmtCents(Math.abs(balance))}</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Credit</th><th style="text-align:right">Debit</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Silicon Ledger — Account Manager Report</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

router.get("/aging", async (req, res) => {
  const { ws } = req.workspace;

  const rows = await sql`
    SELECT
      CASE
        WHEN occurred_on >= CURRENT_DATE - INTERVAL '30 days' THEN '0-30 days'
        WHEN occurred_on >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60 days'
        WHEN occurred_on >= CURRENT_DATE - INTERVAL '90 days' THEN '61-90 days'
        ELSE '90+ days'
      END AS bucket,
      txn_type,
      COUNT(*)::int AS count,
      SUM(amount_minor) AS total
    FROM transactions
    WHERE workspace_id = ${ws}
      AND (is_staged = true OR is_rejected = true)
      AND occurred_on < CURRENT_DATE
    GROUP BY bucket, txn_type
    ORDER BY MIN(occurred_on)
  `;

  const buckets = {};
  for (const r of rows) {
    if (!buckets[r.bucket]) {
      buckets[r.bucket] = { bucket: r.bucket, income: 0, expense: 0, count: 0 };
    }
    if (r.txn_type === "income") buckets[r.bucket].income += Number(r.total);
    if (r.txn_type === "expense") buckets[r.bucket].expense += Number(r.total);
    buckets[r.bucket].count += r.count;
  }

  const order = ["0-30 days", "31-60 days", "61-90 days", "90+ days"];
  const aging = order.map((b) => buckets[b] || { bucket: b, income: 0, expense: 0, count: 0 });

  res.json({ aging });
});

router.get("/payment-performance", async (req, res) => {
  const { ws } = req.workspace;

  // Average time between CREATE and APPROVE for approved staged transactions
  const [result] = await sql`
    SELECT
      COALESCE(
        EXTRACT(EPOCH FROM AVG(approve_time))::bigint,
        0
      ) AS avg_approval_seconds,
      COUNT(*)::int AS approved_count
    FROM (
      SELECT
        MIN(at_approve.created_at) - MIN(at_create.created_at) AS approve_time
      FROM transactions t
      JOIN transaction_audit at_create ON at_create.transaction_id = t.id AND at_create.action = 'INSERT'
      JOIN transaction_audit at_approve ON at_approve.transaction_id = t.id AND at_approve.action IN ('UPDATE', 'REJECT')
      WHERE t.workspace_id = ${ws}
        AND t.is_staged = false
      GROUP BY t.id
    ) sub
  `;

  const avgHours = Math.round(Number(result.avg_approval_seconds) / 3600);
  const avgDays = Math.floor(avgHours / 24);
  const remainHours = avgHours % 24;

  let avgLabel = "N/A";
  if (result.approved_count > 0) {
    avgLabel = avgDays > 0 ? `${avgDays}d ${remainHours}h` : `${avgHours}h`;
  }

  res.json({
    avg_approval_time_seconds: Number(result.avg_approval_seconds),
    avg_approval_time_label: avgLabel,
    approved_count: result.approved_count,
  });
});

export default router;
