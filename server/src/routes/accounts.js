import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

const VALID_TYPES = ["cash", "bank", "credit_card", "ewallet", "custom"];

router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const accounts = await sql`
    SELECT a.*, COALESCE(b.current_balance, a.opening_balance) AS current_balance
    FROM accounts a
    LEFT JOIN account_balances b ON b.account_id = a.id
    WHERE a.workspace_id = ${ws}
    ORDER BY a.archived_at NULLS FIRST, a.type, a.name
  `;

  const totalAssets = accounts
    .filter((a) => a.include_in_assets && a.type !== "credit_card" && !a.archived_at)
    .reduce((s, a) => s + Number(a.current_balance), 0);
  const totalLiabilities = accounts
    .filter((a) => a.type === "credit_card" && !a.archived_at)
    .reduce((s, a) => s + Math.abs(Number(a.current_balance)), 0);

  res.json({ accounts, summary: { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities } });
});

router.get("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [account] = await sql`
    SELECT a.*, COALESCE(b.current_balance, a.opening_balance) AS current_balance
    FROM accounts a
    LEFT JOIN account_balances b ON b.account_id = a.id
    WHERE a.id = ${req.params.id} AND a.workspace_id = ${ws}
  `;
  if (!account) return res.status(404).json({ message: "Account not found" });
  res.json({ account });
});

router.post("/", async (req, res) => {
  const { ws } = req.workspace;
  const { name, type, currency, icon, color, opening_balance, include_in_assets } = req.body;
  if (!name || !type) return res.status(422).json({ message: "name and type are required" });
  if (!VALID_TYPES.includes(type)) {
    return res.status(422).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` });
  }
  const [account] = await sql`
    INSERT INTO accounts (user_id, workspace_id, name, type, currency, icon, color, opening_balance, include_in_assets)
    VALUES (${req.user.userId}, ${ws}, ${name}, ${type}, ${currency || "USD"}, ${icon || "wallet"}, ${color || "#1a1a1a"}, ${Math.round(opening_balance || 0)}, ${include_in_assets !== false})
    RETURNING *
  `;
  res.status(201).json({ account });
});

router.put("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const { name, icon, color, opening_balance, include_in_assets } = req.body;
  const [account] = await sql`
    UPDATE accounts SET
      name = COALESCE(${name}, name),
      icon = COALESCE(${icon}, icon),
      color = COALESCE(${color}, color),
      opening_balance = COALESCE(${opening_balance != null ? Math.round(opening_balance) : null}, opening_balance),
      include_in_assets = COALESCE(${include_in_assets != null ? include_in_assets : null}, include_in_assets)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!account) return res.status(404).json({ message: "Account not found" });
  res.json({ account });
});

router.post("/:id/archive", async (req, res) => {
  const { ws } = req.workspace;
  const [account] = await sql`
    UPDATE accounts SET archived_at = now()
    WHERE id = ${req.params.id} AND workspace_id = ${ws} AND archived_at IS NULL
    RETURNING *
  `;
  if (!account) return res.status(404).json({ message: "Account not found or already archived" });
  res.json({ account });
});

router.post("/:id/unarchive", async (req, res) => {
  const { ws } = req.workspace;
  const [account] = await sql`
    UPDATE accounts SET archived_at = NULL
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!account) return res.status(404).json({ message: "Account not found" });
  res.json({ account });
});

export default router;
