// Vercel serverless entry point for the Express API
// Routes all /api/* requests through the Express app

import express from "express";
import compression from "compression";
import cors from "cors";
import authRoutes from "../server/src/routes/auth.js";
import workspaceRoutes from "../server/src/routes/workspaces.js";
import accountRoutes from "../server/src/routes/accounts.js";
import categoryRoutes from "../server/src/routes/categories.js";
import transactionRoutes from "../server/src/routes/transactions.js";
import recurringRoutes from "../server/src/routes/recurring.js";
import searchRoutes from "../server/src/routes/search.js";
import reportRoutes from "../server/src/routes/reports.js";
import fxRateRoutes from "../server/src/routes/fx_rates.js";
import uploadRoutes from "../server/src/routes/upload.js";
import backupRoutes from "../server/src/routes/backup.js";
import notificationRoutes from "../server/src/routes/notifications.js";
import auditRoutes from "../server/src/routes/audit.js";
import invoiceRoutes from "../server/src/routes/invoices.js";
import syncRoutes from "../server/src/routes/sync.js";
import biometricRoutes from "../server/src/routes/biometric.js";
import pushRoutes from "../server/src/routes/push.js";
import searchV2Routes from "../server/src/routes/search_v2.js";
import creditRoutes from "../server/src/routes/credit.js";
import cashflowRoutes from "../server/src/routes/cashflow.js";
import ledgerRoutes from "../server/src/routes/ledger.js";
import importRoutes from "../server/src/routes/import.js";
import purchaseOrderRoutes from "../server/src/routes/purchase_orders.js";
import budgetRoutes from "../server/src/routes/budgets.js";
import landownerRoutes from "../server/src/routes/landowners.js";
import attendanceRoutes from "../server/src/routes/attendance.js";
import chequeRegisterRoutes from "../server/src/routes/cheque_register.js";
import bankReconciliationRoutes from "../server/src/routes/bank_reconciliation.js";
import payrollRoutes from "../server/src/routes/payroll.js";
import { securityHeaders, telemetryInterceptor, rateLimiter, bodySizeLimit } from "../server/src/middleware/security.js";
import { i18nMiddleware } from "../server/src/lib/i18n.js";

const app = express();

app.use(securityHeaders);
app.use(telemetryInterceptor);
app.use(rateLimiter(60_000, 100));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(bodySizeLimit(1_048_576));
app.use(i18nMiddleware);

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/recurring", recurringRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/fx-rates", fxRateRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/v2/sync", syncRoutes);
app.use("/api/v2/auth/biometric", biometricRoutes);
app.use("/api/v2", pushRoutes);
app.use("/api/search", searchV2Routes);
app.use("/api/credit", creditRoutes);
app.use("/api/cashflow", cashflowRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/import", importRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/landowners", landownerRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/cheque-register", chequeRegisterRoutes);
app.use("/api/bank-reconciliation", bankReconciliationRoutes);
app.use("/api/payroll", payrollRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    const { default: sql } = await import("../server/src/db/index.js");
    const [r] = await sql`SELECT 1 AS ok, COUNT(*)::int AS txn_count FROM transactions`;
    res.json({ status: "ok", db: "connected", transactions: r.txn_count, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: "error", message: e.message });
  }
});

app.get("/api/health/slow-queries", async (_req, res) => {
  const { getSlowQueries } = await import("../server/src/db/index.js");
  res.json({ slow_queries: getSlowQueries(20) });
});

export default app;
