import crypto from "crypto";

/**
 * Security headers middleware — CSP, HSTS, XSS, frame protection.
 * Complies with Apple ATS and OWASP best practices.
 */
export function securityHeaders(req, res, next) {
  // HSTS — enforce HTTPS for 1 year, include subdomains, preload
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  // XSS protection
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://vbnifgchhlltdgdpinom.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.frankfurter.app",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);

  // Permissions Policy
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // Cache control for API responses
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
}

/**
 * Telemetry interceptor — request correlation IDs + structured logging.
 * Attaches X-Request-Id to every response for traceability.
 */
export function telemetryInterceptor(req, res, next) {
  // Correlation ID — use incoming or generate
  const correlationId = req.headers["x-correlation-id"] || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader("X-Request-Id", correlationId);

  // Request start time
  const start = Date.now();

  // Capture original end to log response
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    const logEntry = {
      correlationId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?.userId?.slice(0, 8) || "anonymous",
      workspaceId: req.headers["x-workspace-id"] || null,
      userAgent: req.headers["user-agent"]?.slice(0, 60) || null,
      timestamp: new Date().toISOString(),
    };

    // Structured log
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    console.log(JSON.stringify({ level, ...logEntry }));

    // Attach timing header
    res.setHeader("X-Response-Time", `${duration}ms`);

    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Rate limit memory store (in-memory, per-IP sliding window).
 * Replace with Redis in production for distributed rate limiting.
 */
const rateLimitStore = new Map();
export function rateLimiter(windowMs = 60_000, maxRequests = 100) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, []);
    }

    const timestamps = rateLimitStore.get(key).filter((t) => t > now - windowMs);
    timestamps.push(now);
    rateLimitStore.set(key, timestamps);

    if (timestamps.length > maxRequests) {
      return res.status(429).json({
        errorCode: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please slow down.",
        retryAfter: Math.ceil(windowMs / 1000),
      });
    }

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(maxRequests - timestamps.length));
    next();
  };
}

/**
 * Body size limit for financial payloads
 */
export function bodySizeLimit(maxBytes = 1_048_576) {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers["content-length"] || "0");
    if (contentLength > maxBytes) {
      return res.status(413).json({
        errorCode: "PAYLOAD_TOO_LARGE",
        message: `Request body exceeds ${Math.round(maxBytes / 1024)}KB limit`,
      });
    }
    next();
  };
}
