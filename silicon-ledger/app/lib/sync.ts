import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiFetch } from "./client";
import type { PendingMutation } from "./types";

let deviceId = `device-${Math.random().toString(36).slice(2, 10)}`;
try {
  const stored = localStorage.getItem("silicon-device-id");
  if (stored) deviceId = stored;
  else localStorage.setItem("silicon-device-id", deviceId);
} catch { /* noop */ }

export function getDeviceId() { return deviceId; }

// ── Types matching Part 2 spec ──
export type SyncEntityType = "transaction" | "account" | "category" | "recurring";
export type SyncOperationType = "create" | "update" | "delete";

export interface VectorClock {
  [nodeId: string]: number;
}

export interface SyncMutationLog {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  payload: Record<string, unknown>;
  vectorClock: VectorClock;
  clientTimestamp: Date;
  serverReceivedAt?: Date;
  isResolved: boolean;
}

export interface DeltaSyncRequest {
  clientCurrentClock: VectorClock;
  lastSyncedTimestamp: Date | null;
  mutations: SyncMutationLog[];
}

export interface DeltaSyncResponse {
  serverCurrentClock: VectorClock;
  acknowledgedMutationIds: string[];
  downstreamMutations: SyncMutationLog[];
}

interface SyncStore {
  pendingQueue: PendingMutation[];
  lastServerClocks: VectorClock;
  isSyncing: boolean;
  enqueue: (mut: Omit<PendingMutation, "id" | "vector_clock" | "created_at">) => void;
  dequeue: (ids: string[]) => void;
  setServerClocks: (clocks: VectorClock) => void;
  setSyncing: (v: boolean) => void;
}

export const useSyncStore = create<SyncStore>()(
  persist(
    (set) => ({
      pendingQueue: [],
      lastServerClocks: {},
      isSyncing: false,
      enqueue: (mut) => {
        const clock = Date.now();
        const entry: PendingMutation = {
          id: `${clock}-${Math.random().toString(36).slice(2, 6)}`,
          ...mut,
          vector_clock: clock,
          created_at: new Date().toISOString(),
        };
        set((s) => ({ pendingQueue: [...s.pendingQueue, entry] }));
      },
      dequeue: (ids) => {
        set((s) => ({ pendingQueue: s.pendingQueue.filter((m) => !ids.includes(m.id)) }));
      },
      setServerClocks: (clocks) => set({ lastServerClocks: clocks }),
      setSyncing: (v) => set({ isSyncing: v }),
    }),
    { name: "silicon-sync-v2" },
  ),
);

export async function pushPendingMutations() {
  const store = useSyncStore.getState();
  if (store.pendingQueue.length === 0 || store.isSyncing) return;

  store.setSyncing(true);
  try {
    const body: DeltaSyncRequest = {
      clientCurrentClock: { [deviceId]: store.lastServerClocks[deviceId] || 0 },
      lastSyncedTimestamp: null,
      mutations: store.pendingQueue.map((m) => ({
        id: m.id,
        entityType: m.entity_type as SyncEntityType,
        entityId: m.entity_id,
        operation: m.action as SyncOperationType,
        payload: m.payload,
        vectorClock: { [deviceId]: m.vector_clock },
        clientTimestamp: new Date(),
        isResolved: false,
      })),
    };

    const { results, conflicts, server_clocks } = await apiFetch<{
      results: Array<{ status: string; entity_id: string }>;
      conflicts: unknown[];
      server_clocks: VectorClock;
    }>("/api/sync/delta", {
      method: "POST",
      body: JSON.stringify({
        device_id: deviceId,
        mutations: store.pendingQueue.map((m) => ({
          entity_type: m.entity_type,
          entity_id: m.entity_id,
          action: m.action,
          vector_clock: m.vector_clock,
          payload: m.payload,
          client_timestamp: new Date().toISOString(),
        })),
      }),
    });

    const syncedIds: string[] = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.status !== "error" && results[i]?.status !== "conflict") {
        syncedIds.push(store.pendingQueue[i]?.id || "");
      }
    }

    store.dequeue(syncedIds.filter(Boolean));
    if (server_clocks) store.setServerClocks(server_clocks);

    return { results, conflicts, server_clocks };
  } finally {
    store.setSyncing(false);
  }
}

export async function pullRemoteChanges(sinceClock?: number) {
  const clocks = useSyncStore.getState().lastServerClocks;
  const clock = sinceClock ?? clocks[deviceId] ?? 0;
  const { changes, server_clocks, has_more } = await apiFetch<{
    changes: unknown[];
    server_clocks: VectorClock;
    has_more: boolean;
  }>(`/api/sync/changes?since_clock=${clock}&device_id=${deviceId}`);

  if (server_clocks) useSyncStore.getState().setServerClocks(server_clocks);
  return { changes, has_more };
}

export async function pullFullSync(): Promise<DeltaSyncResponse> {
  const clocks = useSyncStore.getState().lastServerClocks;
  return apiFetch<DeltaSyncResponse>("/api/sync/pull", {
    method: "POST",
    body: JSON.stringify({
      client_current_clock: clocks,
      last_synced_timestamp: null,
      limit: 200,
    }),
  });
}

export function useSync() {
  return {
    enqueue: useSyncStore((s) => s.enqueue),
    pushPendingMutations,
    pullRemoteChanges,
    pullFullSync,
    pendingCount: useSyncStore((s) => s.pendingQueue.length),
    isSyncing: useSyncStore((s) => s.isSyncing),
    lastServerClocks: useSyncStore((s) => s.lastServerClocks),
  };
}
