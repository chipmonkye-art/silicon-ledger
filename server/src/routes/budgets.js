import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";
import { requireWorkspaceRoleOrAuditor } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// GET /api/budgets — list budgets vs actual
router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const overBudget = req.query.over_budget === "true";

  let query = sql`
    SELECT * FROM budget_vs_actual
    WHERE workspace_id = ${ws}
  `;
  if (overBudget) query = sql`${query} AND is_over_budget = true`;
  query = sql`${query} ORDER BY spend_pct DESC LIMIT ${limit} OFFSET ${offset}`;

  const rows = await query;
  const [{ count }] = await sql`SELECT COUNT(*)::int FROM budget_vs_actual WHERE workspace_id = ${ws}`;
  res.json({ budgets: rows, total: count });
});

// POST /api/budgets — create budget
router.post("/", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { cost_center_id, project_id, name, amount_minor, currency, period_start, period_end } = req.body;

  const [budget] = await sql`
    INSERT INTO budgets (workspace_id, cost_center_id, project_id, name, amount_minor, currency, period_start, period_end)
    VALUES (${ws}, ${cost_center_id}, ${project_id}, ${name}, ${amount_minor}, ${currency || "USD"}, ${period_start}, ${period_end})
    RETURNING *
  `;
  res.status(201).json({ budget });
});

// PATCH /api/budgets/:id
router.patch("/:id", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { name, amount_minor, is_active, period_start, period_end } = req.body;
  const [budget] = await sql`
    UPDATE budgets SET
      name = COALESCE(${name}, name),
      amount_minor = COALESCE(${amount_minor}, amount_minor),
      is_active = COALESCE(${is_active}, is_active),
      period_start = COALESCE(${period_start}, period_start),
      period_end = COALESCE(${period_end}, period_end)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!budget) return res.status(404).json({ message: "Budget not found" });
  res.json({ budget });
});

// CRUD for cost centers
router.get("/cost-centers", async (req, res) => {
  const { ws } = req.workspace;
  const rows = await sql`
    SELECT cc.*, (SELECT COUNT(*) FROM cost_centers WHERE parent_id = cc.id)::int AS child_count
    FROM cost_centers cc WHERE cc.workspace_id = ${ws} ORDER BY cc.name
  `;
  res.json({ cost_centers: rows });
});

router.post("/cost-centers", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { name, code, parent_id } = req.body;
  const [cc] = await sql`
    INSERT INTO cost_centers (workspace_id, name, code, parent_id)
    VALUES (${ws}, ${name}, ${code}, ${parent_id}) RETURNING *
  `;
  res.status(201).json({ cost_center: cc });
});

// Alert rules CRUD
router.get("/alert-rules", async (req, res) => {
  const { ws } = req.workspace;
  const rows = await sql`SELECT * FROM alert_rules WHERE workspace_id = ${ws} ORDER BY created_at DESC`;
  res.json({ alert_rules: rows });
});

router.post("/alert-rules", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { name, entity_type, entity_id, metric, operator, threshold, channel, cooldown_minutes } = req.body;
  const [rule] = await sql`
    INSERT INTO alert_rules (workspace_id, name, entity_type, entity_id, metric, operator, threshold, channel, cooldown_minutes)
    VALUES (${ws}, ${name}, ${entity_type}, ${entity_id}, ${metric}, ${operator}, ${threshold}, ${channel || "in_app"}, ${cooldown_minutes || 1440})
    RETURNING *
  `;
  res.status(201).json({ alert_rule: rule });
});

router.delete("/alert-rules/:id", requireWorkspaceRoleOrAuditor("owner"), async (req, res) => {
  const { ws } = req.workspace;
  await sql`DELETE FROM alert_rules WHERE id = ${req.params.id} AND workspace_id = ${ws}`;
  res.status(204).end();
});

// GET /api/alerts — list generated alerts
router.get("/alerts", async (req, res) => {
  const { ws } = req.workspace;
  const unread = req.query.unread === "true";
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  let query = sql`
    SELECT a.*, ar.name AS rule_name
    FROM alerts a
    LEFT JOIN alert_rules ar ON ar.id = a.rule_id
    WHERE a.workspace_id = ${ws}
  `;
  if (unread) query = sql`${query} AND a.is_read = false`;
  query = sql`${query} ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const rows = await query;
  const [{ count }] = await sql`
    SELECT COUNT(*)::int FROM alerts WHERE workspace_id = ${ws}
  `;
  res.json({ alerts: rows, total: count });
});

// POST /api/alerts/:id/read — mark alert read
router.post("/:id/read", requireWorkspaceRoleOrAuditor("owner", "manager", "staff"), async (req, res) => {
  const { ws } = req.workspace;
  await sql`UPDATE alerts SET is_read = true WHERE id = ${req.params.id} AND workspace_id = ${ws}`;
  res.status(204).end();
});

// POST /api/budgets/evaluate-alerts — evaluate budget thresholds and generate alerts
router.post("/evaluate-alerts", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const rules = await sql`
    SELECT * FROM alert_rules
    WHERE workspace_id = ${ws} AND is_active = true
      AND entity_type = 'budget'
      AND (last_triggered_at IS NULL OR last_triggered_at < NOW() - (cooldown_minutes || ' minutes')::interval)
  `;

  const budgets = await sql`SELECT * FROM budget_vs_actual WHERE workspace_id = ${ws}`;
  const generated = [];

  for (const rule of rules) {
    for (const b of budgets) {
      if (rule.entity_id && rule.entity_id !== b.budget_id) continue;

      let value;
      if (rule.metric === 'spend_pct') value = b.spend_pct;
      else if (rule.metric === 'spend_remaining') value = b.remaining_minor;
      else continue;

      let triggered = false;
      if (rule.operator === '>' && value > rule.threshold) triggered = true;
      else if (rule.operator === '>=' && value >= rule.threshold) triggered = true;
      else if (rule.operator === '<' && value < rule.threshold) triggered = true;
      else if (rule.operator === '<=' && value <= rule.threshold) triggered = true;

      if (triggered) {
        const severity = rule.metric === 'spend_pct' && value >= 100 ? 'critical' : value >= 90 ? 'warning' : 'info';
        const title = `${b.budget_name} at ${value}%`;
        const msg = `${b.budget_name} (${b.cost_center_name || 'Unallocated'}) has reached ${value}% of budget ($${(b.budget_amount / 100).toFixed(2)}). Remaining: $${(b.remaining_minor / 100).toFixed(2)}`;

        const [alert] = await sql`
          INSERT INTO alerts (workspace_id, rule_id, entity_type, entity_id, title, message, severity)
          VALUES (${ws}, ${rule.id}, 'budget', ${b.budget_id}, ${title}, ${msg}, ${severity})
          RETURNING *
        `;
        await sql`UPDATE alert_rules SET last_triggered_at = NOW() WHERE id = ${rule.id}`;
        generated.push(alert);
      }
    }
  }

  res.json({ alerts_generated: generated.length, alerts: generated });
});

// CRUD for vendors
router.get("/vendors", async (req, res) => {
  const { ws } = req.workspace;
  const rows = await sql`SELECT * FROM vendors WHERE workspace_id = ${ws} ORDER BY name`;
  res.json({ vendors: rows });
});

router.post("/vendors", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { name, contact_person, email, phone, address, gst, payment_terms, account_id } = req.body;
  const [v] = await sql`
    INSERT INTO vendors (workspace_id, name, contact_person, email, phone, address, gst, payment_terms, account_id)
    VALUES (${ws}, ${name}, ${contact_person}, ${email}, ${phone}, ${address}, ${gst}, ${payment_terms}, ${account_id})
    RETURNING *
  `;
  res.status(201).json({ vendor: v });
});

router.patch("/vendors/:id", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { name, contact_person, email, phone, address, gst, is_active, payment_terms } = req.body;
  const [v] = await sql`
    UPDATE vendors SET
      name = COALESCE(${name}, name),
      contact_person = COALESCE(${contact_person}, contact_person),
      email = COALESCE(${email}, email),
      phone = COALESCE(${phone}, phone),
      address = COALESCE(${address}, address),
      gst = COALESCE(${gst}, gst),
      payment_terms = COALESCE(${payment_terms}, payment_terms),
      is_active = COALESCE(${is_active}, is_active)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!v) return res.status(404).json({ message: "Vendor not found" });
  res.json({ vendor: v });
});

// ── Projects CRUD ──

router.get("/projects", async (req, res) => {
  const { ws } = req.workspace;
  const rows = await sql`
    SELECT p.*,
      (SELECT COALESCE(SUM(
        CASE WHEN t.txn_type = 'expense' THEN t.amount_minor
             WHEN t.txn_type = 'income' THEN -t.amount_minor
        ELSE 0 END
      ), 0) FROM transactions t WHERE t.project_id = p.id AND t.is_staged = false AND t.is_rejected = false)::int AS spent_minor
    FROM projects p
    WHERE p.workspace_id = ${ws}
    ORDER BY p.name
  `;
  res.json({ projects: rows });
});

router.post("/projects", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { name, code, budget_minor, currency, start_date, target_end_date } = req.body;
  const [proj] = await sql`
    INSERT INTO projects (workspace_id, name, code, budget_minor, currency, start_date, target_end_date)
    VALUES (${ws}, ${name}, ${code}, ${budget_minor || 0}, ${currency || "USD"}, ${start_date}, ${target_end_date})
    RETURNING *
  `;
  res.status(201).json({ project: proj });
});

router.patch("/projects/:id", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { name, status, is_active, budget_minor } = req.body;
  const [proj] = await sql`
    UPDATE projects SET
      name = COALESCE(${name}, name),
      status = COALESCE(${status}, status),
      is_active = COALESCE(${is_active}, is_active),
      budget_minor = COALESCE(${budget_minor}, budget_minor)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!proj) return res.status(404).json({ message: "Project not found" });
  res.json({ project: proj });
});

export default router;
