import express from "express";
import compression from "compression";
import cors from "cors";
import path from "path";
import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import accountRoutes from "./routes/accounts.js";
import categoryRoutes from "./routes/categories.js";
import transactionRoutes from "./routes/transactions.js";
import recurringRoutes from "./routes/recurring.js";
import searchRoutes from "./routes/search.js";
import reportRoutes from "./routes/reports.js";
import fxRateRoutes from "./routes/fx_rates.js";
import uploadRoutes from "./routes/upload.js";
import backupRoutes from "./routes/backup.js";
import notificationRoutes from "./routes/notifications.js";
import auditRoutes from "./routes/audit.js";
import invoiceRoutes from "./routes/invoices.js";
import syncRoutes from "./routes/sync.js";
import biometricRoutes from "./routes/biometric.js";
import pushRoutes from "./routes/push.js";
import searchV2Routes from "./routes/search_v2.js";
import creditRoutes from "./routes/credit.js";
import cashflowRoutes from "./routes/cashflow.js";
import ledgerRoutes from "./routes/ledger.js";
import importRoutes from "./routes/import.js";
import purchaseOrderRoutes from "./routes/purchase_orders.js";
import budgetRoutes from "./routes/budgets.js";
import landownerRoutes from "./routes/landowners.js";
import attendanceRoutes from "./routes/attendance.js";
import chequeRegisterRoutes from "./routes/cheque_register.js";
import bankReconciliationRoutes from "./routes/bank_reconciliation.js";
import payrollRoutes from "./routes/payroll.js";
import { securityHeaders, telemetryInterceptor, rateLimiter, bodySizeLimit } from "./middleware/security.js";
import { i18nMiddleware } from "./lib/i18n.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4000");

// ---- Global Security Middleware (applied to every request) ----
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
app.use("/uploads", express.static(path.resolve("uploads")));
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
    const { default: sql } = await import("./db/index.js");
    const [r] = await sql`SELECT 1 AS ok, COUNT(*)::int AS txn_count FROM transactions`;
    res.json({ status: "ok", db: "connected", transactions: r.txn_count, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: "error", message: e.message });
  }
});

app.get("/api/health/slow-queries", async (_req, res) => {
  const { getSlowQueries } = await import("./db/index.js");
  res.json({ slow_queries: getSlowQueries(20) });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
