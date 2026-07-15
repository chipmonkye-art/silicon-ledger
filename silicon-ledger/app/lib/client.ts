import { useAuthStore, useWorkspaceStore } from "./stores";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { params?: Record<string, string>; raw?: boolean } = {},
): Promise<T> {
  const token = useAuthStore.getState().token;
  const wsId = useWorkspaceStore.getState().workspaceId;

  const url = new URL(`${API_BASE}${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    Authorization: token ? `Bearer ${token}` : "",
  };
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (wsId) headers["x-workspace-id"] = wsId;

  const { raw, ...fetchOpts } = options;
  const res = await fetch(url.toString(), { ...fetchOpts, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `API error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  if (raw) return res.blob() as T;
  return res.json();
}
