import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const categories = await sql`SELECT * FROM categories ORDER BY type, name`;
  res.json({ categories });
});

router.post("/", async (req, res) => {
  const { name, type, icon, color } = req.body;
  const [category] = await sql`
    INSERT INTO categories (name, type, icon, color)
    VALUES (${name}, ${type}, ${icon}, ${color})
    RETURNING *
  `;
  res.status(201).json({ category });
});

export default router;
