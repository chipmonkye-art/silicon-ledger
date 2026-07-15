import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// NLP query parser — converts natural language to structured filters
function parseNLPQuery(query) {
  const q = query.toLowerCase().trim();
  const filters = {
    text: query,
    txn_type: null,
    date_from: null,
    date_to: null,
    min_amount: null,
    max_amount: null,
    status: null,
    account: null,
    category: null,
  };

  // Transaction type detection
  if (/\b(income|earned|received|deposit|salary|revenue)\b/.test(q)) {
    filters.txn_type = "income";
  } else if (/\b(expense|spent|paid|purchase|bought|payment|cost)\b/.test(q)) {
    filters.txn_type = "expense";
  } else if (/\b(transfer|moved|sent to)\b/.test(q)) {
    filters.txn_type = "transfer";
  }

  // Status detection
  if (/\b(pending|staged|unapproved|awaiting)\b/.test(q)) {
    filters.status = "staged";
  } else if (/\b(approved|cleared|finalized|posted)\b/.test(q)) {
    filters.status = "cleared";
  } else if (/\b(rejected|returned|needs correction)\b/.test(q)) {
    filters.status = "rejected";
  }

  // Amount detection — "over $500", "more than 100", "under 50", "between 100 and 200"
  const amountOver = q.match(/\b(over|above|more than|>|>=)\s*\$?(\d+[.,]?\d*)\b/);
  if (amountOver) filters.min_amount = Math.round(parseFloat(amountOver[2].replace(",", "")) * 100);

  const amountUnder = q.match(/\b(under|below|less than|<|<=)\s*\$?(\d+[.,]?\d*)\b/);
  if (amountUnder) filters.max_amount = Math.round(parseFloat(amountUnder[2].replace(",", "")) * 100);

  const amountExact = q.match(/\b(?:exactly|precisely|==)\s*\$?(\d+[.,]?\d*)\b/);
  if (amountExact) {
    const val = Math.round(parseFloat(amountExact[1].replace(",", "")) * 100);
    filters.min_amount = val;
    filters.max_amount = val;
  }

  // Date patterns
  const datePatterns = [
    // "last month", "this month", "last quarter", "this year"
    { pattern: /\blast\s+month\b/, fn: () => {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return { date_from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, date_to: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) };
    }},
    { pattern: /\bthis\s+month\b/, fn: () => {
      const d = new Date();
      return { date_from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, date_to: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) };
    }},
    { pattern: /\blast\s+quarter\b/, fn: () => {
      const d = new Date(); const qtr = Math.floor(d.getMonth() / 3) - 1;
      const startMonth = qtr * 3;
      return { date_from: `${d.getFullYear()}-${String(startMonth + 1).padStart(2, "0")}-01`, date_to: new Date(d.getFullYear(), startMonth + 3, 0).toISOString().slice(0, 10) };
    }},
    { pattern: /\bthis\s+year\b/, fn: () => {
      const d = new Date();
      return { date_from: `${d.getFullYear()}-01-01`, date_to: `${d.getFullYear()}-12-31` };
    }},
    // "last 30 days", "last 7 days", "past 90 days"
    { pattern: /\b(last|past)\s+(\d+)\s+(day|days|week|weeks|month|months)\b/, fn: (match) => {
      const num = parseInt(match[2]);
      const unit = match[3];
      const multipliers = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30 };
      const days = num * (multipliers[unit] || 1);
      const d = new Date(); d.setDate(d.getDate() - days);
      return { date_from: d.toISOString().slice(0, 10), date_to: new Date().toISOString().slice(0, 10) };
    }},
    // "in March 2026", "from Jan to Mar 2026"
    { pattern: /\b(from\s+)?([a-z]+)\s+(\d{4})\b/, fn: (match) => {
      const months = "janfebmaraprmayjunjulaugsepoctnovdec";
      const monthIdx = Math.floor(months.indexOf(match[2].slice(0, 3).toLowerCase()) / 3);
      if (monthIdx >= 0) {
        return { date_from: `${match[3]}-${String(monthIdx + 1).padStart(2, "0")}-01`, date_to: new Date(parseInt(match[3]), monthIdx + 1, 0).toISOString().slice(0, 10) };
      }
      return {};
    }},
  ];

  for (const dp of datePatterns) {
    const match = q.match(dp.pattern);
    if (match) {
      const dates = dp.fn(match);
      if (dates.date_from) filters.date_from = dates.date_from;
      if (dates.date_to) filters.date_to = dates.date_to;
      break;
    }
  }

  // "unpaid", "overdue"
  if (/\bunpaid|outstanding|overdue|due\b/.test(q)) {
    filters.status = "pending";
  }

  // Remove recognized NLP tokens from search text for cleaner ILIKE matching
  let cleanText = q
    .replace(/\b(show|me|find|list|get|all|the|my|display|view|give|please|can|you|for|that|with|having)\b/gi, "")
    .replace(/\b(income|expense|transfer|earned|received|spent|paid|sent|staged|pending|approved|cleared|rejected)\b/gi, "")
    .replace(/\b(over|above|under|below|more than|less than|exactly|last|this|past|from|in|between|and)\s*[\d$.,a-z]*\b/gi, "")
    .replace(/\b(unpaid|outstanding|overdue|due|month|week|year|quarter|day|days|weeks|months)\b/gi, "")
    .trim();

  // If clean text is empty after removing known patterns, keep original query
  if (cleanText.length < 2) cleanText = query;

  filters.text = cleanText;
  return filters;
}

// Search across multiple entity types with NLP-enhanced filtering
router.get("/v2", async (req, res) => {
  const { ws } = req.workspace;
  const { q, txn_type, limit = 20 } = req.query;
  const filters = parseNLPQuery(q || "");

  // Merge explicit query params over NLP-parsed ones
  if (txn_type && txn_type !== "all") filters.txn_type = txn_type;

  const searchTerm = filters.text ? `%${filters.text}%` : null;

  // Transactions search
  let txnQuery = sql`
    SELECT t.*, a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.workspace_id = ${ws}
  `;

  if (searchTerm) {
    txnQuery = sql`${txnQuery} AND (
      t.description ILIKE ${searchTerm}
      OR t.note ILIKE ${searchTerm}
      OR a.name ILIKE ${searchTerm}
      OR c.name ILIKE ${searchTerm}
    )`;
  }
  if (filters.txn_type) {
    txnQuery = sql`${txnQuery} AND t.txn_type = ${filters.txn_type}`;
  }
  if (filters.status === "staged") {
    txnQuery = sql`${txnQuery} AND t.is_staged = true AND t.is_rejected = false`;
  } else if (filters.status === "cleared") {
    txnQuery = sql`${txnQuery} AND t.is_staged = false AND t.is_rejected = false`;
  } else if (filters.status === "rejected") {
    txnQuery = sql`${txnQuery} AND t.is_rejected = true`;
  }
  if (filters.date_from) {
    txnQuery = sql`${txnQuery} AND t.occurred_on >= ${filters.date_from}`;
  }
  if (filters.date_to) {
    txnQuery = sql`${txnQuery} AND t.occurred_on <= ${filters.date_to}`;
  }
  if (filters.min_amount !== null) {
    txnQuery = sql`${txnQuery} AND t.amount_minor >= ${filters.min_amount}`;
  }
  if (filters.max_amount !== null) {
    txnQuery = sql`${txnQuery} AND t.amount_minor <= ${filters.max_amount}`;
  }

  txnQuery = sql`${txnQuery} ORDER BY t.occurred_on DESC LIMIT ${Number(limit)}`;
  const transactions = await txnQuery;

  // Account search (simple ILIKE)
  const accounts = searchTerm ? await sql`
    SELECT id, name, type, currency, opening_balance
    FROM accounts
    WHERE workspace_id = ${ws} AND (name ILIKE ${searchTerm} OR type ILIKE ${searchTerm})
    LIMIT 10
  ` : [];

  // Category search
  const categories = searchTerm ? await sql`
    SELECT id, name, kind
    FROM categories
    WHERE workspace_id = ${ws} AND name ILIKE ${searchTerm}
    LIMIT 10
  ` : [];

  res.json({
    query: filters,
    transactions,
    accounts,
    categories,
    total: transactions.length + accounts.length + categories.length,
  });
});

// NLP parse debug endpoint
router.post("/v2/parse", async (req, res) => {
  const { q } = req.body;
  const filters = parseNLPQuery(q || "");
  res.json({ original: q, parsed: filters });
});

export default router;
