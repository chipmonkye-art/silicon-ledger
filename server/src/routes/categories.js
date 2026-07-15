import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

function buildTree(categories, parentId = null) {
  return categories
    .filter((c) => c.parent_id === parentId)
    .map((c) => ({ ...c, children: buildTree(categories, c.id) }));
}

router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const all = await sql`
    SELECT * FROM categories WHERE workspace_id = ${ws}
    ORDER BY kind, parent_id NULLS FIRST, name
  `;
  res.json({ categories: all, tree: buildTree(all) });
});

router.get("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [category] = await sql`
    SELECT * FROM categories WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!category) return res.status(404).json({ message: "Category not found" });
  res.json({ category });
});

router.post("/", async (req, res) => {
  const { ws } = req.workspace;
  const { parent_id, name, kind } = req.body;
  if (!name || !kind) return res.status(422).json({ message: "name and kind are required" });
  if (!["income", "expense"].includes(kind)) {
    return res.status(422).json({ message: "kind must be 'income' or 'expense'" });
  }

  if (parent_id) {
    const [parent] = await sql`
      SELECT id, kind FROM categories WHERE id = ${parent_id} AND workspace_id = ${ws}
    `;
    if (!parent) return res.status(404).json({ message: "Parent category not found" });
    if (parent.kind !== kind) return res.status(422).json({ message: "Child category kind must match parent" });
  }

  try {
    const [category] = await sql`
      INSERT INTO categories (user_id, workspace_id, parent_id, name, kind)
      VALUES (${req.user.userId}, ${ws}, ${parent_id || null}, ${name}, ${kind})
      RETURNING *
    `;
    res.status(201).json({ category });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "A category with this name already exists at this level" });
    }
    throw err;
  }
});

export default router;
