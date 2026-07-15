import { readFileSync } from "fs";
import pg from "pg";

const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  await pool.query(sql);
  console.log("Schema pushed successfully!");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
