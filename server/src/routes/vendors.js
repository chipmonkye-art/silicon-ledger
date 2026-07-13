import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const vendors = await sql`SELECT * FROM vendors ORDER BY name`;
  res.json({ vendors });
});

router.get("/:id", async (req, res) => {
  const [vendor] = await sql`SELECT * FROM vendors WHERE id = ${req.params.id}`;
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });
  res.json({ vendor });
});

router.post("/", async (req, res) => {
  const { name, contact_name, email, phone, address, tax_id, payment_terms } = req.body;
  const [vendor] = await sql`
    INSERT INTO vendors (name, contact_name, email, phone, address, tax_id, payment_terms)
    VALUES (${name}, ${contact_name}, ${email}, ${phone}, ${address}, ${tax_id}, ${payment_terms})
    RETURNING *
  `;
  res.status(201).json({ vendor });
});

router.put("/:id", async (req, res) => {
  const { name, contact_name, email, phone, address, tax_id, payment_terms } = req.body;
  const [vendor] = await sql`
    UPDATE vendors SET
      name = COALESCE(${name}, name),
      contact_name = COALESCE(${contact_name}, contact_name),
      email = COALESCE(${email}, email),
      phone = COALESCE(${phone}, phone),
      updated_at = now()
    WHERE id = ${req.params.id}
    RETURNING *
  `;
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });
  res.json({ vendor });
});

export default router;
