import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const { q, type, category, limit = 20 } = req.query;
  const searchTerm = q ? `%${q}%` : null;

  let txnQuery = sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name,
      'transaction' AS result_type, p.name AS project_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.created_by = ${req.user.userId}
  `;
  if (searchTerm) {
    txnQuery = sql`${txnQuery} AND (t.description ILIKE ${searchTerm} OR t.category ILIKE ${searchTerm})`;
  }
  if (type && type !== "all") {
    txnQuery = sql`${txnQuery} AND t.type = ${type}`;
  }
  if (category) {
    txnQuery = sql`${txnQuery} AND t.category ILIKE ${`%${category}%`}`;
  }
  txnQuery = sql`${txnQuery} ORDER BY t.date DESC LIMIT ${limit}`;

  const transactions = await txnQuery;

  const projectQuery = searchTerm
    ? sql`
        SELECT *, 'project' AS result_type FROM projects
        WHERE created_by = ${req.user.userId} AND name ILIKE ${searchTerm}
        LIMIT 5
      `
    : sql`SELECT *, 'project' AS result_type FROM projects WHERE created_by = ${req.user.userId} LIMIT 0`;

  const projects = await projectQuery;

  res.json({ results: [...transactions, ...projects] });
});

export default router;
