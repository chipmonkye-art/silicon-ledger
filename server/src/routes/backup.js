import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/export", async (req, res) => {
  const userId = req.user.userId;

  const [accounts, categories, projects, transactions, expenses, invoices, vendors, recurring] =
    await Promise.all([
      sql`SELECT * FROM accounts WHERE user_id = ${userId} ORDER BY created_at`,
      sql`SELECT * FROM categories ORDER BY created_at`,
      sql`SELECT * FROM projects WHERE created_by = ${userId} ORDER BY created_at`,
      sql`SELECT * FROM transactions WHERE created_by = ${userId} ORDER BY created_at`,
      sql`SELECT * FROM expenses WHERE created_by = ${userId} ORDER BY created_at`,
      sql`SELECT * FROM invoices WHERE created_by = ${userId} ORDER BY created_at`,
      sql`SELECT * FROM vendors ORDER BY created_at`,
      sql`SELECT * FROM recurring_templates WHERE user_id = ${userId} ORDER BY created_at`,
    ]);

  const backup = {
    version: 1,
    exported_at: new Date().toISOString(),
    user_id: userId,
    data: { accounts, categories, projects, transactions, expenses, invoices, vendors, recurring },
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="silicon-ledger-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(backup);
});

router.post("/import", async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(422).json({ message: "No data provided" });

  const userId = req.user.userId;

  try {
    await sql.begin(async (tx) => {
      if (data.categories?.length) {
        for (const cat of data.categories) {
          await tx`
            INSERT INTO categories (id, name, type, icon, color, created_at)
            VALUES (${cat.id}, ${cat.name}, ${cat.type}, ${cat.icon || null}, ${cat.color || null}, ${cat.created_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.vendors?.length) {
        for (const v of data.vendors) {
          await tx`
            INSERT INTO vendors (id, name, contact_name, email, phone, address, tax_id, payment_terms, created_at, updated_at)
            VALUES (${v.id}, ${v.name}, ${v.contact_name || null}, ${v.email || null}, ${v.phone || null}, ${v.address || null}, ${v.tax_id || null}, ${v.payment_terms || null}, ${v.created_at || new Date()}, ${v.updated_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.accounts?.length) {
        for (const a of data.accounts) {
          await tx`
            INSERT INTO accounts (id, user_id, name, type, currency, color, icon, opening_balance, include_in_assets, created_at, updated_at)
            VALUES (${a.id}, ${userId}, ${a.name}, ${a.type}, ${a.currency || "USD"}, ${a.color || "#6366f1"}, ${a.icon || "wallet"}, ${a.opening_balance || 0}, ${a.include_in_assets !== false}, ${a.created_at || new Date()}, ${a.updated_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.projects?.length) {
        for (const p of data.projects) {
          await tx`
            INSERT INTO projects (id, name, location, description, budget, status, start_date, end_date, created_by, created_at, updated_at)
            VALUES (${p.id}, ${p.name}, ${p.location || null}, ${p.description || null}, ${p.budget || 0}, ${p.status || "planning"}, ${p.start_date || null}, ${p.end_date || null}, ${userId}, ${p.created_at || new Date()}, ${p.updated_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.transactions?.length) {
        for (const t of data.transactions) {
          await tx`
            INSERT INTO transactions (id, project_id, account_id, to_account_id, type, amount, description, category, receipt_url, vendor_id, date, is_staged, approved_by, approved_at, created_by, created_at, updated_at)
            VALUES (${t.id}, ${t.project_id || null}, ${t.account_id}, ${t.to_account_id || null}, ${t.type}, ${t.amount}, ${t.description}, ${t.category || null}, ${t.receipt_url || null}, ${t.vendor_id || null}, ${t.date || new Date()}, ${t.is_staged !== false}, ${t.approved_by || null}, ${t.approved_at || null}, ${userId}, ${t.created_at || new Date()}, ${t.updated_at || null})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.expenses?.length) {
        for (const e of data.expenses) {
          await tx`
            INSERT INTO expenses (id, project_id, vendor_id, amount, category, description, receipt_url, status, approved_by, approved_at, created_by, created_at, updated_at)
            VALUES (${e.id}, ${e.project_id}, ${e.vendor_id || null}, ${e.amount}, ${e.category}, ${e.description}, ${e.receipt_url || null}, ${e.status || "draft"}, ${e.approved_by || null}, ${e.approved_at || null}, ${userId}, ${e.created_at || new Date()}, ${e.updated_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.invoices?.length) {
        for (const i of data.invoices) {
          await tx`
            INSERT INTO invoices (id, project_id, vendor_id, invoice_number, amount, due_date, description, status, paid_at, created_by, created_at, updated_at)
            VALUES (${i.id}, ${i.project_id}, ${i.vendor_id}, ${i.invoice_number}, ${i.amount}, ${i.due_date}, ${i.description || null}, ${i.status || "pending"}, ${i.paid_at || null}, ${userId}, ${i.created_at || new Date()}, ${i.updated_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.recurring?.length) {
        for (const r of data.recurring) {
          await tx`
            INSERT INTO recurring_templates (id, user_id, name, type, amount, account_id, to_account_id, category, description, interval_type, interval_value, next_occurrence, end_date, is_active, created_at, updated_at)
            VALUES (${r.id}, ${userId}, ${r.name}, ${r.type}, ${r.amount}, ${r.account_id}, ${r.to_account_id || null}, ${r.category || null}, ${r.description || null}, ${r.interval_type}, ${r.interval_value || 1}, ${r.next_occurrence || new Date()}, ${r.end_date || null}, ${r.is_active !== false}, ${r.created_at || new Date()}, ${r.updated_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }
    });

    res.json({ message: "Import successful", imported: Object.keys(data).reduce((s, k) => s + (data[k]?.length || 0), 0) });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ message: "Import failed: " + err.message });
  }
});

export default router;
