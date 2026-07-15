import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// ── Payroll Groups ──

router.get("/groups", async (req, res) => {
  const { ws } = req.workspace;
  const groups = await sql`
    SELECT pg.*,
      (SELECT COUNT(*)::int FROM payroll_employees WHERE group_id = pg.id AND is_active = true) AS active_employees
    FROM payroll_groups pg
    WHERE pg.workspace_id = ${ws}
    ORDER BY pg.name
  `;
  res.json({ groups });
});

router.post("/groups", async (req, res) => {
  const { ws } = req.workspace;
  const { name, description } = req.body;
  if (!name) return res.status(422).json({ message: "name is required" });

  const [group] = await sql`
    INSERT INTO payroll_groups (workspace_id, name, description)
    VALUES (${ws}, ${name}, ${description || null})
    RETURNING *
  `;
  res.status(201).json({ group });
});

router.patch("/groups/:id", async (req, res) => {
  const { ws } = req.workspace;
  const { name, description } = req.body;

  const [group] = await sql`
    UPDATE payroll_groups SET
      name = COALESCE(${name}, name),
      description = COALESCE(${description}, description)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!group) return res.status(404).json({ message: "Payroll group not found" });
  res.json({ group });
});

router.delete("/groups/:id", async (req, res) => {
  const { ws } = req.workspace;

  const [employees] = await sql`
    SELECT COUNT(*)::int AS count FROM payroll_employees WHERE group_id = ${req.params.id}
  `;
  if (employees.count > 0) {
    return res.status(422).json({ message: "Cannot delete group with active employees. Remove employees first." });
  }

  const [group] = await sql`
    DELETE FROM payroll_groups WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!group) return res.status(404).json({ message: "Payroll group not found" });
  res.json({ group, message: "Payroll group deleted" });
});

// ── Employees ──

router.get("/employees", async (req, res) => {
  const { ws } = req.workspace;
  const { group_id, active } = req.query;

  let query = sql`
    SELECT pe.*, pg.name AS group_name
    FROM payroll_employees pe
    LEFT JOIN payroll_groups pg ON pg.id = pe.group_id
    WHERE pe.workspace_id = ${ws}
  `;

  if (group_id) query = sql`${query} AND pe.group_id = ${group_id}`;
  if (active === "true") query = sql`${query} AND pe.is_active = true`;
  else if (active === "false") query = sql`${query} AND pe.is_active = false`;

  query = sql`${query} ORDER BY pe.employee_name`;
  const employees = await query;
  res.json({ employees });
});

router.post("/employees", async (req, res) => {
  const { ws } = req.workspace;
  const {
    group_id, employee_name, employee_code, designation, bank_account, pan_no,
    basic_pay_minor, allowances_minor, deductions_minor,
  } = req.body;

  if (!employee_name) return res.status(422).json({ message: "employee_name is required" });

  const basic = basic_pay_minor != null ? Math.round(basic_pay_minor) : 0;
  const allowances = allowances_minor != null ? Math.round(allowances_minor) : 0;
  const deductions = deductions_minor != null ? Math.round(deductions_minor) : 0;
  const net_pay_minor = basic + allowances - deductions;

  const [employee] = await sql`
    INSERT INTO payroll_employees (workspace_id, group_id, employee_name, employee_code, designation, bank_account, pan_no, basic_pay_minor, allowances_minor, deductions_minor, net_pay_minor)
    VALUES (${ws}, ${group_id || null}, ${employee_name}, ${employee_code || null}, ${designation || null}, ${bank_account || null}, ${pan_no || null}, ${basic}, ${allowances}, ${deductions}, ${net_pay_minor})
    RETURNING *
  `;
  res.status(201).json({ employee });
});

router.patch("/employees/:id", async (req, res) => {
  const { ws } = req.workspace;
  const {
    group_id, employee_name, employee_code, designation, bank_account, pan_no,
    basic_pay_minor, allowances_minor, deductions_minor,
  } = req.body;

  const [current] = await sql`SELECT * FROM payroll_employees WHERE id = ${req.params.id}`;
  const basic = basic_pay_minor != null ? Math.round(basic_pay_minor) : Number(current.basic_pay_minor);
  const allowances = allowances_minor != null ? Math.round(allowances_minor) : Number(current.allowances_minor);
  const deductions = deductions_minor != null ? Math.round(deductions_minor) : Number(current.deductions_minor);
  const net_pay_minor = basic + allowances - deductions;

  const [employee] = await sql`
    UPDATE payroll_employees SET
      group_id = COALESCE(${group_id}, group_id),
      employee_name = COALESCE(${employee_name}, employee_name),
      employee_code = COALESCE(${employee_code}, employee_code),
      designation = COALESCE(${designation}, designation),
      bank_account = COALESCE(${bank_account}, bank_account),
      pan_no = COALESCE(${pan_no}, pan_no),
      basic_pay_minor = ${basic},
      allowances_minor = ${allowances},
      deductions_minor = ${deductions},
      net_pay_minor = ${net_pay_minor}
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.json({ employee });
});

router.delete("/employees/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [employee] = await sql`
    UPDATE payroll_employees SET is_active = false
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.json({ employee, message: "Employee deactivated" });
});

// ── Payroll Runs ──

router.get("/runs", async (req, res) => {
  const { ws } = req.workspace;
  const runs = await sql`
    SELECT pr.*, pg.name AS group_name
    FROM payroll_runs pr
    LEFT JOIN payroll_groups pg ON pg.id = pr.group_id
    WHERE pr.workspace_id = ${ws}
    ORDER BY pr.period_start DESC
  `;
  res.json({ runs });
});

router.post("/runs", async (req, res) => {
  const { ws } = req.workspace;
  const { group_id, period_start, period_end } = req.body;

  if (!group_id || !period_start || !period_end) {
    return res.status(422).json({ message: "group_id, period_start, and period_end are required" });
  }

  const employees = await sql`
    SELECT * FROM payroll_employees
    WHERE workspace_id = ${ws} AND group_id = ${group_id} AND is_active = true
  `;

  if (employees.length === 0) {
    return res.status(422).json({ message: "No active employees found in this group" });
  }

  const totalEmployees = employees.length;
  const totalGross = employees.reduce((s, e) => s + Number(e.basic_pay_minor) + Number(e.allowances_minor), 0);
  const totalDeductions = employees.reduce((s, e) => s + Number(e.deductions_minor), 0);
  const totalNet = totalGross - totalDeductions;

  const [run] = await sql`
    INSERT INTO payroll_runs (workspace_id, group_id, period_start, period_end, status, total_employees, total_gross_minor, total_deductions_minor, total_net_minor)
    VALUES (${ws}, ${group_id}, ${period_start}, ${period_end}, 'draft', ${totalEmployees}, ${totalGross}, ${totalDeductions}, ${totalNet})
    RETURNING *
  `;

  res.status(201).json({ run });
});

router.patch("/runs/:id", async (req, res) => {
  const { ws } = req.workspace;
  const { status } = req.body;

  if (!status) return res.status(422).json({ message: "status is required" });

  const [run] = await sql`
    UPDATE payroll_runs SET status = ${status}
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!run) return res.status(404).json({ message: "Payroll run not found" });
  res.json({ run });
});

router.post("/runs/:id/pay", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id, notes } = req.body;

  const [run] = await sql`
    SELECT * FROM payroll_runs WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!run) return res.status(404).json({ message: "Payroll run not found" });
  if (run.status === "paid") return res.status(422).json({ message: "Payroll run already paid" });
  if (!account_id) return res.status(422).json({ message: "account_id is required to process payment" });

  const [txn] = await sql`
    INSERT INTO transactions (user_id, workspace_id, account_id, txn_type, amount_minor, currency, occurred_on, description, note, is_staged)
    VALUES (${req.user.userId}, ${ws}, ${account_id}, 'expense', ${run.total_net_minor}, 'BDT', ${run.period_end}, ${`Payroll — ${run.period_start} to ${run.period_end}`}, ${notes || ''}, false)
    RETURNING *
  `;

  const [updated] = await sql`
    UPDATE payroll_runs SET status = 'paid', transaction_id = ${txn.id}
    WHERE id = ${req.params.id}
    RETURNING *
  `;

  res.json({ run: updated, transaction: txn });
});

export default router;
