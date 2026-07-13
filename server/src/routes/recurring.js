import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

function computeNextOccurrence(from, intervalType, intervalValue) {
  const d = new Date(from);
  switch (intervalType) {
    case "daily": d.setDate(d.getDate() + intervalValue); break;
    case "weekly": d.setDate(d.getDate() + 7 * intervalValue); break;
    case "monthly": d.setMonth(d.getMonth() + intervalValue); break;
    case "yearly": d.setFullYear(d.getFullYear() + intervalValue); break;
    case "custom_weeks": d.setDate(d.getDate() + 7 * intervalValue); break;
  }
  return d;
}

router.get("/", async (req, res) => {
  const templates = await sql`
    SELECT rt.*, a.name AS account_name, a2.name AS to_account_name
    FROM recurring_templates rt
    LEFT JOIN accounts a ON a.id = rt.account_id
    LEFT JOIN accounts a2 ON a2.id = rt.to_account_id
    WHERE rt.user_id = ${req.user.userId}
    ORDER BY rt.next_occurrence
  `;

  const grouped = {};
  const intervalLabels = {
    daily: (v) => v === 1 ? "Daily" : `Every ${v} days`,
    weekly: (v) => v === 1 ? "Weekly" : `Every ${v} weeks`,
    monthly: (v) => v === 1 ? "Monthly" : `Every ${v} months`,
    yearly: (v) => v === 1 ? "Yearly" : `Every ${v} years`,
    custom_weeks: (v) => `Every ${v} weeks`,
  };

  for (const t of templates) {
    const label = intervalLabels[t.interval_type]?.(t.interval_value) || t.interval_type;
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(t);
  }

  res.json({ templates, grouped });
});

router.post("/", async (req, res) => {
  const { name, type, amount, account_id, to_account_id, category, description, interval_type, interval_value, next_occurrence, end_date } = req.body;

  if (type === "transfer" && !to_account_id) {
    return res.status(422).json({ message: "Transfer requires destination account" });
  }

  const [template] = await sql`
    INSERT INTO recurring_templates (user_id, name, type, amount, account_id, to_account_id, category, description, interval_type, interval_value, next_occurrence, end_date)
    VALUES (${req.user.userId}, ${name}, ${type}, ${Math.round(amount)}, ${account_id}, ${to_account_id || null}, ${category || null}, ${description || null}, ${interval_type}, ${interval_value || 1}, ${next_occurrence}, ${end_date || null})
    RETURNING *
  `;
  res.status(201).json({ template });
});

router.put("/:id", async (req, res) => {
  const { name, type, amount, account_id, category, description, interval_type, interval_value, next_occurrence, is_active } = req.body;
  const [template] = await sql`
    UPDATE recurring_templates SET
      name = COALESCE(${name}, name),
      amount = COALESCE(${amount != null ? Math.round(amount) : null}, amount),
      account_id = COALESCE(${account_id}, account_id),
      category = COALESCE(${category}, category),
      description = COALESCE(${description}, description),
      interval_type = COALESCE(${interval_type}, interval_type),
      interval_value = COALESCE(${interval_value}, interval_value),
      next_occurrence = COALESCE(${next_occurrence}, next_occurrence),
      is_active = COALESCE(${is_active != null ? is_active : null}, is_active),
      updated_at = now()
    WHERE id = ${req.params.id} AND user_id = ${req.user.userId}
    RETURNING *
  `;
  if (!template) return res.status(404).json({ message: "Template not found" });
  res.json({ template });
});

router.delete("/:id", async (req, res) => {
  const [template] = await sql`
    DELETE FROM recurring_templates WHERE id = ${req.params.id} AND user_id = ${req.user.userId}
    RETURNING id
  `;
  if (!template) return res.status(404).json({ message: "Template not found" });
  res.status(204).end();
});

router.post("/:id/generate", async (req, res) => {
  const { count = 1 } = req.body;
  const [template] = await sql`
    SELECT * FROM recurring_templates WHERE id = ${req.params.id} AND user_id = ${req.user.userId}
  `;
  if (!template) return res.status(404).json({ message: "Template not found" });

  const generated = [];
  let currentDate = new Date(template.next_occurrence);
  const endLimit = template.end_date ? new Date(template.end_date) : new Date(currentDate.getTime() + 365 * 3 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < count && currentDate <= endLimit; i++) {
    const dateStr = currentDate.toISOString().slice(0, 10);

    const [existing] = await sql`
      SELECT bt.id FROM bulk_generated_transactions bt
      JOIN transactions t ON t.id = bt.transaction_id
      WHERE bt.template_id = ${template.id} AND t.date = ${dateStr}
      LIMIT 1
    `;
    if (existing) {
      currentDate = computeNextOccurrence(currentDate, template.interval_type, template.interval_value);
      continue;
    }

    const [txn] = await sql`
      INSERT INTO transactions (account_id, to_account_id, type, amount, description, category, date, is_staged, created_by)
      VALUES (${template.account_id}, ${template.to_account_id || null}, ${template.type}, ${template.amount}, ${template.description || template.name}, ${template.category || null}, ${dateStr}, false, ${req.user.userId})
      RETURNING *
    `;

    await sql`
      INSERT INTO bulk_generated_transactions (template_id, transaction_id, generated_date)
      VALUES (${template.id}, ${txn.id}, ${dateStr})
    `;

    generated.push(txn);
    currentDate = computeNextOccurrence(currentDate, template.interval_type, template.interval_value);
  }

  await sql`
    UPDATE recurring_templates SET next_occurrence = ${currentDate.toISOString().slice(0, 10)}, updated_at = now()
    WHERE id = ${template.id}
  `;

  res.json({ generated, next_occurrence: currentDate.toISOString().slice(0, 10) });
});

router.post("/bulk-generate", async (req, res) => {
  const { years = 1 } = req.body;
  const templates = await sql`
    SELECT * FROM recurring_templates
    WHERE user_id = ${req.user.userId} AND is_active = true
  `;

  const allGenerated = [];
  for (const t of templates) {
    let count = 0;
    let currentDate = new Date(t.next_occurrence);
    const endLimit = t.end_date
      ? new Date(t.end_date)
      : new Date(currentDate.getTime() + years * 365 * 24 * 60 * 60 * 1000);

    while (currentDate <= endLimit) {
      const dateStr = currentDate.toISOString().slice(0, 10);

      const [existing] = await sql`
        SELECT bt.id FROM bulk_generated_transactions bt
        JOIN transactions t ON t.id = bt.transaction_id
        WHERE bt.template_id = ${t.id} AND t.date = ${dateStr}
        LIMIT 1
      `;

      if (!existing) {
        const [txn] = await sql`
          INSERT INTO transactions (account_id, to_account_id, type, amount, description, category, date, is_staged, created_by)
          VALUES (${t.account_id}, ${t.to_account_id || null}, ${t.type}, ${t.amount}, ${t.description || t.name}, ${t.category || null}, ${dateStr}, false, ${req.user.userId})
          RETURNING *
        `;

        await sql`
          INSERT INTO bulk_generated_transactions (template_id, transaction_id, generated_date)
          VALUES (${t.id}, ${txn.id}, ${dateStr})
        `;

        allGenerated.push(txn);
        count++;
      }

      currentDate = computeNextOccurrence(currentDate, t.interval_type, t.interval_value);
    }

    if (count > 0) {
      await sql`
        UPDATE recurring_templates SET next_occurrence = ${currentDate.toISOString().slice(0, 10)}, updated_at = now()
        WHERE id = ${t.id}
      `;
    }
  }

  res.json({ generated: allGenerated, count: allGenerated.length });
});

export default router;
