import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

router.get("/export", async (req, res) => {
  const { ws } = req.workspace;

  const [profiles, accounts, categories, transactions, recurring] = await Promise.all([
    sql`SELECT * FROM profiles WHERE id = ${req.user.userId}`,
    sql`SELECT * FROM accounts WHERE workspace_id = ${ws} ORDER BY created_at`,
    sql`SELECT * FROM categories WHERE workspace_id = ${ws} ORDER BY created_at`,
    sql`SELECT * FROM transactions WHERE workspace_id = ${ws} ORDER BY created_at`,
    sql`SELECT * FROM recurring_transactions WHERE workspace_id = ${ws} ORDER BY created_at`,
  ]);

  const backup = {
    version: 1,
    exported_at: new Date().toISOString(),
    workspace_id: ws,
    data: { profiles, accounts, categories, transactions, recurring },
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="silicon-ledger-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(backup);
});

router.post("/import", async (req, res) => {
  const { ws } = req.workspace;
  const { data } = req.body;
  if (!data) return res.status(422).json({ message: "No data provided" });
  const userId = req.user.userId;

  try {
    await sql.begin(async (tx) => {
      if (data.categories?.length) {
        for (const cat of data.categories) {
          await tx`
            INSERT INTO categories (id, user_id, workspace_id, parent_id, name, kind, created_at)
            VALUES (${cat.id}, ${userId}, ${ws}, ${cat.parent_id || null}, ${cat.name}, ${cat.kind}, ${cat.created_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.accounts?.length) {
        for (const a of data.accounts) {
          await tx`
            INSERT INTO accounts (id, user_id, workspace_id, name, type, currency, icon, color, opening_balance, include_in_assets, archived_at, created_at)
            VALUES (${a.id}, ${userId}, ${ws}, ${a.name}, ${a.type}, ${a.currency || "USD"}, ${a.icon || "wallet"}, ${a.color || "#1a1a1a"}, ${a.opening_balance || 0}, ${a.include_in_assets !== false}, ${a.archived_at || null}, ${a.created_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.transactions?.length) {
        for (const t of data.transactions) {
          await tx`
            INSERT INTO transactions (id, user_id, workspace_id, account_id, to_account_id, category_id, txn_type, amount_minor, currency, occurred_on, description, note, is_staged, recurring_id, created_at)
            VALUES (${t.id}, ${userId}, ${ws}, ${t.account_id}, ${t.to_account_id || null}, ${t.category_id || null}, ${t.txn_type}, ${t.amount_minor}, ${t.currency || "USD"}, ${t.occurred_on}, ${t.description || ""}, ${t.note || ""}, ${t.is_staged !== false}, ${t.recurring_id || null}, ${t.created_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }

      if (data.recurring?.length) {
        for (const r of data.recurring) {
          await tx`
            INSERT INTO recurring_transactions (id, user_id, workspace_id, account_id, to_account_id, category_id, txn_type, amount_minor, currency, description, note, interval_type, interval_days, start_date, end_date, occurrences_remaining, is_active, created_at)
            VALUES (${r.id}, ${userId}, ${ws}, ${r.account_id}, ${r.to_account_id || null}, ${r.category_id || null}, ${r.txn_type}, ${r.amount_minor}, ${r.currency || "USD"}, ${r.description || ""}, ${r.note || ""}, ${r.interval_type}, ${r.interval_days || null}, ${r.start_date}, ${r.end_date || null}, ${r.occurrences_remaining || null}, ${r.is_active !== false}, ${r.created_at || new Date()})
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }
    });

    const totalImported = Object.keys(data).reduce((s, k) => s + (data[k]?.length || 0), 0);
    res.json({ message: "Import successful", imported: totalImported });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ message: "Import failed: " + err.message });
  }
});

export default router;
