import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const accounts = await sql`
    SELECT * FROM account_balances
    WHERE user_id = ${req.user.userId}
    ORDER BY type, name
  `;
  const totalAssets = accounts
    .filter((a) => a.include_in_assets && a.type !== "credit_card")
    .reduce((s, a) => s + Number(a.current_balance), 0);
  const totalLiabilities = accounts
    .filter((a) => a.type === "credit_card")
    .reduce((s, a) => s + Math.abs(Number(a.current_balance)), 0);
  res.json({ accounts, summary: { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities } });
});

router.get("/:id", async (req, res) => {
  const [account] = await sql`
    SELECT * FROM account_balances
    WHERE id = ${req.params.id} AND user_id = ${req.user.userId}
  `;
  if (!account) return res.status(404).json({ message: "Account not found" });
  res.json({ account });
});

router.post("/", async (req, res) => {
  const { name, type, currency, color, icon, opening_balance, include_in_assets } = req.body;
  const [account] = await sql`
    INSERT INTO accounts (user_id, name, type, currency, color, icon, opening_balance, include_in_assets)
    VALUES (${req.user.userId}, ${name}, ${type}, ${currency || "USD"}, ${color || "#6366f1"}, ${icon || "wallet"}, ${Math.round(opening_balance || 0)}, ${include_in_assets !== false})
    RETURNING *
  `;
  res.status(201).json({ account });
});

router.put("/:id", async (req, res) => {
  const { name, color, icon, opening_balance, include_in_assets } = req.body;
  const [account] = await sql`
    UPDATE accounts SET
      name = COALESCE(${name}, name),
      color = COALESCE(${color}, color),
      icon = COALESCE(${icon}, icon),
      opening_balance = COALESCE(${opening_balance != null ? Math.round(opening_balance) : null}, opening_balance),
      include_in_assets = COALESCE(${include_in_assets != null ? include_in_assets : null}, include_in_assets),
      updated_at = now()
    WHERE id = ${req.params.id} AND user_id = ${req.user.userId}
    RETURNING *
  `;
  if (!account) return res.status(404).json({ message: "Account not found" });
  res.json({ account });
});

router.delete("/:id", async (req, res) => {
  const [existing] = await sql`
    SELECT id FROM accounts WHERE id = ${req.params.id} AND user_id = ${req.user.userId}
  `;
  if (!existing) return res.status(404).json({ message: "Account not found" });

  const [txn] = await sql`
    SELECT id FROM transactions WHERE account_id = ${req.params.id} OR to_account_id = ${req.params.id} LIMIT 1
  `;
  if (txn) {
    return res.status(409).json({ message: "Cannot delete account with existing transactions. Archive it instead." });
  }

  await sql`DELETE FROM accounts WHERE id = ${req.params.id}`;
  res.status(204).end();
});

export default router;
