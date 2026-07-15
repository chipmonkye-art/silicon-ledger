import postgres from "postgres";

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "silicon_ledger",
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
};

const isLocal = DB_CONFIG.host === "localhost" || DB_CONFIG.host === "127.0.0.1";

const rawSql = postgres({
  ...DB_CONFIG,
  ssl: !isLocal ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || "10"),
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {},
});

// Slow query log
const SLOW_THRESHOLD = parseInt(process.env.SLOW_QUERY_MS || "500");
const slowLog = [];

function sql(strings, ...values) {
  const start = Date.now();
  const result = rawSql(strings, ...values);
  if (result && typeof result.then === "function") {
    result.then((res) => {
      const dur = Date.now() - start;
      if (dur > SLOW_THRESHOLD) {
        const q = strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), "");
        const entry = { duration: dur, query: q.slice(0, 200), at: new Date().toISOString() };
        slowLog.push(entry);
        if (slowLog.length > 1000) slowLog.shift();
        console.warn(JSON.stringify({ level: "warn", msg: "slow_query", ...entry }));
      }
    }).catch(() => {});
  }
  return result;
}

// Copy all methods from rawSql onto sql
for (const key of Object.keys(rawSql)) {
  sql[key] = rawSql[key];
}

export function getSlowQueries(limit = 20) {
  return [...slowLog].reverse().slice(0, limit);
}

export default sql;
