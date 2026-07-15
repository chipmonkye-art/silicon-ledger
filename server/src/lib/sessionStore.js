/**
 * Session store for server-side revocation tracking.
 * Uses Redis when available; falls back to in-memory Map.
 */

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

let redisClient = null;
let useRedis = false;
let initPromise = null;

function getRedis() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const { createClient } = await import("redis");
        const client = createClient({ url: process.env.REDIS_URL || undefined });
        client.on("error", () => { useRedis = false; });
        await client.connect();
        redisClient = client;
        useRedis = true;
      } catch {
        useRedis = false;
      }
    })();
  }
  return initPromise;
}

const memoryStore = new Map();
const memoryTTLs = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, expires] of memoryTTLs) {
    if (expires < now) {
      memoryStore.delete(key);
      memoryTTLs.delete(key);
    }
  }
}, 60_000);

const sessionStore = {
  async revokeSession(sessionId, ttlMs = SESSION_TTL_MS) {
    await getRedis();
    const key = `revoked_session:${sessionId}`;
    if (useRedis) {
      await redisClient.set(key, "1", { PX: ttlMs });
    } else {
      memoryStore.set(key, "1");
      memoryTTLs.set(key, Date.now() + ttlMs);
    }
  },

  async revokeAllUserSessions(userId) {
    await getRedis();
    const key = `revoked_all:${userId}`;
    if (useRedis) {
      await redisClient.set(key, Date.now().toString(), { PX: SESSION_TTL_MS });
    } else {
      memoryStore.set(key, Date.now().toString());
      memoryTTLs.set(key, Date.now() + SESSION_TTL_MS);
    }
  },

  async isSessionRevoked(sessionId, userId) {
    await getRedis();
    const sessionKey = `revoked_session:${sessionId}`;
    const allKey = `revoked_all:${userId}`;
    if (useRedis) {
      const [sessionRevoked, allRevoked] = await Promise.all([
        redisClient.get(sessionKey),
        redisClient.get(allKey),
      ]);
      return !!sessionRevoked || !!allRevoked;
    }
    return memoryStore.has(sessionKey) || memoryStore.has(allKey);
  },

  async recordSession(sessionId, userId, ttlMs = SESSION_TTL_MS) {
    await getRedis();
    const key = `active_session:${sessionId}`;
    const data = JSON.stringify({ userId, createdAt: Date.now() });
    if (useRedis) {
      await redisClient.set(key, data, { PX: ttlMs });
    } else {
      memoryStore.set(key, data);
      memoryTTLs.set(key, Date.now() + ttlMs);
    }
  },

  async getUserSessionIds(userId) {
    await getRedis();
    const sessions = [];
    if (useRedis) {
      const keys = await redisClient.keys(`active_session:*`);
      for (const k of keys) {
        const data = await redisClient.get(k);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.userId === userId) sessions.push(k.replace("active_session:", ""));
        }
      }
    } else {
      for (const [key, val] of memoryStore) {
        if (key.startsWith("active_session:") && typeof val === "string") {
          try {
            const parsed = JSON.parse(val);
            if (parsed.userId === userId) sessions.push(key.replace("active_session:", ""));
          } catch { /* skip */ }
        }
      }
    }
    return sessions;
  },

  async ping() {
    await getRedis();
    if (useRedis) { try { await redisClient.ping(); return true; } catch { return false; } }
    return true;
  },
};

export default sessionStore;
export { useRedis };
