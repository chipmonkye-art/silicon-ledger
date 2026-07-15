import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import crypto from "crypto";
import sessionStore from "../lib/sessionStore.js";

const JWKS_URL = process.env.SUPABASE_JWKS_URL;
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || crypto.randomBytes(32).toString("hex");
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(48).toString("hex");
const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

let jwks = null;
function getJWKS() {
  if (!jwks && JWKS_URL) jwks = createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

// ── Enhanced auth middleware with session revocation check ──
export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ errorCode: "AUTH_HEADER_MISSING", message: "Missing authorization token" });
  }

  const keys = getJWKS();
  if (!keys) {
    await verifyServerToken(req, res, next);
    return;
  }

  try {
    const token = header.slice(7);
    const { payload } = await jwtVerify(token, keys);
    const sessionId = payload.session_id || crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
    const userId = payload.sub;

    // Server-side session revocation check
    const revoked = await sessionStore.isSessionRevoked(sessionId, userId);
    if (revoked) {
      return res.status(401).json({ errorCode: "SESSION_REVOKED", message: "Session has been revoked. Please sign in again." });
    }

    req.user = {
      userId,
      email: payload.email || null,
      role: payload.role || "authenticated",
      sessionId,
    };

    // Inject tenant context
    const wsId = req.headers["x-workspace-id"];
    if (wsId) res.setHeader("X-Silicon-Tenant-Id", wsId);

    next();
  } catch (err) {
    return res.status(401).json({ errorCode: "TOKEN_INVALID", message: "Invalid or expired token" });
  }
}

// ── Internal server token verification (for server-to-server) ──
async function verifyServerToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ errorCode: "AUTH_HEADER_MISSING", message: "Missing authorization token" });
  }

  const token = header.slice(7);
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    const sessionId = payload.session_id || crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
    const userId = payload.sub;

    const revoked = await sessionStore.isSessionRevoked(sessionId, userId);
    if (revoked) {
      return res.status(401).json({ errorCode: "SESSION_REVOKED", message: "Session revoked" });
    }

    req.user = {
      userId,
      email: payload.email || null,
      role: payload.role || "authenticated",
      sessionId,
    };
    next();
  } catch {
    return res.status(401).json({ errorCode: "TOKEN_INVALID", message: "Invalid server token" });
  }
}

// ── Generate access + refresh token pair ──
export async function generateTokenPair(userId, email, role = "authenticated") {
  const sessionId = crypto.randomUUID();

  const accessToken = await new SignJWT({ sub: userId, email, role, session_id: sessionId, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(new TextEncoder().encode(JWT_SECRET));

  const refreshToken = await new SignJWT({ sub: userId, session_id: sessionId, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(new TextEncoder().encode(REFRESH_SECRET));

  // Record session
  await sessionStore.recordSession(sessionId, userId);

  return { accessToken, refreshToken, sessionId, expiresIn: 900 };
}

// ── Refresh access token ──
export async function refreshAccessToken(refreshToken) {
  try {
    const { payload } = await jwtVerify(refreshToken, new TextEncoder().encode(REFRESH_SECRET));
    if (payload.type !== "refresh") throw new Error("Invalid token type");

    const revoked = await sessionStore.isSessionRevoked(payload.session_id, payload.sub);
    if (revoked) throw new Error("Session revoked");

    const accessToken = await new SignJWT({
      sub: payload.sub,
      session_id: payload.session_id,
      type: "access",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(ACCESS_TTL)
      .sign(new TextEncoder().encode(JWT_SECRET));

    return { accessToken, expiresIn: 900 };
  } catch {
    return null;
  }
}

// ── revoke a session ──
export async function revokeSession(sessionId) {
  await sessionStore.revokeSession(sessionId);
}

// ── revoke all sessions for a user ──
export async function revokeAllUserSessions(userId) {
  await sessionStore.revokeAllUserSessions(userId);
}

// ── Workspace scope middleware ──
export function workspaceScope(req, res, next) {
  const ws = req.headers["x-workspace-id"];
  if (!ws) {
    return res.status(422).json({ errorCode: "WORKSPACE_MISSING", message: "x-workspace-id header is required" });
  }
  req.workspace = { ws };
  res.setHeader("X-Silicon-Tenant-Id", ws);
  next();
}
