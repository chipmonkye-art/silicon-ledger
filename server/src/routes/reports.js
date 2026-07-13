import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/category-breakdown", async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const year = parseInt(month.slice(0, 4));
  const monthNum = parseInt(month.slice(5, 7));
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);

  const rows = await sql`
    SELECT category, SUM(amount) AS total
    FROM transactions
    WHERE created_by = ${req.user.userId}
      AND type = 'expense'
      AND is_staged = false
      AND date >= ${startDate}
      AND date <= ${endDate}
      AND category IS NOT NULL
    GROUP BY category
    ORDER BY total DESC
  `;

  const categories = rows.map((r) => ({
    name: r.category,
    amount: Number(r.total),
  }));

  const total = categories.reduce((s, c) => s + c.amount, 0);
  const withPct = categories.map((c) => ({
    ...c,
    pct: total > 0 ? Math.round((c.amount / total) * 100) : 0,
  }));

  const colors = [
    "#dc2626", "#2563eb", "#16a34a", "#d97706", "#8b5cf6",
    "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
  ];
  const colored = withPct.map((c, i) => ({ ...c, color: colors[i % colors.length] }));

  res.json({ categories: colored, total });
});

router.get("/monthly-trends", async (req, res) => {
  const monthsBack = parseInt(req.query.months || "12");

  const rows = await sql`
    SELECT
      to_char(date, 'YYYY-MM') AS month,
      type,
      SUM(amount) AS total
    FROM transactions
    WHERE created_by = ${req.user.userId}
      AND is_staged = false
      AND date >= (CURRENT_DATE - INTERVAL '1 year')
    GROUP BY month, type
    ORDER BY month
  `;

  const map = {};
  for (const r of rows) {
    if (!map[r.month]) map[r.month] = { income: 0, expense: 0 };
    if (r.type === "income") map[r.month].income += Number(r.total);
    if (r.type === "expense") map[r.month].expense += Number(r.total);
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
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const year = parseInt(month.slice(0, 4));
  const monthNum = parseInt(month.slice(5, 7));
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);
  const monthLabel = new Date(year, monthNum - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const [totals] = await sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0) AS income,
      COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expense
    FROM transactions
    WHERE created_by = ${req.user.userId} AND is_staged = false
      AND date >= ${startDate} AND date <= ${endDate}
  `;

  const rows = await sql`
    SELECT t.date, t.description, t.type, t.amount, t.category, a.name AS account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.created_by = ${req.user.userId} AND t.is_staged = false
      AND t.date >= ${startDate} AND t.date <= ${endDate}
    ORDER BY t.date, t.created_at
  `;

  const income = Number(totals.income);
  const expense = Number(totals.expense);
  const balance = income - expense;

  const rowsHtml = rows.map((r) => {
    const amt = Number(r.amount);
    const isIncome = r.type === "income";
    const isExpense = r.type === "expense";
    const credit = isIncome ? amt : 0;
    const debit = isExpense ? amt : 0;
    return `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-family:'JetBrains Mono',monospace;font-size:12px">${r.date}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px">${r.description} <span style="color:#999;font-size:10px">${r.category || ""}</span></td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:#16a34a">${isIncome ? `+$${(credit / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : ""}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:#dc2626">${isExpense ? `-$${(debit / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : ""}</td>
      </tr>
    `;
  }).join("\n");

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
    <div class="card"><p>Income</p><div class="num" style="color:#16a34a">+$${(income / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
    <div class="card"><p>Expense</p><div class="num" style="color:#dc2626">-$${(expense / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
    <div class="card"><p>Balance</p><div class="num" style="color:${balance >= 0 ? "#16a34a" : "#dc2626"}">${balance >= 0 ? "+" : "-"}$${(Math.abs(balance) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
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

export default router;
