import crypto from "crypto";

const HMAC_SECRET = process.env.CRON_HMAC_SECRET || "dev-cron-secret-change-in-production";

export function requireHmac(req, res, next) {
  const signature = req.headers["x-hmac-signature"];
  if (!signature) {
    return res.status(401).json({ message: "Missing HMAC signature" });
  }

  const timestamp = req.headers["x-hmac-timestamp"];
  if (!timestamp) {
    return res.status(401).json({ message: "Missing HMAC timestamp" });
  }

  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (Math.abs(age) > 300) {
    return res.status(401).json({ message: "HMAC timestamp expired" });
  }

  const body = typeof req.body === "object" ? JSON.stringify(req.body) : req.body || "";
  const payload = `${req.method}:${req.path}:${timestamp}:${body}`;
  const expected = crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(403).json({ message: "Invalid HMAC signature" });
  }

  next();
}

export function generateHmacPayload(method, path, body = "") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = typeof body === "object" ? JSON.stringify(body) : body;
  const payload = `${method}:${path}:${timestamp}:${bodyStr}`;
  const signature = crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");
  return { timestamp, signature };
}
