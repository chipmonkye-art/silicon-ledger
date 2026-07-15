import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import type { Transaction, MonthlySummary } from "./types";

const RED = rgb(0.58, 0.22, 0.25);
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.5, 0.5, 0.5);
const BG = rgb(0.98, 0.98, 0.98);
const WHITE = rgb(1, 1, 1);
const LIGHT_GRAY = rgb(0.9, 0.9, 0.9);

export async function generateBrandedPDF(
  transactions: Transaction[],
  summary: MonthlySummary[],
  workspaceName?: string,
  logoUrl?: string,
) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);

  const page = pdfDoc.addPage([612, 792]);
  const pageWidth = 612;
  let y = 750;
  const margin = 50;
  const colWidth = pageWidth - margin * 2;

  const now = new Date();
  const genDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const genTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  function drawText(text: string, x: number, y: number, size: number, opts?: { font?: any; color?: any }) {
    page.drawText(text, { x, y, size, font: opts?.font ?? font, color: opts?.color ?? DARK });
  }

  function drawLine(y: number, thickness = 1) {
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness, color: GRAY });
  }

  // Branded Header Bar
  page.drawRectangle({ x: 0, y: 770, width: pageWidth, height: 22, color: RED });
  drawText("SILICON LEDGER", margin, y + 4, 10, { font: bold, color: WHITE });
  drawText("Branded Statement", pageWidth - margin - 100, y + 4, 8, { font, color: WHITE });
  y -= 30;

  // Logo (top-right)
  if (logoUrl) {
    try {
      const resp = await fetch(logoUrl);
      const blob = await resp.blob();
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const isPng = blob.type === "image/png";
      const logoImage = isPng
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);
      page.drawImage(logoImage, {
        x: pageWidth - margin - 60,
        y: y - 10,
        width: 50,
        height: 50,
      });
    } catch { /* skip logo if invalid */ }
  }

  // Title
  drawText(workspaceName ?? "Silicon Ledger Report", margin, y, 18, { font: bold, color: RED });
  y -= 14;
  drawText(`Generated ${genDate} at ${genTime}`, margin, y, 9, { color: GRAY });
  y -= 30;

  // Totals
  const totalInc = summary.reduce((s, m) => s + m.income, 0);
  const totalExp = summary.reduce((s, m) => s + m.expense, 0);
  const net = totalInc - totalExp;

  page.drawRectangle({ x: margin, y: y - 8, width: colWidth, height: 36, color: BG });
  drawText(`Income: $${(totalInc / 100).toFixed(2)}`, margin + 10, y + 10, 12, { font: bold });
  drawText(`Expense: $${(totalExp / 100).toFixed(2)}`, margin + 180, y + 10, 12, { font: bold, color: RED });
  drawText(`Net: $${(net / 100).toFixed(2)}`, margin + 350, y + 10, 12, { font: bold });
  y -= 50;

  // Monthly table
  drawText("Monthly Summary", margin, y, 13, { font: bold, color: RED });
  y -= 18;
  drawLine(y);
  y -= 14;

  drawText("Month", margin, y, 9, { font: bold, color: GRAY });
  drawText("Income", margin + 130, y, 9, { font: bold, color: GRAY });
  drawText("Expense", margin + 230, y, 9, { font: bold, color: GRAY });
  drawText("Balance", margin + 330, y, 9, { font: bold, color: GRAY });
  y -= 10;
  drawLine(y);
  y -= 10;

  for (const m of summary) {
    if (y < 100) break;
    const label = new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    drawText(label, margin, y, 9);
    drawText(`$${(m.income / 100).toFixed(2)}`, margin + 130, y, 9, { font: mono });
    drawText(`$${(m.expense / 100).toFixed(2)}`, margin + 230, y, 9, { font: mono, color: RED });
    drawText(`$${(m.balance / 100).toFixed(2)}`, margin + 330, y, 9, { font: mono });
    y -= 14;
  }

  y -= 18;
  drawLine(y);
  y -= 14;

  // Transaction ledger
  drawText("Transaction Ledger", margin, y, 13, { font: bold, color: RED });
  y -= 18;
  drawLine(y);
  y -= 14;

  drawText("Date", margin, y, 9, { font: bold, color: GRAY });
  drawText("Description", margin + 80, y, 9, { font: bold, color: GRAY });
  drawText("Amount", margin + 400, y, 9, { font: bold, color: GRAY });
  drawText("Type", margin + 470, y, 9, { font: bold, color: GRAY });
  y -= 10;
  drawLine(y);
  y -= 10;

  for (const t of transactions) {
    if (y < 60) break;
    drawText(t.occurred_on, margin, y, 8, { font: mono });
    drawText(t.description || "\u2014", margin + 80, y, 8, { font });
    const amt = `$${(t.amount_minor / 100).toFixed(2)}`;
    const amtWidth = mono.widthOfTextAtSize(amt, 8);
    drawText(amt, margin + 400 + (60 - amtWidth), y, 8, {
      font: mono,
      color: t.txn_type === "expense" ? RED : t.txn_type === "transfer" ? GRAY : DARK,
    });
    drawText(t.txn_type, margin + 470, y, 8, { color: GRAY });
    y -= 13;
  }

  // Footer section
  page.drawLine({ start: { x: margin, y: 50 }, end: { x: pageWidth - margin, y: 50 }, thickness: 0.5, color: GRAY });

  // Page number + generated timestamp
  drawText(`Page 1 of 1`, margin, 38, 7, { color: GRAY });
  drawText(`Silicon Ledger — ${workspaceName ?? "Accounting"}`, pageWidth - margin - 150, 38, 7, { color: GRAY });

  // EDITED ON footer (single line, small font, bottom of page)
  drawText(`EDITED ON ${now.toISOString().replace("T", " ").slice(0, 19)} UTC`, margin, 20, 6, { color: LIGHT_GRAY });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `branded-silicon-ledger-${now.toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
