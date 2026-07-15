import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

router.get("/", async (req, res) => {
  const { ws } = req.workspace;

  const [staleStaged, pendingReview] = await Promise.all([
    sql`
      SELECT id, description, amount_minor, occurred_on, account_id, created_at
      FROM transactions
      WHERE workspace_id = ${ws} AND is_staged = true AND created_at < now() - interval '3 days'
      ORDER BY created_at DESC
      LIMIT 10
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM transactions
      WHERE workspace_id = ${ws} AND is_staged = true
    `,
  ]);

  res.json({
    stale_staged: staleStaged.map((t) => ({
      id: t.id,
      type: "stale_staged",
      message: `"${t.description}" staged for ${Math.floor((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24))} days`,
      link: `/transactions`,
      created_at: t.created_at,
    })),
    pending_review: pendingReview[0]?.count || 0,
    total: staleStaged.length,
  });
});

export default router;
