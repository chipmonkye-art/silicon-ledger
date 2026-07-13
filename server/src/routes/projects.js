import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const { role, userId } = req.user;
  let rows;
  if (role === "md" || role === "finance") {
    rows = await sql`SELECT * FROM projects ORDER BY created_at DESC`;
  } else {
    rows = await sql`
      SELECT p.* FROM projects p
      JOIN user_projects up ON up.project_id = p.id
      WHERE up.user_id = ${userId}
      ORDER BY p.created_at DESC
    `;
  }

  const spentRows = await sql`
    SELECT project_id, SUM(amount) AS spent FROM transactions
    WHERE type = 'expense' AND is_staged = false
      AND project_id = ANY(${rows.map((r) => r.id)})
    GROUP BY project_id
  `;
  const spentMap = Object.fromEntries(spentRows.map((r) => [r.project_id, Number(r.spent)]));

  const projects = rows.map((p) => ({
    ...p,
    spent: spentMap[p.id] || 0,
  }));

  res.json({ projects });
});

router.post("/", requireRole("finance", "md"), async (req, res) => {
  const { name, location, description, budget, start_date, end_date } = req.body;
  const [project] = await sql`
    INSERT INTO projects (name, location, description, budget, start_date, end_date, created_by)
    VALUES (${name}, ${location}, ${description}, ${budget}, ${start_date}, ${end_date}, ${req.user.userId})
    RETURNING *
  `;
  res.status(201).json({ project });
});

router.get("/:id", async (req, res) => {
  const [project] = await sql`SELECT * FROM projects WHERE id = ${req.params.id}`;
  if (!project) return res.status(404).json({ message: "Project not found" });

  const [spentRow] = await sql`
    SELECT COALESCE(SUM(amount), 0) AS spent FROM transactions
    WHERE project_id = ${req.params.id} AND type = 'expense' AND is_staged = false
  `;

  res.json({ project: { ...project, spent: Number(spentRow.spent) } });
});

router.put("/:id", requireRole("finance", "md"), async (req, res) => {
  const { name, location, description, budget, status, start_date, end_date } = req.body;
  const [project] = await sql`
    UPDATE projects SET
      name = COALESCE(${name}, name),
      location = COALESCE(${location}, location),
      description = COALESCE(${description}, description),
      budget = COALESCE(${budget}, budget),
      status = COALESCE(${status}, status),
      start_date = COALESCE(${start_date}, start_date),
      end_date = COALESCE(${end_date}, end_date),
      updated_at = now()
    WHERE id = ${req.params.id}
    RETURNING *
  `;
  res.json({ project });
});

export default router;
