import { Router } from "express";
import bcrypt from "bcryptjs";
import sql from "../db/index.js";
import { signToken, authMiddleware } from "../middleware/auth.js";

const router = Router();

router.post("/register", async (req, res) => {
  const { email, password, name, role } = req.body;
  const password_hash = await bcrypt.hash(password, 10);
  const [user] = await sql`
    INSERT INTO users (email, password_hash, name, role)
    VALUES (${email}, ${password_hash}, ${name}, ${role || "site_manager"})
    RETURNING id, email, name, role, created_at
  `;
  const token = signToken({ userId: user.id, role: user.role, email: user.email });
  res.status(201).json({ user, token });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const [user] = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const token = signToken({ userId: user.id, role: user.role, email: user.email });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token });
});

router.get("/me", authMiddleware, async (req, res) => {
  const [user] = await sql`SELECT id, email, name, role, avatar_url FROM users WHERE id = ${req.user.userId}`;
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

export default router;
