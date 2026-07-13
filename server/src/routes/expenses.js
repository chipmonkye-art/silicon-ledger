import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const { status, project_id, limit = 50, offset = 0 } = req.query;
  let query = sql`
    SELECT e.*, p.name AS project_name
    FROM expenses e
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE 1=1
  `;
  if (status) query = sql`${query} AND e.status = ${status}`;
  if (project_id) query = sql`${query} AND e.project_id = ${project_id}`;
  query = sql`${query} ORDER BY e.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const expenses = await query;

  const [approvedRow] = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE status IN ('approved', 'paid')
  `;
  const [pendingRow] = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE status = 'pending'
  `;

  res.json({
    expenses,
    summary: { approved: Number(approvedRow.total), pending: Number(pendingRow.total) },
  });
});

router.get("/:id", async (req, res) => {
  const [expense] = await sql`
    SELECT e.*, p.name AS project_name
    FROM expenses e
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE e.id = ${req.params.id}
  `;
  if (!expense) return res.status(404).json({ message: "Expense not found" });
  res.json({ expense });
});

router.post("/", async (req, res) => {
  const { project_id, vendor_id, amount, category, description, receipt_url } = req.body;
  const [expense] = await sql`
    INSERT INTO expenses (project_id, vendor_id, amount, category, description, receipt_url, created_by)
    VALUES (${project_id}, ${vendor_id || null}, ${Math.round(amount)}, ${category}, ${description}, ${receipt_url || null}, ${req.user.userId})
    RETURNING *
  `;
  res.status(201).json({ expense });
});

router.post("/:id/approve", requireRole("finance"), async (req, res) => {
  const [expense] = await sql`
    UPDATE expenses SET status = 'approved', approved_by = ${req.user.userId}, approved_at = now()
    WHERE id = ${req.params.id} AND status = 'pending'
    RETURNING *
  `;
  if (!expense) return res.status(404).json({ message: "Expense not found or not in pending status" });
  res.json({ expense });
});

router.post("/:id/reject", requireRole("finance"), async (req, res) => {
  const [expense] = await sql`
    UPDATE expenses SET status = 'rejected', approved_by = ${req.user.userId}, approved_at = now()
    WHERE id = ${req.params.id} AND status = 'pending'
    RETURNING *
  `;
  if (!expense) return res.status(404).json({ message: "Expense not found or not in pending status" });
  res.json({ expense });
});

export default router;
