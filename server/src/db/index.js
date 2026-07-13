import postgres from "postgres";

const url = process.env.DATABASE_URL || "postgres://localhost:5432/silicon_ledger";
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const ssl = process.env.NODE_ENV === "production" && !isLocal
  ? { rejectUnauthorized: false }
  : false;

const sql = postgres(url, { ssl });

export default sql;
