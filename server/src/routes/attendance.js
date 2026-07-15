import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

const VALID_STATUSES = ["present", "absent", "half_day", "overtime", "holiday", "leave"];
const VALID_WORK_TYPES = ["regular", "piece_work", "contract", "supervisor", "other"];

router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const { project_id, from, to, employee } = req.query;

  let query = sql`SELECT * FROM attendance WHERE workspace_id = ${ws}`;

  if (project_id) query = sql`${query} AND project_id = ${project_id}`;
  if (from) query = sql`${query} AND attendance_date >= ${from}`;
  if (to) query = sql`${query} AND attendance_date <= ${to}`;
  if (employee) {
    const term = `%${employee}%`;
    query = sql`${query} AND (employee_name ILIKE ${term} OR employee_code ILIKE ${term})`;
  }

  query = sql`${query} ORDER BY attendance_date DESC, employee_name`;
  const records = await query;
  res.json({ records });
});

router.get("/summary", async (req, res) => {
  const { ws } = req.workspace;
  const { from, to } = req.query;
  if (!from || !to) return res.status(422).json({ message: "from and to query params are required" });

  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS total_records,
      COUNT(*) FILTER (WHERE status = 'present')::int AS total_present,
      COUNT(*) FILTER (WHERE status = 'absent')::int AS total_absent,
      COUNT(*) FILTER (WHERE status = 'overtime')::int AS total_overtime,
      COUNT(*) FILTER (WHERE status = 'half_day')::int AS total_half_day,
      COUNT(*) FILTER (WHERE status = 'holiday')::int AS total_holiday,
      COUNT(*) FILTER (WHERE status = 'leave')::int AS total_leave,
      COALESCE(SUM(wages_minor), 0)::int AS total_wages,
      COALESCE(SUM(hours_worked), 0)::numeric AS total_hours
    FROM attendance
    WHERE workspace_id = ${ws}
      AND attendance_date >= ${from}
      AND attendance_date <= ${to}
  `;

  const byDate = await sql`
    SELECT attendance_date, status, COUNT(*)::int AS count, SUM(wages_minor)::int AS wages_minor
    FROM attendance
    WHERE workspace_id = ${ws}
      AND attendance_date >= ${from}
      AND attendance_date <= ${to}
    GROUP BY attendance_date, status
    ORDER BY attendance_date
  `;

  res.json({ summary, byDate });
});

router.post("/", async (req, res) => {
  const { ws } = req.workspace;
  const {
    project_id, employee_name, employee_code, attendance_date,
    status, work_type, hours_worked, hourly_rate_minor,
    piece_rate_minor, piece_quantity, wages_minor, notes,
  } = req.body;

  if (!employee_name || !attendance_date || !status) {
    return res.status(422).json({ message: "employee_name, attendance_date, and status are required" });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(422).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  if (work_type && !VALID_WORK_TYPES.includes(work_type)) {
    return res.status(422).json({ message: `Invalid work_type. Must be one of: ${VALID_WORK_TYPES.join(", ")}` });
  }

  const [record] = await sql`
    INSERT INTO attendance (workspace_id, project_id, employee_name, employee_code, attendance_date, status, work_type, hours_worked, hourly_rate_minor, piece_rate_minor, piece_quantity, wages_minor, notes)
    VALUES (${ws}, ${project_id || null}, ${employee_name}, ${employee_code || null}, ${attendance_date}, ${status}, ${work_type || 'regular'}, ${hours_worked || null}, ${hourly_rate_minor != null ? Math.round(hourly_rate_minor) : null}, ${piece_rate_minor != null ? Math.round(piece_rate_minor) : null}, ${piece_quantity != null ? Math.round(piece_quantity) : null}, ${wages_minor != null ? Math.round(wages_minor) : 0}, ${notes || null})
    RETURNING *
  `;
  res.status(201).json({ record });
});

router.post("/bulk", async (req, res) => {
  const { ws } = req.workspace;
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(422).json({ message: "records must be a non-empty array" });
  }

  const inserted = [];
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r.employee_name || !r.attendance_date || !r.status) {
      errors.push({ index: i, message: "employee_name, attendance_date, and status are required" });
      continue;
    }
    if (!VALID_STATUSES.includes(r.status)) {
      errors.push({ index: i, message: `Invalid status: ${r.status}` });
      continue;
    }
    try {
      const [record] = await sql`
        INSERT INTO attendance (workspace_id, project_id, employee_name, employee_code, attendance_date, status, work_type, hours_worked, hourly_rate_minor, piece_rate_minor, piece_quantity, wages_minor, notes)
        VALUES (${ws}, ${r.project_id || null}, ${r.employee_name}, ${r.employee_code || null}, ${r.attendance_date}, ${r.status}, ${r.work_type || 'regular'}, ${r.hours_worked || null}, ${r.hourly_rate_minor != null ? Math.round(r.hourly_rate_minor) : null}, ${r.piece_rate_minor != null ? Math.round(r.piece_rate_minor) : null}, ${r.piece_quantity != null ? Math.round(r.piece_quantity) : null}, ${r.wages_minor != null ? Math.round(r.wages_minor) : 0}, ${r.notes || null})
        RETURNING *
      `;
      inserted.push(record);
    } catch (err) {
      errors.push({ index: i, message: err.message });
    }
  }

  res.status(201).json({ inserted: inserted.length, records: inserted, errors: errors.length > 0 ? errors : undefined });
});

router.patch("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const {
    project_id, employee_name, employee_code, attendance_date,
    status, work_type, hours_worked, hourly_rate_minor,
    piece_rate_minor, piece_quantity, wages_minor, notes,
  } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(422).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  const [record] = await sql`
    UPDATE attendance SET
      project_id = COALESCE(${project_id}, project_id),
      employee_name = COALESCE(${employee_name}, employee_name),
      employee_code = COALESCE(${employee_code}, employee_code),
      attendance_date = COALESCE(${attendance_date}, attendance_date),
      status = COALESCE(${status}, status),
      work_type = COALESCE(${work_type}, work_type),
      hours_worked = COALESCE(${hours_worked}, hours_worked),
      hourly_rate_minor = COALESCE(${hourly_rate_minor != null ? Math.round(hourly_rate_minor) : null}, hourly_rate_minor),
      piece_rate_minor = COALESCE(${piece_rate_minor != null ? Math.round(piece_rate_minor) : null}, piece_rate_minor),
      piece_quantity = COALESCE(${piece_quantity != null ? Math.round(piece_quantity) : null}, piece_quantity),
      wages_minor = COALESCE(${wages_minor != null ? Math.round(wages_minor) : null}, wages_minor),
      notes = COALESCE(${notes}, notes)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!record) return res.status(404).json({ message: "Attendance record not found" });
  res.json({ record });
});

router.delete("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [record] = await sql`
    DELETE FROM attendance WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!record) return res.status(404).json({ message: "Attendance record not found" });
  res.json({ record, message: "Attendance record deleted" });
});

export default router;
