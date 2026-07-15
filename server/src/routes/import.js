import { Router } from "express";
import multer from "multer";
import XLSX from "xlsx";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith(".xlsx") || file.originalname.endsWith(".xls") || file.originalname.endsWith(".csv")) {
      return cb(null, true);
    }
    cb(new Error("Only Excel (.xlsx, .xls) and CSV files are allowed"));
  },
});

const router = Router();
router.use(authMiddleware, workspaceScope);

// POST /api/import/excel — parse, validate, stage transactions
router.post("/excel", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(422).json({ message: "No file uploaded" });

  const ws = req.workspace.ws;
  const userId = req.user.userId;

  let mapping;
  try {
    mapping = JSON.parse(req.body.mapping || "{}");
  } catch {
    return res.status(422).json({ message: "Invalid mapping JSON" });
  }

  // Parse workbook
  let workbook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
  } catch (e) {
    return res.status(422).json({ message: "Failed to parse file: " + e.message });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return res.status(422).json({ message: "No sheets found in workbook" });

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

  if (!rows.length) return res.status(422).json({ message: "No data rows found" });

  // Resolve account_id from name
  const accounts = await sql`
    SELECT id, name FROM accounts WHERE workspace_id = ${ws}
  `;
  const accountMap = {};
  for (const a of accounts) accountMap[a.name.toLowerCase().trim()] = a.id;

  const accountId = mapping.account_id || (mapping.account_name && accountMap[mapping.account_name.toLowerCase().trim()]);
  if (!accountId && !mapping.account_name) {
    return res.status(422).json({ message: "Mapping must include account_id or account_name" });
  }

  // Resolve category_id from name if mapping provides category_name
  let categoryMap = {};
  if (mapping.category_name) {
    const categories = await sql`
      SELECT id, name FROM categories WHERE workspace_id = ${ws}
    `;
    for (const c of categories) categoryMap[c.name.toLowerCase().trim()] = c.id;
  }

  const errors = [];
  let imported = 0;
  const txnRows = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row
    const record = { errors: [] };

    try {
      // Parse amount
      let amountRaw = mapping.amount_column ? row[mapping.amount_column] : null;
      if (amountRaw == null) {
        record.errors.push("amount_column not found in row");
        errors.push({ row: rowNum, errors: record.errors.join("; ") });
        continue;
      }

      // Strip currency symbols and commas
      let amountStr = String(amountRaw).replace(/[$€£¥,]/g, "").trim();
      let amountMinor = Math.round(parseFloat(amountStr) * 100);

      if (isNaN(amountMinor) || amountMinor <= 0) {
        record.errors.push("Invalid amount");
        errors.push({ row: rowNum, errors: record.errors.join("; ") });
        continue;
      }

      // Determine txn_type from type_column or by amount sign
      let txnType = "expense";
      if (mapping.type_column) {
        const typeVal = String(row[mapping.type_column] || "").toLowerCase().trim();
        if (["income", "credit", "inflow", "deposit", "salary"].includes(typeVal)) {
          txnType = "income";
        } else if (["expense", "debit", "outflow", "withdrawal", "payment"].includes(typeVal)) {
          txnType = "expense";
        }
      } else if (amountStr.startsWith("-")) {
        txnType = "expense";
        amountMinor = Math.abs(amountMinor);
      } else {
        txnType = "income";
      }

      // Parse date
      let occurredOn = new Date().toISOString().slice(0, 10);
      if (mapping.date_column && row[mapping.date_column] != null) {
        const dateVal = row[mapping.date_column];
        if (typeof dateVal === "number") {
          // Excel serial date
          const utcDays = Math.floor(dateVal - 25569);
          const utcValue = utcDays * 86400;
          occurredOn = new Date(utcValue * 1000).toISOString().slice(0, 10);
        } else {
          const d = new Date(dateVal);
          if (!isNaN(d.getTime())) {
            occurredOn = d.toISOString().slice(0, 10);
          }
        }
      }

      // Description
      const descCol = mapping.description_column;
      let description = descCol ? String(row[descCol] || "").trim() : `Imported row ${rowNum}`;
      if (!description) description = `Imported row ${rowNum}`;

      // Bill reference
      let billReference = null;
      if (mapping.bill_reference_column && row[mapping.bill_reference_column] != null) {
        billReference = String(row[mapping.bill_reference_column]).trim() || null;
      }

      // Due date
      let dueDate = null;
      if (mapping.due_date_column && row[mapping.due_date_column] != null) {
        const dd = row[mapping.due_date_column];
        if (typeof dd === "number") {
          const utcDays = Math.floor(dd - 25569);
          const utcValue = utcDays * 86400;
          dueDate = new Date(utcValue * 1000).toISOString().slice(0, 10);
        } else {
          const d = new Date(dd);
          if (!isNaN(d.getTime())) dueDate = d.toISOString().slice(0, 10);
        }
      }

      // Resolve category
      let categoryId = mapping.category_id || null;
      if (!categoryId && mapping.category_name && row[mapping.category_name]) {
        const catName = String(row[mapping.category_name]).toLowerCase().trim();
        categoryId = categoryMap[catName] || null;
      }

      // Payment status
      const paymentStatus = dueDate ? "unpaid" : null;

      txnRows.push({
        user_id: userId,
        workspace_id: ws,
        account_id: accountId,
        to_account_id: txnType === "transfer" ? mapping.to_account_id : null,
        category_id: txnType !== "transfer" ? categoryId : null,
        txn_type: txnType,
        amount_minor: amountMinor,
        currency: mapping.currency || "USD",
        occurred_on: occurredOn,
        description: description.slice(0, 255),
        note: mapping.note || "",
        is_staged: true,
        bill_reference: billReference,
        due_date: dueDate,
        payment_status: paymentStatus,
      });

      imported++;
    } catch (e) {
      errors.push({ row: rowNum, errors: e.message || "Unknown error" });
    }
  }

  if (errors.length === rows.length) {
    return res.status(422).json({ imported: 0, errors, message: "All rows had errors — no transactions imported" });
  }

  // Batch insert in chunks of 100
  let insertedCount = 0;
  const chunkSize = 100;
  for (let i = 0; i < txnRows.length; i += chunkSize) {
    const chunk = txnRows.slice(i, i + chunkSize);
    const { count } = await sql`
      INSERT INTO transactions ${sql(chunk)}
    `;
    insertedCount += count;
  }

  // Log the import
  const [logEntry] = await sql`
    INSERT INTO import_logs (workspace_id, user_id, file_name, file_type, mapping, row_count, imported_count, error_count, errors)
    VALUES (
      ${ws}, ${userId}, ${req.file.originalname}, ${req.file.mimetype || "unknown"},
      ${JSON.stringify(mapping)}, ${rows.length}, ${imported}, ${errors.length},
      ${JSON.stringify(errors)}
    )
    RETURNING id
  `;

  res.json({
    import_id: logEntry.id,
    total_rows: rows.length,
    imported: insertedCount,
    errors: errors.map(e => `Row ${e.row}: ${e.errors}`).slice(0, 20),
  });
});

// GET /api/import/logs — fetch import history
router.get("/logs", async (req, res) => {
  const { ws } = req.workspace;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  const logs = await sql`
    SELECT id, file_name, file_type, row_count, imported_count, error_count, created_at
    FROM import_logs
    WHERE workspace_id = ${ws}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int FROM import_logs WHERE workspace_id = ${ws}
  `;

  res.json({ logs, total: count });
});

// GET /api/import/logs/:id — fetch specific import log details
router.get("/logs/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [log] = await sql`
    SELECT * FROM import_logs WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!log) return res.status(404).json({ message: "Import log not found" });
  res.json({ log });
});

export default router;
