import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const { q, txn_type, category_id, limit = 20 } = req.query;
  const searchTerm = q ? `%${q}%` : null;

  let query = sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.workspace_id = ${ws}
  `;
  if (searchTerm) {
    query = sql`${query} AND (t.description ILIKE ${searchTerm} OR t.note ILIKE ${searchTerm})`;
  }
  if (txn_type && txn_type !== "all") {
    query = sql`${query} AND t.txn_type = ${txn_type}`;
  }
  if (category_id) {
    query = sql`${query} AND t.category_id = ${category_id}`;
  }
  query = sql`${query} ORDER BY t.occurred_on DESC LIMIT ${limit}`;

  const transactions = await query;
  res.json({ results: transactions });
});

export default router;
