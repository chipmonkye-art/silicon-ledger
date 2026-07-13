import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const userId = req.user.userId;

  const [staleStaged, budgetAlerts, overdueInvoices, pendingReview] = await Promise.all([
    sql`
      SELECT id, description, amount, date, account_id, created_at
      FROM transactions
      WHERE created_by = ${userId} AND is_staged = true AND created_at < now() - interval '3 days'
      ORDER BY created_at DESC
      LIMIT 10
    `,
    sql`
      SELECT p.id, p.name, p.budget, COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense' AND t.is_staged = false), 0) AS spent
      FROM projects p
      LEFT JOIN transactions t ON t.project_id = p.id
      WHERE p.created_by = ${userId}
      GROUP BY p.id
      HAVING p.budget > 0 AND COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense' AND t.is_staged = false), 0) > p.budget
      ORDER BY spent - p.budget DESC
      LIMIT 10
    `,
    sql`
      SELECT id, invoice_number, amount, due_date, project_id
      FROM invoices
      WHERE created_by = ${userId} AND status NOT IN ('paid', 'approved') AND due_date < CURRENT_DATE
      ORDER BY due_date
      LIMIT 10
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM transactions
      WHERE created_by = ${userId} AND is_staged = true
    `,
  ]);

  res.json({
    stale_staged: staleStaged.map((t) => ({
      id: t.id,
      type: "stale_staged",
      message: `"${t.description}" staged for ${Math.floor((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24))} days`,
      link: `/transactions`,
      created_at: t.created_at,
    })),
    budget_alerts: budgetAlerts.map((p) => ({
      id: p.id,
      type: "budget_alert",
      message: `"${p.name}" is ${Math.round(((Number(p.spent) - Number(p.budget)) / Number(p.budget)) * 100)}% over budget`,
      link: `/projects/${p.id}`,
      overshoot: Number(p.spent) - Number(p.budget),
    })),
    overdue_invoices: overdueInvoices.map((i) => ({
      id: i.id,
      type: "overdue_invoice",
      message: `Invoice #${i.invoice_number} (${i.due_date}) is overdue`,
      link: `/invoices`,
      due_date: i.due_date,
    })),
    pending_review: pendingReview[0]?.count || 0,
    total: staleStaged.length + budgetAlerts.length + overdueInvoices.length,
  });
});

export default router;
