import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const centsPart = abs % 100;
  const formatted = `${dollars.toLocaleString()}.${centsPart.toString().padStart(2, "0")}`;
  return cents < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function formatCentsCompact(cents: number): string {
  const abs = Math.abs(cents);
  if (abs >= 10000000) return `${(abs / 1000000).toFixed(0)}M`;
  if (abs >= 100000) return `${(abs / 1000).toFixed(1)}K`;
  return formatCents(cents);
}

export function convertCurrency(amountMinor: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>): number {
  if (fromCurrency === toCurrency) return amountMinor;
  const fromRate = rates[fromCurrency] ?? 1;
  const toRate = rates[toCurrency] ?? 1;
  const inBase = amountMinor / fromRate;
  return Math.round(inBase * toRate);
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseCents(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, "");
  return Math.round(parseFloat(cleaned || "0") * 100);
}

export function monthString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonth(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, m! - 1);
}
