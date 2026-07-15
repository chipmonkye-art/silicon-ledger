import { Router } from "express";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

const RED = rgb(0.58, 0.22, 0.25);
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.5, 0.5, 0.5);
const LIGHT = rgb(0.95, 0.95, 0.95);

async function fetchLogoAsBytes(logoUrl) {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

router.get("/export", async (req, res) => {
  const { ws } = req.workspace;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const year = parseInt(month.slice(0, 4));
  const monthNum = parseInt(month.slice(5, 7));
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);
  const monthLabel = new Date(year, monthNum - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const [workspace] = await sql`
    SELECT name, logo_url, branding_config FROM workspaces WHERE id = ${ws}
  `;

  const branding = workspace?.branding_config || {};
  const logoBytes = await fetchLogoAsBytes(workspace?.logo_url);

  const rows = await sql`
    SELECT t.occurred_on, t.description, t.txn_type, t.amount_minor,
           t.is_staged, t.is_rejected,
           c.name AS category_name, a.name AS account_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.workspace_id = ${ws}
      AND t.occurred_on >= ${startDate}
      AND t.occurred_on <= ${endDate}
      AND t.is_rejected = false
    ORDER BY t.occurred_on, t.created_at
  `;

  const [totals] = await sql`
    SELECT
      COALESCE(SUM(amount_minor) FILTER (WHERE txn_type = 'income'), 0) AS income,
      COALESCE(SUM(amount_minor) FILTER (WHERE txn_type = 'expense'), 0) AS expense
    FROM transactions
    WHERE workspace_id = ${ws}
      AND occurred_on >= ${startDate} AND occurred_on <= ${endDate}
      AND is_staged = false AND is_rejected = false
  `;

  const income = Number(totals.income);
  const expense = Number(totals.expense);
  const balance = income - expense;
  const hasStagedRows = rows.some((r) => r.is_staged);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);

  const page = pdfDoc.addPage([612, 792]);
  const pw = 612;
  let y = 750;
  const m = 50;
  const cw = pw - m * 2;

  function drawText(text, x, yPos, size, opts = {}) {
    page.drawText(text, {
      x, y: yPos, size,
      font: opts.font || font,
      color: opts.color || DARK,
    });
  }

  function drawLine(yPos) {
    page.drawLine({
      start: { x: m, y: yPos },
      end: { x: pw - m, y: yPos },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });
  }

  // Logo
  let logoX = m;
  if (logoBytes) {
    try {
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const logoDims = logoImage.scale(0.3);
      page.drawImage(logoImage, {
        x: m,
        y: y - logoDims.height + 10,
        width: logoDims.width,
        height: logoDims.height,
      });
      logoX = m + logoDims.width + 15;
    } catch {
      // Not a PNG or corrupt — skip
    }
  }

  // Header
  const orgName = branding.invoice_header || workspace?.name || "Silicon Ledger";
  drawText(orgName, logoX, y, 22, { font: bold });
  y -= 14;
  drawText(`${monthLabel} — Invoice Report`, logoX, y, 10, { color: GRAY });
  y -= 8;
  drawText(`Generated ${new Date().toISOString().slice(0, 10)}`, logoX, y, 9, { color: GRAY });
  y -= 30;

  // Summary cards
  const cardW = (cw - 20) / 3;
  const cardY = y - 8;
  const cardH = 40;

  const cards = [
    { label: "Income", value: income, color: DARK, prefix: "+" },
    { label: "Expense", value: expense, color: RED, prefix: "-" },
    { label: "Balance", value: balance, color: balance >= 0 ? DARK : RED, prefix: balance >= 0 ? "+" : "-" },
  ];

  for (let i = 0; i < cards.length; i++) {
    const cx = m + i * (cardW + 10);
    page.drawRectangle({ x: cx, y: cardY, width: cardW, height: cardH, color: LIGHT });
    drawText(cards[i].label, cx + 8, y + 16, 9, { color: GRAY });
    const amt = `${cards[i].prefix}$${(Math.abs(cards[i].value) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    drawText(amt, cx + 8, y - 2, 14, { font: mono, color: cards[i].color });
  }
  y -= 60;

  // Transaction table
  drawText("Transaction Ledger", m, y, 14, { font: bold });
  y -= 20;
  drawLine(y);
  y -= 14;

  const cols = [
    { label: "Date", x: m, w: 70 },
    { label: "Description", x: m + 75, w: 210 },
    { label: "Account", x: m + 290, w: 100 },
    { label: "Amount", x: m + 400, w: 80, align: "right" },
    { label: "Type", x: m + 480, w: 60 },
  ];

  for (const c of cols) {
    drawText(c.label, c.x, y, 9, { font: bold, color: GRAY });
  }
  y -= 10;
  drawLine(y);
  y -= 8;

  for (const r of rows) {
    if (y < 60) {
      pdfDoc.addPage([612, 792]);
      y = 750;
    }

    drawText(r.occurred_on, m, y, 9, { font: mono });
    drawText(r.description || "—", m + 75, y, 9, { maxWidth: 200 });
    drawText(r.account_name || "", m + 290, y, 9);

    const amt = `$${(r.amount_minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const amtColor = r.txn_type === "expense" ? RED : r.txn_type === "transfer" ? GRAY : DARK;
    const amtW = mono.widthOfTextAtSize(amt, 9);
    drawText(amt, m + 400 + (80 - amtW), y, 9, { font: mono, color: amtColor });

    drawText(r.txn_type, m + 480, y, 9, { color: GRAY });
    y -= 14;
  }

  // Watermark for staged transactions
  if (hasStagedRows) {
    const pages = pdfDoc.getPages();
    for (const p of pages) {
      const { width, height } = p.getSize();
      p.drawText("DRAFT — STAGED", {
        x: width / 2 - 120,
        y: height / 2,
        size: 40,
        font,
        color: rgb(0.9, 0.9, 0.9),
        opacity: 0.3,
        rotate: { angle: -30, x: width / 2, y: height / 2 },
      });
    }
  }

  // Footer
  const pages = pdfDoc.getPages();
  for (const p of pages) {
    const { width, height } = p.getSize();
    drawText(`${orgName} — Silicon Ledger`, m, 30, 8, { color: GRAY });
    drawText(`Page ${pages.indexOf(p) + 1} of ${pages.length}`, width - m - 60, 30, 8, { color: GRAY });
  }

  const pdfBytes = await pdfDoc.save();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${month}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

export default router;
