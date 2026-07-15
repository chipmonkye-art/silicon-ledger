import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const { search, active } = req.query;

  let query = sql`SELECT * FROM landowners WHERE workspace_id = ${ws}`;

  if (active === "true") query = sql`${query} AND is_active = true`;
  else if (active === "false") query = sql`${query} AND is_active = false`;

  if (search) {
    const term = `%${search}%`;
    query = sql`${query} AND (name ILIKE ${term} OR contact_person ILIKE ${term} OR email ILIKE ${term} OR parcel_details ILIKE ${term})`;
  }

  query = sql`${query} ORDER BY name`;
  const landowners = await query;
  res.json({ landowners });
});

router.post("/", async (req, res) => {
  const { ws } = req.workspace;
  const {
    name, contact_person, email, phone, address, parcel_details,
    contract_type, contract_start, contract_end, payment_frequency,
    payment_amount_minor, account_id, notes,
  } = req.body;

  if (!name) return res.status(422).json({ message: "name is required" });

  const [landowner] = await sql`
    INSERT INTO landowners (workspace_id, name, contact_person, email, phone, address, parcel_details, contract_type, contract_start, contract_end, payment_frequency, payment_amount_minor, account_id, notes)
    VALUES (${ws}, ${name}, ${contact_person || null}, ${email || null}, ${phone || null}, ${address || null}, ${parcel_details || null}, ${contract_type || null}, ${contract_start || null}, ${contract_end || null}, ${payment_frequency || null}, ${payment_amount_minor != null ? Math.round(payment_amount_minor) : 0}, ${account_id || null}, ${notes || null})
    RETURNING *
  `;
  res.status(201).json({ landowner });
});

router.get("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [landowner] = await sql`
    SELECT * FROM landowners WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!landowner) return res.status(404).json({ message: "Landowner not found" });

  const schedules = await sql`
    SELECT * FROM landowner_schedules WHERE landowner_id = ${req.params.id} ORDER BY due_date
  `;

  res.json({ landowner, schedules });
});

router.patch("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const {
    name, contact_person, email, phone, address, parcel_details,
    contract_type, contract_start, contract_end, payment_frequency,
    payment_amount_minor, account_id, notes,
  } = req.body;

  const [landowner] = await sql`
    UPDATE landowners SET
      name = COALESCE(${name}, name),
      contact_person = COALESCE(${contact_person}, contact_person),
      email = COALESCE(${email}, email),
      phone = COALESCE(${phone}, phone),
      address = COALESCE(${address}, address),
      parcel_details = COALESCE(${parcel_details}, parcel_details),
      contract_type = COALESCE(${contract_type}, contract_type),
      contract_start = COALESCE(${contract_start}, contract_start),
      contract_end = COALESCE(${contract_end}, contract_end),
      payment_frequency = COALESCE(${payment_frequency}, payment_frequency),
      payment_amount_minor = COALESCE(${payment_amount_minor != null ? Math.round(payment_amount_minor) : null}, payment_amount_minor),
      account_id = COALESCE(${account_id}, account_id),
      notes = COALESCE(${notes}, notes)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!landowner) return res.status(404).json({ message: "Landowner not found" });
  res.json({ landowner });
});

router.delete("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [landowner] = await sql`
    UPDATE landowners SET is_active = false WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!landowner) return res.status(404).json({ message: "Landowner not found" });
  res.json({ landowner, message: "Landowner deactivated" });
});

router.post("/:id/generate-schedules", async (req, res) => {
  const { ws } = req.workspace;
  const [landowner] = await sql`
    SELECT * FROM landowners WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!landowner) return res.status(404).json({ message: "Landowner not found" });
  if (!landowner.contract_start || !landowner.payment_frequency) {
    return res.status(422).json({ message: "contract_start and payment_frequency are required to generate schedules" });
  }

  const amount = landowner.payment_amount_minor || 0;
  const start = new Date(landowner.contract_start);
  const end = landowner.contract_end ? new Date(landowner.contract_end) : null;
  const freq = landowner.payment_frequency;

  const dates = [];
  let current = new Date(start);

  while (!end || current <= end) {
    dates.push(new Date(current));
    switch (freq) {
      case "daily": current.setDate(current.getDate() + 1); break;
      case "weekly": current.setDate(current.getDate() + 7); break;
      case "monthly": current.setMonth(current.getMonth() + 1); break;
      case "quarterly": current.setMonth(current.getMonth() + 3); break;
      case "yearly": current.setFullYear(current.getFullYear() + 1); break;
      default: current.setMonth(current.getMonth() + 1);
    }
  }

  if (dates.length === 0) return res.status(422).json({ message: "No schedules to generate" });

  const inserted = [];
  for (const d of dates) {
    const dueDate = d.toISOString().slice(0, 10);
    const [existing] = await sql`
      SELECT id FROM landowner_schedules WHERE landowner_id = ${req.params.id} AND due_date = ${dueDate}
    `;
    if (existing) continue;

    const [schedule] = await sql`
      INSERT INTO landowner_schedules (landowner_id, due_date, amount_minor, status)
      VALUES (${req.params.id}, ${dueDate}, ${amount}, 'pending')
      RETURNING *
    `;
    inserted.push(schedule);
  }

  res.status(201).json({ schedules: inserted, count: inserted.length });
});

router.get("/:id/schedules", async (req, res) => {
  const { ws } = req.workspace;
  const [landowner] = await sql`
    SELECT id FROM landowners WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!landowner) return res.status(404).json({ message: "Landowner not found" });

  const schedules = await sql`
    SELECT s.*, t.id AS transaction_id, t.description AS txn_description
    FROM landowner_schedules s
    LEFT JOIN transactions t ON t.id = s.transaction_id
    WHERE s.landowner_id = ${req.params.id}
    ORDER BY s.due_date
  `;
  res.json({ schedules });
});

router.post("/:id/schedules/:scheduleId/pay", async (req, res) => {
  const { ws } = req.workspace;
  const [schedule] = await sql`
    SELECT s.*, l.account_id, l.name AS landowner_name, l.workspace_id
    FROM landowner_schedules s
    JOIN landowners l ON l.id = s.landowner_id
    WHERE s.id = ${req.params.scheduleId} AND s.landowner_id = ${req.params.id} AND l.workspace_id = ${ws}
  `;
  if (!schedule) return res.status(404).json({ message: "Schedule not found" });
  if (schedule.status === "paid") return res.status(422).json({ message: "Schedule already paid" });

  const { category_id, notes } = req.body;

  const [txn] = await sql`
    INSERT INTO transactions (user_id, workspace_id, account_id, category_id, txn_type, amount_minor, currency, occurred_on, description, note, is_staged)
    VALUES (${req.user.userId}, ${ws}, ${schedule.account_id}, ${category_id || null}, 'expense', ${schedule.amount_minor}, 'BDT', ${schedule.due_date}, ${`Landowner payment — ${schedule.landowner_name}`}, ${notes || ''}, false)
    RETURNING *
  `;

  const [updated] = await sql`
    UPDATE landowner_schedules SET status = 'paid', paid_at = now(), transaction_id = ${txn.id}
    WHERE id = ${req.params.scheduleId}
    RETURNING *
  `;

  res.json({ schedule: updated, transaction: txn });
});

export default router;
