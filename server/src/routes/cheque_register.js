import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

const VALID_STATUSES = ["issued", "cleared", "bounced", "cancelled", "stopped", "post_dated"];

router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id, status, from, to, search } = req.query;

  let query = sql`SELECT c.*, a.name AS account_name FROM cheque_register c JOIN accounts a ON a.id = c.account_id WHERE c.workspace_id = ${ws}`;

  if (account_id) query = sql`${query} AND c.account_id = ${account_id}`;
  if (status) query = sql`${query} AND c.status = ${status}`;
  if (from) query = sql`${query} AND c.cheque_date >= ${from}`;
  if (to) query = sql`${query} AND c.cheque_date <= ${to}`;
  if (search) {
    const term = `%${search}%`;
    query = sql`${query} AND (c.payee ILIKE ${term} OR c.cheque_number::text ILIKE ${term} OR c.notes ILIKE ${term})`;
  }

  query = sql`${query} ORDER BY c.cheque_date DESC, c.cheque_number`;
  const cheques = await query;
  res.json({ cheques });
});

router.get("/books", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id } = req.query;

  if (!account_id) return res.status(422).json({ message: "account_id query param is required" });

  const books = await sql`
    SELECT DISTINCT cheque_book_name FROM cheque_register
    WHERE workspace_id = ${ws} AND account_id = ${account_id}
    ORDER BY cheque_book_name
  `;
  res.json({ books: books.map((b) => b.cheque_book_name) });
});

router.get("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [cheque] = await sql`
    SELECT c.*, a.name AS account_name
    FROM cheque_register c
    JOIN accounts a ON a.id = c.account_id
    WHERE c.id = ${req.params.id} AND c.workspace_id = ${ws}
  `;
  if (!cheque) return res.status(404).json({ message: "Cheque not found" });
  res.json({ cheque });
});

router.post("/", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id, cheque_book_name, cheque_number, cheque_date, payee, amount_minor, notes } = req.body;

  if (!account_id || !cheque_number || !cheque_date || !payee || amount_minor == null) {
    return res.status(422).json({ message: "account_id, cheque_number, cheque_date, payee, and amount_minor are required" });
  }

  const [existing] = await sql`
    SELECT id FROM cheque_register WHERE workspace_id = ${ws} AND cheque_number = ${cheque_number} AND account_id = ${account_id}
  `;
  if (existing) return res.status(409).json({ message: "Cheque number already exists for this account" });

  const [cheque] = await sql`
    INSERT INTO cheque_register (workspace_id, account_id, cheque_book_name, cheque_number, cheque_date, payee, amount_minor, notes, status)
    VALUES (${ws}, ${account_id}, ${cheque_book_name || null}, ${cheque_number}, ${cheque_date}, ${payee}, ${Math.round(amount_minor)}, ${notes || null}, 'issued')
    RETURNING *
  `;
  res.status(201).json({ cheque });
});

router.patch("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const { status, bank_clearance_date, bounce_reason, notes } = req.body;

  const [existing] = await sql`
    SELECT * FROM cheque_register WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!existing) return res.status(404).json({ message: "Cheque not found" });

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(422).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    if (status === "bounced" && !bounce_reason) {
      return res.status(422).json({ message: "bounce_reason is required when status is bounced" });
    }
  }

  const [cheque] = await sql`
    UPDATE cheque_register SET
      status = COALESCE(${status}, status),
      bank_clearance_date = COALESCE(${bank_clearance_date}, bank_clearance_date),
      bounce_reason = COALESCE(${bounce_reason}, bounce_reason),
      notes = COALESCE(${notes}, notes)
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  res.json({ cheque });
});

export default router;
