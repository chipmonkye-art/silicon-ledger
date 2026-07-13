import express from "express";
import cors from "cors";
import path from "path";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import transactionRoutes from "./routes/transactions.js";
import accountRoutes from "./routes/accounts.js";
import categoryRoutes from "./routes/categories.js";
import expenseRoutes from "./routes/expenses.js";
import searchRoutes from "./routes/search.js";
import invoiceRoutes from "./routes/invoices.js";
import vendorRoutes from "./routes/vendors.js";
import reportRoutes from "./routes/reports.js";
import recurringRoutes from "./routes/recurring.js";
import uploadRoutes from "./routes/upload.js";
import backupRoutes from "./routes/backup.js";
import notificationRoutes from "./routes/notifications.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4000");

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/uploads", express.static(path.resolve("uploads")));
app.use("/api/upload", uploadRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/recurring", recurringRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve("../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
