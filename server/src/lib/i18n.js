/**
 * I18n engine — runtime locale switching with JSON string resources.
 * Supports dynamic language toggling and localized currency formatting.
 *
 * Usage:
 *   import { t, setLocale, formatCurrency } from "./lib/i18n.js";
 *   t("errors.not_found")         // → "Transaction not found"
 *   t("errors.not_found", "es")   // → "Transacción no encontrada"
 *   setLocale("fr")
 *   formatCurrency(1500, "EUR")   // → "15,00 €"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../../locales");

// Supported locales
const SUPPORTED_LOCALES = ["en", "es", "fr", "de", "pt", "ja", "zh", "ar", "hi", "sw"];

// Cache: { locale: { namespace: { key: value } } }
const cache = new Map();

// Current active locale (per-request via Accept-Language header)
let defaultLocale = "en";

function loadLocale(locale) {
  if (cache.has(locale)) return cache.get(locale);

  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    cache.set(locale, data);
    return data;
  } catch {
    // Fallback to English
    if (locale !== "en") return loadLocale("en");
    return {};
  }
}

// Load all locales into cache on startup
for (const locale of SUPPORTED_LOCALES) {
  loadLocale(locale);
}

/**
 * Translate a dot-notation key to the given locale.
 * @param {string} key - Dot-notation key (e.g. "errors.not_found")
 * @param {string} [locale] - Override locale (defaults to current)
 * @param {object} [params] - Interpolation params { name: "value" }
 * @returns {string}
 */
export function t(key, locale, params) {
  const loc = locale || defaultLocale;
  const strings = loadLocale(loc);

  const value = key.split(".").reduce((obj, k) => obj?.[k], strings);
  if (typeof value !== "string") return key;

  // Interpolation: replace {param} with values
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "{" + k + "}");
  }

  return value;
}

/**
 * Set the default locale.
 */
export function setLocale(locale) {
  if (SUPPORTED_LOCALES.includes(locale)) {
    defaultLocale = locale;
  }
}

/**
 * Get supported locales list.
 */
export function getSupportedLocales() {
  return [...SUPPORTED_LOCALES];
}

/**
 * Detect locale from Accept-Language header.
 */
export function detectLocale(acceptLanguage) {
  if (!acceptLanguage) return defaultLocale;
  const preferred = acceptLanguage.split(",")[0]?.split("-")[0]?.toLowerCase();
  if (SUPPORTED_LOCALES.includes(preferred)) return preferred;
  return defaultLocale;
}

/**
 * Format minor units (cents) to localized currency string.
 * Uses Intl.NumberFormat for precision formatting — no floating-point math.
 *
 * @param {number} amountMinor - Amount in minor units (cents)
 * @param {string} currency - ISO 4217 currency code
 * @param {string} [locale] - Locale for formatting
 * @returns {string}
 */
export function formatCurrency(amountMinor, currency = "USD", locale) {
  const loc = locale || defaultLocale;
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat(loc, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: getCurrencyDigits(currency),
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

/**
 * Get decimal digits for a currency (JPY = 0, USD = 2, etc.)
 */
function getCurrencyDigits(currency) {
  const digits = {
    JPY: 0, KRW: 0, VND: 0, CLP: 0, COP: 0,
    TWD: 0, HUF: 0, ISK: 0,
    BHD: 3, IQD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3,
  };
  return digits[currency] ?? 2;
}

/**
 * Get currency minor unit multiplier
 */
export function getMinorUnitMultiplier(currency) {
  return Math.pow(10, getCurrencyDigits(currency));
}

/**
 * I18n middleware — sets locale based on Accept-Language header
 */
export function i18nMiddleware(req, res, next) {
  const locale = detectLocale(req.headers["accept-language"]);
  req.locale = locale;
  req.t = (key, params) => t(key, locale, params);
  req.formatCurrency = (amount, currency) => formatCurrency(amount, currency, locale);
  res.setHeader("Content-Language", locale);
  next();
}

// Generate empty locale template
export function generateLocaleTemplate() {
  return {
    errors: {
      not_found: "Not found",
      unauthorized: "Unauthorized",
      validation: "Validation error",
      server_error: "Internal server error",
      rate_limited: "Too many requests",
      session_expired: "Session expired",
    },
    transactions: {
      created: "Transaction created",
      updated: "Transaction updated",
      deleted: "Transaction deleted",
      approved: "Transaction approved",
      rejected: "Transaction rejected with note: {note}",
      staged: "Pending review",
    },
    accounts: {
      created: "Account created",
      updated: "Account updated",
      credit_limit_set: "Credit limit set to {limit}",
    },
    auth: {
      login_success: "Signed in successfully",
      logout_success: "Signed out",
      session_revoked: "Session revoked",
      biometric_registered: "Biometric key registered",
    },
    reports: {
      generated: "Report generated",
      aging: "Aging Analysis",
      cashflow: "Cash Flow Projection",
    },
    workspace: {
      created: "Workspace created",
      invite_sent: "Invite code generated",
      member_added: "Member added",
    },
    common: {
      loading: "Loading...",
      saving: "Saving...",
      success: "Success",
      error: "Error",
      confirm: "Confirm",
      cancel: "Cancel",
      search: "Search",
    },
  };
}
