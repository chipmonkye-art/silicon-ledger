import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Transaction, MonthlySummary } from "./types";

const RED = rgb(0.58, 0.22, 0.25);
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.5, 0.5, 0.5);
const BG = rgb(0.98, 0.98, 0.98);
const WHITE = rgb(1, 1, 1);

export async function generatePDF(transactions: Transaction[], summary: MonthlySummary[]) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);

  const page = pdfDoc.addPage([612, 792]);
  const pageWidth = 612;
  let y = 750;
  const margin = 50;
  const colWidth = pageWidth - margin * 2;

  function drawText(text: string, x: number, y: number, size: number, opts?: { font?: any; color?: any }) {
    page.drawText(text, { x, y, size, font: opts?.font ?? font, color: opts?.color ?? DARK });
  }

  function drawLine(y: number) {
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: GRAY });
  }

  // Header
  drawText("Silicon Ledger Report", margin, y, 22, { font: bold });
  y -= 12;
  drawText(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, y, 10, { color: GRAY });
  y -= 30;

  // Totals summary
  const totalInc = summary.reduce((s, m) => s + m.income, 0);
  const totalExp = summary.reduce((s, m) => s + m.expense, 0);
  const net = totalInc - totalExp;

  page.drawRectangle({ x: margin, y: y - 8, width: colWidth, height: 36, color: BG });
  drawText(`Income: $${(totalInc / 100).toFixed(2)}`, margin + 10, y + 10, 12, { font: bold });
  drawText(`Expense: $${(totalExp / 100).toFixed(2)}`, margin + 180, y + 10, 12, { font: bold, color: RED });
  drawText(`Net: $${(net / 100).toFixed(2)}`, margin + 350, y + 10, 12, { font: bold });
  y -= 50;

  // Monthly summary table
  drawText("Monthly Summary", margin, y, 14, { font: bold });
  y -= 20;
  drawLine(y);
  y -= 15;

  // Table header
  drawText("Month", margin, y, 10, { font: bold, color: GRAY });
  drawText("Income", margin + 130, y, 10, { font: bold, color: GRAY });
  drawText("Expense", margin + 230, y, 10, { font: bold, color: GRAY });
  drawText("Balance", margin + 330, y, 10, { font: bold, color: GRAY });
  y -= 12;
  drawLine(y);
  y -= 10;

  for (const m of summary) {
    if (y < 80) break;
    const label = new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    drawText(label, margin, y, 10);
    drawText(`$${(m.income / 100).toFixed(2)}`, margin + 130, y, 9, { font: mono });
    drawText(`$${(m.expense / 100).toFixed(2)}`, margin + 230, y, 9, { font: mono, color: RED });
    drawText(`$${(m.balance / 100).toFixed(2)}`, margin + 330, y, 9, { font: mono });
    y -= 16;
  }

  y -= 20;
  drawLine(y);
  y -= 15;

  // Transaction ledger
  drawText("Transaction Ledger", margin, y, 14, { font: bold });
  y -= 20;
  drawLine(y);
  y -= 15;

  drawText("Date", margin, y, 10, { font: bold, color: GRAY });
  drawText("Description", margin + 80, y, 10, { font: bold, color: GRAY });
  drawText("Amount", margin + 400, y, 10, { font: bold, color: GRAY });
  drawText("Type", margin + 470, y, 10, { font: bold, color: GRAY });
  y -= 12;
  drawLine(y);
  y -= 10;

  for (const t of transactions) {
    if (y < 50) break;
    drawText(t.occurred_on, margin, y, 9, { font: mono });
    drawText(t.description || "—", margin + 80, y, 9, { maxWidth: 300 });
    const amt = `$${(t.amount_minor / 100).toFixed(2)}`;
    const amtWidth = mono.widthOfTextAtSize(amt, 9);
    drawText(amt, margin + 400 + (60 - amtWidth), y, 9, {
      font: mono,
      color: t.txn_type === "expense" ? RED : t.txn_type === "transfer" ? GRAY : DARK,
    });
    drawText(t.txn_type, margin + 470, y, 9, { color: GRAY });
    y -= 15;
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `silicon-ledger-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
