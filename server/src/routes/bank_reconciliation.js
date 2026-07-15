import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

router.get("/statements", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id } = req.query;

  let query = sql`
    SELECT bs.*, a.name AS account_name,
      (SELECT COUNT(*)::int FROM bank_statement_lines WHERE bank_statement_id = bs.id) AS line_count,
      (SELECT COUNT(*)::int FROM bank_statement_lines WHERE bank_statement_id = bs.id AND match_status = 'unmatched') AS unmatched_count
    FROM bank_statements bs
    JOIN accounts a ON a.id = bs.account_id
    WHERE bs.workspace_id = ${ws}
  `;

  if (account_id) query = sql`${query} AND bs.account_id = ${account_id}`;
  query = sql`${query} ORDER BY bs.statement_date DESC`;

  const statements = await query;
  res.json({ statements });
});

router.get("/statements/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [statement] = await sql`
    SELECT bs.*, a.name AS account_name
    FROM bank_statements bs
    JOIN accounts a ON a.id = bs.account_id
    WHERE bs.id = ${req.params.id} AND bs.workspace_id = ${ws}
  `;
  if (!statement) return res.status(404).json({ message: "Statement not found" });

  const lines = await sql`
    SELECT bsl.*,
      t.id AS matched_txn_id, t.description AS matched_txn_description, t.amount_minor AS matched_txn_amount,
      t.txn_type AS matched_txn_type, t.occurred_on AS matched_txn_date
    FROM bank_statement_lines bsl
    LEFT JOIN transactions t ON t.id = bsl.matched_transaction_id
    WHERE bsl.bank_statement_id = ${req.params.id}
    ORDER BY bsl.transaction_date
  `;

  res.json({ statement, lines });
});

router.post("/statements", async (req, res) => {
  const { ws } = req.workspace;
  const { account_id, statement_date, closing_balance, currency, lines } = req.body;

  if (!account_id || !statement_date || closing_balance == null) {
    return res.status(422).json({ message: "account_id, statement_date, and closing_balance are required" });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(422).json({ message: "lines must be a non-empty array" });
  }

  const [statement] = await sql`
    INSERT INTO bank_statements (workspace_id, account_id, statement_date, closing_balance, currency)
    VALUES (${ws}, ${account_id}, ${statement_date}, ${Math.round(closing_balance)}, ${currency || "USD"})
    RETURNING *
  `;

  const inserted = [];
  for (const line of lines) {
    if (!line.transaction_date) continue;
    const [insertedLine] = await sql`
      INSERT INTO bank_statement_lines (bank_statement_id, transaction_date, description, debit_minor, credit_minor, balance, ref_number)
      VALUES (${statement.id}, ${line.transaction_date}, ${line.description || ''}, ${line.debit_minor != null ? Math.round(line.debit_minor) : null}, ${line.credit_minor != null ? Math.round(line.credit_minor) : null}, ${line.balance != null ? Math.round(line.balance) : null}, ${line.ref_number || null})
      RETURNING *
    `;
    inserted.push(insertedLine);
  }

  // Auto-run matching
  const matchResult = await runAutoMatch(ws, statement.id, account_id);

  res.status(201).json({ statement, lines: inserted, matched: matchResult.matched });
});

async function runAutoMatch(ws, statementId, accountId) {
  const unmatchedLines = await sql`
    SELECT * FROM bank_statement_lines
    WHERE bank_statement_id = ${statementId} AND match_status = 'unmatched'
  `;

  let matched = 0;
  for (const line of unmatchedLines) {
    const amount = line.debit_minor || line.credit_minor || 0;
    const dateStart = new Date(line.transaction_date);
    dateStart.setDate(dateStart.getDate() - 3);
    const dateEnd = new Date(line.transaction_date);
    dateEnd.setDate(dateEnd.getDate() + 3);

    const candidates = await sql`
      SELECT id, amount_minor, txn_type, occurred_on, description
      FROM transactions
      WHERE workspace_id = ${ws}
        AND account_id = ${accountId}
        AND occurred_on >= ${dateStart.toISOString().slice(0, 10)}
        AND occurred_on <= ${dateEnd.toISOString().slice(0, 10)}
        AND is_staged = false
        AND is_rejected = false
      ORDER BY occurred_on
    `;

    let lineMatched = false;
    for (const txn of candidates) {
      const txnExpense = txn.txn_type === "expense" ? txn.amount_minor : null;
      const txnIncome = txn.txn_type === "income" ? txn.amount_minor : null;

      const debitMatch = line.debit_minor != null && txnExpense === line.debit_minor;
      const creditMatch = line.credit_minor != null && txnIncome === line.credit_minor;

      if (debitMatch || creditMatch) {
        const confidence = amount === txn.amount_minor ? 100 : 70;

        await sql`
          UPDATE bank_statement_lines SET
            match_status = 'auto_matched',
            matched_transaction_id = ${txn.id},
            match_confidence = ${confidence}
          WHERE id = ${line.id}
        `;
        matched++;
        lineMatched = true;
        break;
      }
    }

    if (!lineMatched) {
      const [check] = await sql`
        SELECT match_status FROM bank_statement_lines WHERE id = ${line.id}
      `;
      if (check.match_status === 'unmatched') {
        await sql`
          UPDATE bank_statement_lines SET match_status = 'unmatched'
          WHERE id = ${line.id}
        `;
      }
    }
  }

  return { matched };
}

router.post("/statements/:id/match-auto", async (req, res) => {
  const { ws } = req.workspace;
  const [statement] = await sql`
    SELECT * FROM bank_statements WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!statement) return res.status(404).json({ message: "Statement not found" });

  const result = await runAutoMatch(ws, statement.id, statement.account_id);
  res.json({ matched: result.matched });
});

router.post("/statements/:id/lines/:lineId/match", async (req, res) => {
  const { ws } = req.workspace;
  const { transaction_id } = req.body;
  if (!transaction_id) return res.status(422).json({ message: "transaction_id is required" });

  const [line] = await sql`
    SELECT bsl.* FROM bank_statement_lines bsl
    JOIN bank_statements bs ON bs.id = bsl.bank_statement_id
    WHERE bsl.id = ${req.params.lineId} AND bsl.bank_statement_id = ${req.params.id} AND bs.workspace_id = ${ws}
  `;
  if (!line) return res.status(404).json({ message: "Statement line not found" });

  const [txn] = await sql`
    SELECT id FROM transactions WHERE id = ${transaction_id} AND workspace_id = ${ws}
  `;
  if (!txn) return res.status(404).json({ message: "Transaction not found" });

  const [updated] = await sql`
    UPDATE bank_statement_lines SET
      match_status = 'manual_matched',
      matched_transaction_id = ${transaction_id},
      match_confidence = 100
    WHERE id = ${req.params.lineId}
    RETURNING *
  `;

  res.json({ line: updated });
});

router.post("/statements/:id/lines/:lineId/ignore", async (req, res) => {
  const { ws } = req.workspace;

  const [line] = await sql`
    SELECT bsl.* FROM bank_statement_lines bsl
    JOIN bank_statements bs ON bs.id = bsl.bank_statement_id
    WHERE bsl.id = ${req.params.lineId} AND bsl.bank_statement_id = ${req.params.id} AND bs.workspace_id = ${ws}
  `;
  if (!line) return res.status(404).json({ message: "Statement line not found" });

  const [updated] = await sql`
    UPDATE bank_statement_lines SET match_status = 'ignored'
    WHERE id = ${req.params.lineId}
    RETURNING *
  `;

  res.json({ line: updated });
});

router.get("/unmatched", async (req, res) => {
  const { ws } = req.workspace;

  const [result] = await sql`
    SELECT COUNT(*)::int AS unmatched_count
    FROM bank_statement_lines bsl
    JOIN bank_statements bs ON bs.id = bsl.bank_statement_id
    WHERE bs.workspace_id = ${ws} AND bsl.match_status = 'unmatched'
  `;

  const byAccount = await sql`
    SELECT bs.account_id, a.name AS account_name, COUNT(*)::int AS unmatched_count
    FROM bank_statement_lines bsl
    JOIN bank_statements bs ON bs.id = bsl.bank_statement_id
    JOIN accounts a ON a.id = bs.account_id
    WHERE bs.workspace_id = ${ws} AND bsl.match_status = 'unmatched'
    GROUP BY bs.account_id, a.name
    ORDER BY a.name
  `;

  res.json({ unmatched: result.unmatched_count, byAccount });
});

export default router;
