import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  let query = sql`
    SELECT i.*, p.name AS project_name, v.name AS vendor_name
    FROM invoices i
    LEFT JOIN projects p ON p.id = i.project_id
    LEFT JOIN vendors v ON v.id = i.vendor_id
    WHERE 1=1
  `;
  if (status) query = sql`${query} AND i.status = ${status}`;
  query = sql`${query} ORDER BY i.due_date ASC LIMIT ${limit} OFFSET ${offset}`;
  const invoices = await query;
  res.json({ invoices });
});

router.get("/:id", async (req, res) => {
  const [invoice] = await sql`
    SELECT i.*, p.name AS project_name, v.name AS vendor_name
    FROM invoices i
    LEFT JOIN projects p ON p.id = i.project_id
    LEFT JOIN vendors v ON v.id = i.vendor_id
    WHERE i.id = ${req.params.id}
  `;
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  res.json({ invoice });
});

router.post("/", requireRole("finance", "md"), async (req, res) => {
  const { project_id, vendor_id, invoice_number, amount, due_date, description } = req.body;
  const [invoice] = await sql`
    INSERT INTO invoices (project_id, vendor_id, invoice_number, amount, due_date, description, created_by)
    VALUES (${project_id}, ${vendor_id}, ${invoice_number}, ${Math.round(amount)}, ${due_date}, ${description}, ${req.user.userId})
    RETURNING *
  `;
  res.status(201).json({ invoice });
});

router.post("/:id/pay", requireRole("finance"), async (req, res) => {
  const [invoice] = await sql`
    UPDATE invoices SET status = 'paid', paid_at = now()
    WHERE id = ${req.params.id} AND status = 'approved'
    RETURNING *
  `;
  if (!invoice) return res.status(404).json({ message: "Invoice not found or not approved" });
  res.json({ invoice });
});

export default router;
