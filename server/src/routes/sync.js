import { Router } from "express";
import crypto from "crypto";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";
import { requireWorkspaceRole } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// ── Types (mirrored in app/lib/sync.ts) ──
// SyncEntityType: 'transaction' | 'account' | 'category' | 'recurring'
// SyncOperationType: 'create' | 'update' | 'delete'
// VectorClock: Record<deviceId, logicalClock>

/**
 * Compute deterministic payload hash for idempotent replay.
 * Hash = SHA256(entity_type + entity_id + JSON(payload) + action)
 */
function computePayloadHash(entityType, entityId, action, payload) {
  const canonical = `${entityType}:${entityId}:${action}:${JSON.stringify(payload, Object.keys(payload || {}).sort())}`;
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/**
 * Validate monotonic vector clock: incoming > last recorded for this device+entity.
 */
async function validateClock(ws, deviceId, entityType, entityId, incomingClock) {
  const [last] = await sql`
    SELECT vector_clock FROM sync_log
    WHERE workspace_id = ${ws}
      AND device_id = ${deviceId}
      AND entity_type = ${entityType}
      AND entity_id = ${entityId}
    ORDER BY vector_clock DESC
    LIMIT 1
  `;
  const lastClock = last ? Number(last.vector_clock) : 0;
  return { valid: Number(incomingClock) > lastClock, lastClock };
}

// POST /api/sync/delta — accept batch mutations with idempotency guard
router.post("/delta", requireWorkspaceRole("owner", "manager", "staff"), async (req, res) => {
  const { ws } = req.workspace;
  const { userId } = req.user;
  const { device_id, mutations } = req.body;

  if (!device_id || !Array.isArray(mutations)) {
    return res.status(422).json({ message: "device_id and mutations[] required" });
  }

  const results = [];
  const conflicts = [];

  for (const mut of mutations) {
    const { entity_type, entity_id, action, vector_clock, payload } = mut;
    const payloadHash = computePayloadHash(entity_type, entity_id, action, payload);

    // 1. Idempotency check — skip if exact payload already processed
    const [existing] = await sql`
      SELECT 1 FROM sync_log
      WHERE workspace_id = ${ws}
        AND entity_type = ${entity_type}
        AND entity_id = ${entity_id}
        AND payload_hash = ${payloadHash}
        AND action = ${action}
      LIMIT 1
    `;
    if (existing) {
      results.push({ entity_type, entity_id, action, status: "idempotent_skipped" });
      continue;
    }

    // 2. Vector clock monotonicity check
    const { valid, lastClock } = await validateClock(ws, device_id, entity_type, entity_id, vector_clock);
    if (!valid) {
      conflicts.push({
        entity_type,
        entity_id,
        local_clock: lastClock,
        client_clock: Number(vector_clock),
        message: "Stale vector clock — client must pull latest state",
      });
      continue;
    }

    // 3. Apply mutation
    try {
      switch (`${entity_type}:${action}`) {
        case "transaction:create": {
          const [txn] = await sql`
            INSERT INTO transactions (
              workspace_id, user_id, account_id, to_account_id, category_id,
              txn_type, amount_minor, currency, occurred_on, description,
              note, is_staged
            ) VALUES (
              ${ws}, ${userId}, ${payload.account_id}, ${payload.to_account_id || null},
              ${payload.category_id || null}, ${payload.txn_type}, ${payload.amount_minor},
              ${payload.currency || 'BDT'}, ${payload.occurred_on}, ${payload.description || ''},
              ${payload.note || ''}, true
            ) RETURNING *
          `;
          results.push({ entity_type, entity_id: txn.id, action, status: "created", data: txn });
          // Use the real ID for sync_log
          const hashReal = computePayloadHash(entity_type, txn.id, action, payload);
          await sql`
            INSERT INTO sync_log (workspace_id, user_id, device_id, entity_type, entity_id, vector_clock, action, payload, payload_hash, client_timestamp, is_resolved)
            VALUES (${ws}, ${userId}, ${device_id}, ${entity_type}, ${txn.id}, ${vector_clock}, ${action}, ${JSON.stringify(payload)}, ${hashReal}, ${mut.client_timestamp || null}, false)
          `;
          continue;
        }
        case "transaction:update": {
          const [txn] = await sql`
            UPDATE transactions SET
              amount_minor = COALESCE(${payload.amount_minor}, amount_minor),
              description = COALESCE(${payload.description}, description),
              category_id = COALESCE(${payload.category_id}, category_id),
              note = COALESCE(${payload.note}, note),
              occurred_on = COALESCE(${payload.occurred_on}, occurred_on)
            WHERE id = ${entity_id} AND workspace_id = ${ws}
            RETURNING *
          `;
          if (txn) results.push({ entity_type, entity_id, action, status: "updated", data: txn });
          else {
            results.push({ entity_type, entity_id, action, status: "not_found" });
            continue;
          }
          break;
        }
        case "transaction:delete": {
          const [txn] = await sql`
            DELETE FROM transactions WHERE id = ${entity_id} AND workspace_id = ${ws}
            RETURNING id
          `;
          if (txn) results.push({ entity_type, entity_id, action, status: "deleted" });
          else {
            results.push({ entity_type, entity_id, action, status: "not_found" });
            continue;
          }
          break;
        }
        case "account:create": {
          const [acct] = await sql`
            INSERT INTO accounts (user_id, workspace_id, name, type, currency, opening_balance, include_in_assets, icon, color)
            VALUES (${userId}, ${ws}, ${payload.name}, ${payload.type}, ${payload.currency || 'BDT'},
                    ${payload.opening_balance || 0}, ${payload.include_in_assets !== false}, ${payload.icon || 'wallet'}, ${payload.color || '#666'})
            RETURNING *
          `;
          results.push({ entity_type, entity_id: acct.id, action, status: "created", data: acct });
          const hashAcct = computePayloadHash(entity_type, acct.id, action, payload);
          await sql`
            INSERT INTO sync_log (workspace_id, user_id, device_id, entity_type, entity_id, vector_clock, action, payload, payload_hash, client_timestamp, is_resolved)
            VALUES (${ws}, ${userId}, ${device_id}, ${entity_type}, ${acct.id}, ${vector_clock}, ${action}, ${JSON.stringify(payload)}, ${hashAcct}, ${mut.client_timestamp || null}, false)
          `;
          continue;
        }
        default:
          results.push({ entity_type, entity_id, action, status: "unsupported" });
          continue;
      }

      // Record in sync_log with idempotency hash
      await sql`
        INSERT INTO sync_log (workspace_id, user_id, device_id, entity_type, entity_id, vector_clock, action, payload, payload_hash, client_timestamp)
        VALUES (${ws}, ${userId}, ${device_id}, ${entity_type}, ${entity_id}, ${vector_clock}, ${action}, ${JSON.stringify(payload)}, ${payloadHash}, ${mut.client_timestamp || null})
      `;
    } catch (err) {
      results.push({ entity_type, entity_id, action, status: "error", error: err.message });
    }
  }

  // Return current max vector clocks per device
  const [clockResult] = await sql`
    SELECT jsonb_object_agg(device_id, max_clock) AS clocks
    FROM (
      SELECT device_id, MAX(vector_clock)::bigint AS max_clock
      FROM sync_log
      WHERE workspace_id = ${ws}
      GROUP BY device_id
    ) sub
  `;

  res.json({
    results,
    conflicts,
    server_clocks: clockResult?.clocks || {},
  });
});

// GET /api/sync/changes — pull changes since last sync with vector clock matrix
router.get("/changes", async (req, res) => {
  const { ws } = req.workspace;
  const { device_id, since_clock = 0, entity_type, limit = 100 } = req.query;

  let query = sql`
    SELECT sl.*, t.description AS txn_description, t.amount_minor, t.txn_type
    FROM sync_log sl
    LEFT JOIN transactions t ON t.id = sl.entity_id AND sl.entity_type = 'transaction'
    WHERE sl.workspace_id = ${ws}
      AND sl.vector_clock > ${BigInt(since_clock)}
  `;

  if (device_id) query = sql`${query} AND sl.device_id != ${device_id}`;
  if (entity_type) query = sql`${query} AND sl.entity_type = ${entity_type}`;

  query = sql`${query} ORDER BY sl.vector_clock ASC LIMIT ${limit}`;

  const changes = await query;

  // Return full clock matrix
  const [clockResult] = await sql`
    SELECT jsonb_object_agg(device_id, max_clock) AS clocks
    FROM (
      SELECT device_id, MAX(vector_clock)::bigint AS max_clock
      FROM sync_log WHERE workspace_id = ${ws}
      GROUP BY device_id
    ) sub
  `;

  res.json({
    changes,
    server_clocks: clockResult?.clocks || {},
    has_more: changes.length === Number(limit),
  });
});

// POST /api/sync/resolve — conflict resolution with CRDT merge semantics
router.post("/resolve", requireWorkspaceRole("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { resolutions } = req.body;

  if (!Array.isArray(resolutions)) {
    return res.status(422).json({ message: "resolutions[] required" });
  }

  const results = [];
  for (const reso of resolutions) {
    const { entity_type, entity_id, resolution, payload } = reso;

    if (resolution === "use_client") {
      if (entity_type === "transaction") {
        await sql`
          UPDATE transactions SET
            amount_minor = ${payload.amount_minor},
            description = ${payload.description},
            category_id = ${payload.category_id}
          WHERE id = ${entity_id} AND workspace_id = ${ws}
        `;
      }
      results.push({ entity_id, resolution: "client_applied" });

      // Mark sync_log entries as resolved
      await sql`
        UPDATE sync_log SET is_resolved = true
        WHERE workspace_id = ${ws} AND entity_id = ${entity_id} AND is_resolved = false
      `;
    } else if (resolution === "use_server") {
      results.push({ entity_id, resolution: "server_kept" });
      await sql`
        UPDATE sync_log SET is_resolved = true
        WHERE workspace_id = ${ws} AND entity_id = ${entity_id} AND is_resolved = false
      `;
    } else if (resolution === "merge") {
      if (entity_type === "transaction" && payload.description) {
        await sql`
          UPDATE transactions SET description = ${payload.description}
          WHERE id = ${entity_id} AND workspace_id = ${ws}
        `;
        results.push({ entity_id, resolution: "merged" });
      }
      await sql`
        UPDATE sync_log SET is_resolved = true
        WHERE workspace_id = ${ws} AND entity_id = ${entity_id} AND is_resolved = false
      `;
    }
  }

  res.json({ results });
});

// POST /api/sync/pull — DeltaSyncResponse-style pull with full clock matrix
router.post("/pull", async (req, res) => {
  const { ws } = req.workspace;
  const { client_current_clock, last_synced_timestamp, limit = 100 } = req.body;

  const sinceClock = client_current_clock?.[req.headers["x-device-id"]] || 0;

  const mutations = await sql`
    SELECT sl.*, t.description AS txn_description
    FROM sync_log sl
    LEFT JOIN transactions t ON t.id = sl.entity_id AND sl.entity_type = 'transaction'
    WHERE sl.workspace_id = ${ws}
      AND sl.vector_clock > ${BigInt(sinceClock)}
    ORDER BY sl.vector_clock ASC
    LIMIT ${limit}
  `;

  const [clockResult] = await sql`
    SELECT jsonb_object_agg(device_id, max_clock) AS clocks
    FROM (
      SELECT device_id, MAX(vector_clock)::bigint AS max_clock
      FROM sync_log WHERE workspace_id = ${ws}
      GROUP BY device_id
    ) sub
  `;

  const serverClocks = clockResult?.clocks || {};

  res.json({
    server_current_clock: serverClocks,
    acknowledged_mutation_ids: [],
    downstream_mutations: mutations,
  });
});

export default router;
