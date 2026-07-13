import { createWorker } from "tesseract.js";

export interface OcrResult {
  amount?: number;
  date?: string;
  vendor?: string;
  raw: string;
}

function parseAmount(text: string): number | undefined {
  const patterns = [
    /total\s*(?:due|amount|:)?\s*\$?([0-9,]+\.\d{2})/i,
    /balance\s*(?:due|:)?\s*\$?([0-9,]+\.\d{2})/i,
    /amount\s*(?:due|charged|:)?\s*\$?([0-9,]+\.\d{2})/i,
    /\$?([0-9,]+\.\d{2})\s*$/m,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return Math.round(parseFloat(m[1].replace(/,/g, "")) * 100);
  }
  const all: number[] = [];
  for (const m of text.matchAll(/\$?\s*([0-9,]+\.\d{2})/g)) {
    all.push(Math.round(parseFloat(m[1].replace(/,/g, "")) * 100));
  }
  return all.length > 0 ? Math.max(...all) : undefined;
}

function parseDate(text: string): string | undefined {
  const patterns = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{1,2})\/(\d{1,2})\/(\d{2})/,
    /([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      if (m[0].includes("-")) return m[0];
      if (m[0].includes("/")) {
        if (m[3].length === 4) {
          const d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
          return d.toISOString().slice(0, 10);
        }
        if (m[3].length === 2) {
          const d = new Date(2000 + parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
          return d.toISOString().slice(0, 10);
        }
      }
      if (m[1] && m[2] && m[3]) {
        const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
        return d.toISOString().slice(0, 10);
      }
    }
  }
  return undefined;
}

function parseVendor(text: string): string | undefined {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const skipPatterns = /^(total|subtotal|tax|change|balance|amount|date|receipt|thank|cash|credit|debit|store|tel|phone|#)/i;
  for (const line of lines.slice(0, 5)) {
    if (!skipPatterns.test(line) && line.length > 3 && line.length < 60) {
      if (/[A-Z]/.test(line)) return line;
    }
  }
  return undefined;
}

export async function scanReceipt(image: string | File): Promise<OcrResult> {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(image);
    const raw = data.text.trim();
    return {
      amount: parseAmount(raw),
      date: parseDate(raw),
      vendor: parseVendor(raw),
      raw,
    };
  } finally {
    await worker.terminate();
  }
}
