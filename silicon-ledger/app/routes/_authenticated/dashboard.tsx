import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchAccounts, fetchTransactions, fetchAging, fetchBudgets, fetchProjects } from "~/lib/api";
import { apiFetch } from "~/lib/client";
import { formatCentsCompact, cn, monthString } from "~/lib/utils";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { CashFlowProjection, Budget, Project } from "~/lib/types";
import { ChevronUp, ChevronDown, EyeOff, Eye, Settings2, X, Hash, BarChart3, LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type TileDisplayMode = "number" | "graph" | "both";

interface TileConfig {
  id: string;
  visible: boolean;
  displayMode: TileDisplayMode;
}

const STORAGE_KEY = "dashboard-tiles-config";

const DEFAULT_TILES: TileConfig[] = [
  { id: "net-worth", visible: true, displayMode: "number" },
  { id: "cash-flow", visible: true, displayMode: "number" },
  { id: "aging", visible: true, displayMode: "both" },
  { id: "outstanding", visible: true, displayMode: "number" },
  { id: "projects", visible: true, displayMode: "number" },
  { id: "labor-costs", visible: true, displayMode: "number" },
  { id: "recent-txns", visible: true, displayMode: "both" },
  { id: "budgets", visible: true, displayMode: "graph" },
];

const TILE_LABELS: Record<string, string> = {
  "net-worth": "Net Worth",
  "cash-flow": "Cash Flow Projection",
  "aging": "Aging Analysis",
  "outstanding": "Total Outstanding",
  "projects": "Active Projects",
  "labor-costs": "Project Labor Costs",
  "recent-txns": "Recent Transactions",
  "budgets": "Budget Utilization",
};

const MODE_OPTIONS: { value: TileDisplayMode; label: string }[] = [
  { value: "number", label: "Num" },
  { value: "graph", label: "Graph" },
  { value: "both", label: "Both" },
];

function loadConfig(): TileConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as TileConfig[];
      return DEFAULT_TILES.map((def) => parsed.find((t) => t.id === def.id) ?? { ...def });
    }
  } catch {}
  return DEFAULT_TILES.map((t) => ({ ...t }));
}

function useTileConfig() {
  const [config, setConfig] = useState<TileConfig[]>(loadConfig);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const update = useCallback((id: string, patch: Partial<TileConfig>) => {
    setConfig((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const move = useCallback((id: string, dir: "up" | "down") => {
    setConfig((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const next = dir === "up" ? idx - 1 : idx + 1;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  }, []);

  const toggleVis = useCallback((id: string) => {
    setConfig((prev) => prev.map((t) => (t.id === id ? { ...t, visible: !t.visible } : t)));
  }, []);

  const cycleMode = useCallback((id: string) => {
    setConfig((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const modes: TileDisplayMode[] = ["number", "graph", "both"];
        const idx = modes.indexOf(t.displayMode);
        return { ...t, displayMode: modes[(idx + 1) % modes.length]! };
      }),
    );
  }, []);

  return { config, update, move, toggleVis, cycleMode };
}

function MiniBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[10px] text-zinc-400 w-10 truncate shrink-0">{label}</span>}
      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color ?? "oklch(0.58 0.22 25)" }}
        />
      </div>
    </div>
  );
}

function TileCard({
  label,
  loading,
  error,
  children,
  displayMode,
  onCycleMode,
}: {
  label: string;
  loading?: boolean;
  error?: Error | null;
  children: ReactNode;
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  return (
    <div className="mac-card p-3 relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
        <button
          onClick={onCycleMode}
          className="text-zinc-300 hover:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
          title={`Display: ${displayMode}`}
        >
          {displayMode === "number" ? (
            <Hash size={12} />
          ) : displayMode === "graph" ? (
            <BarChart3 size={12} />
          ) : (
            <LayoutGrid size={12} />
          )}
        </button>
      </div>
      {loading ? (
        <div className="space-y-1.5 animate-pulse">
          <div className="h-5 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-2 w-full rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ) : error ? (
        <div className="text-[10px] text-expense py-1">Error loading data</div>
      ) : (
        children
      )}
    </div>
  );
}

function SettingsPanel({
  config,
  onUpdate,
  onMove,
  onToggleVis,
  onClose,
}: {
  config: TileConfig[];
  onUpdate: (id: string, patch: Partial<TileConfig>) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onToggleVis: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mac-card p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
          Dashboard Settings
        </span>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="divide-y divide-hairline">
        {config.map((tile, i) => (
          <div key={tile.id} className="flex items-center gap-2 py-1.5 text-[11px]">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => onMove(tile.id, "up")}
                disabled={i === 0}
                className="text-zinc-300 hover:text-zinc-600 disabled:opacity-20 transition-colors"
              >
                <ChevronUp size={10} />
              </button>
              <button
                onClick={() => onMove(tile.id, "down")}
                disabled={i === config.length - 1}
                className="text-zinc-300 hover:text-zinc-600 disabled:opacity-20 transition-colors"
              >
                <ChevronDown size={10} />
              </button>
            </div>
            <span className="flex-1 text-zinc-600 dark:text-zinc-300">
              {TILE_LABELS[tile.id] ?? tile.id}
            </span>
            <select
              value={tile.displayMode}
              onChange={(e) => onUpdate(tile.id, { displayMode: e.target.value as TileDisplayMode })}
              className="text-[10px] bg-transparent border border-hairline rounded px-1 py-0.5 outline-none focus:border-accent"
            >
              {MODE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => onToggleVis(tile.id)}
              className={cn(
                "transition-colors",
                tile.visible
                  ? "text-zinc-400 hover:text-expense"
                  : "text-zinc-200 hover:text-zinc-400",
              )}
            >
              {tile.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetWorthTile({
  displayMode,
  onCycleMode,
}: {
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const summary = data?.summary;
  const netWorth = summary?.netWorth ?? 0;
  const income = data?.accounts?.reduce(
    (s, a) => s + Math.max(0, (a.current_balance ?? 0) - a.opening_balance),
    0,
  ) ?? 0;
  const expense = data?.accounts?.reduce(
    (s, a) => s + Math.abs(Math.min(0, (a.current_balance ?? 0) - a.opening_balance)),
    0,
  ) ?? 0;

  const showNumber = displayMode === "number" || displayMode === "both";
  const showGraph = displayMode === "graph" || displayMode === "both";

  return (
    <TileCard
      label="Net Worth"
      loading={isLoading}
      error={error}
      displayMode={displayMode}
      onCycleMode={onCycleMode}
    >
      {showNumber && (
        <p className="text-xl font-mono font-bold mt-0.5">{formatCentsCompact(netWorth)}</p>
      )}
      {showGraph && (
        <div className="mt-1.5 space-y-1">
          <MiniBar
            value={income}
            max={Math.max(income, expense, 1)}
            label="Assets"
            color="#6366f1"
          />
          <MiniBar
            value={expense}
            max={Math.max(income, expense, 1)}
            label="Liab."
            color="oklch(0.58 0.22 25)"
          />
        </div>
      )}
    </TileCard>
  );
}

function CashFlowTile({
  displayMode,
  onCycleMode,
}: {
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cash-flow"],
    queryFn: () => apiFetch<CashFlowProjection[]>("/api/cashflow"),
  });

  const items = Array.isArray(data) ? data : [];
  const total = items.reduce((s, c) => s + (c.amount_cents ?? 0), 0);
  const maxVal = Math.max(...items.map((c) => c.amount_cents), 1);

  const showNumber = displayMode === "number" || displayMode === "both";
  const showGraph = displayMode === "graph" || displayMode === "both";

  return (
    <TileCard
      label="Cash Flow Projection"
      loading={isLoading}
      error={error as Error | null}
      displayMode={displayMode}
      onCycleMode={onCycleMode}
    >
      {showNumber && (
        <p className="text-xl font-mono font-bold mt-0.5">
          {items.length > 0 ? formatCentsCompact(total) : "—"}
        </p>
      )}
      {showGraph && items.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {items.slice(0, 6).map((c, i) => (
            <MiniBar
              key={i}
              value={c.amount_cents}
              max={maxVal}
              label={c.label?.slice(0, 6)}
              color={c.amount_cents >= 0 ? "#6366f1" : "oklch(0.58 0.22 25)"}
            />
          ))}
        </div>
      )}
    </TileCard>
  );
}

function AgingTile({
  displayMode,
  onCycleMode,
}: {
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["aging"],
    queryFn: fetchAging,
  });

  const buckets = (data as { aging: Array<{ bucket: string; count: number; total_remaining: number }> } | undefined)?.aging ?? [];
  const totalOutstanding = buckets.reduce((s, b) => s + b.total_remaining, 0);
  const maxAmount = Math.max(...buckets.map((b) => b.total_remaining), 1);

  const showNumber = displayMode === "number" || displayMode === "both";
  const showGraph = displayMode === "graph" || displayMode === "both";

  return (
    <TileCard
      label="Aging Analysis"
      loading={isLoading}
      error={error as Error | null}
      displayMode={displayMode}
      onCycleMode={onCycleMode}
    >
      {showNumber && buckets.length > 0 && (
        <p className="text-xl font-mono font-bold mt-0.5">{formatCentsCompact(totalOutstanding)}</p>
      )}
      {showGraph && buckets.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {buckets.map((b, i) => (
            <MiniBar
              key={b.bucket}
              value={b.total_remaining}
              max={maxAmount}
              label={`${b.bucket} (${b.count})`}
              color={
                i === 0
                  ? "#22c55e"
                  : i === 1
                    ? "#eab308"
                    : i === 2
                      ? "#f97316"
                      : "oklch(0.58 0.22 25)"
              }
            />
          ))}
        </div>
      )}
      {buckets.length === 0 && !isLoading && (
        <p className="text-[11px] text-zinc-400">No outstanding items</p>
      )}
    </TileCard>
  );
}

function OutstandingTile({
  displayMode,
  onCycleMode,
}: {
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["aging"],
    queryFn: fetchAging,
  });

  const buckets = (data as { aging: Array<{ bucket: string; count: number; total_remaining: number }> } | undefined)?.aging ?? [];
  const totalOutstanding = buckets.reduce((s, b) => s + b.total_remaining, 0);

  return (
    <TileCard
      label="Total Outstanding"
      loading={isLoading}
      error={error as Error | null}
      displayMode={displayMode}
      onCycleMode={onCycleMode}
    >
      <p className="text-xl font-mono font-bold mt-0.5">
        {buckets.length > 0 ? formatCentsCompact(totalOutstanding) : "—"}
      </p>
      {buckets.length > 0 && (
        <p className="text-[10px] text-zinc-400 mt-0.5">
          {buckets.reduce((s, b) => s + b.count, 0)} items
        </p>
      )}
    </TileCard>
  );
}

function ProjectsTile({
  displayMode,
  onCycleMode,
}: {
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const projects = (data as { projects: Project[] } | undefined)?.projects ?? [];
  const active = projects.filter((p) => p.status === "active");
  const onHold = projects.filter((p) => p.status === "on_hold");
  const showNumber = displayMode === "number" || displayMode === "both";
  const showGraph = displayMode === "graph" || displayMode === "both";

  return (
    <TileCard
      label="Active Projects"
      loading={isLoading}
      error={error as Error | null}
      displayMode={displayMode}
      onCycleMode={onCycleMode}
    >
      {showNumber && (
        <p className="text-xl font-mono font-bold mt-0.5">{active.length}</p>
      )}
      {showGraph && projects.length > 0 && (
        <div className="mt-1.5 space-y-1">
          <MiniBar value={active.length} max={projects.length} label="Active" color="#22c55e" />
          <MiniBar value={onHold.length} max={projects.length} label="Hold" color="#eab308" />
          <MiniBar
            value={projects.length - active.length - onHold.length}
            max={projects.length}
            label="Other"
            color="#6366f1"
          />
        </div>
      )}
      {projects.length === 0 && !isLoading && (
        <p className="text-[11px] text-zinc-400">No projects</p>
      )}
    </TileCard>
  );
}

function LaborCostsTile({
  displayMode,
  onCycleMode,
}: {
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["labor-costs", monthString()],
    queryFn: () =>
      apiFetch<{ total_cents: number; count: number }>("/api/attendance/summary", {
        params: { month: monthString() },
      }),
  });

  const total = data?.total_cents ?? 0;
  const count = data?.count ?? 0;

  return (
    <TileCard
      label="Project Labor Costs"
      loading={isLoading}
      error={error as Error | null}
      displayMode={displayMode}
      onCycleMode={onCycleMode}
    >
      <p className="text-xl font-mono font-bold mt-0.5">
        {data ? formatCentsCompact(total) : "—"}
      </p>
      {count > 0 && (
        <p className="text-[10px] text-zinc-400 mt-0.5">
          {count} entries this month
        </p>
      )}
    </TileCard>
  );
}

function RecentTransactionsTile({
  displayMode,
  onCycleMode,
}: {
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () => fetchTransactions({ limit: 5 }),
  });

  const txns = data?.transactions ?? [];
  const showNumber = displayMode === "number" || displayMode === "both";
  const showGraph = displayMode === "graph" || displayMode === "both";

  return (
    <TileCard
      label="Recent Transactions"
      loading={isLoading}
      error={error}
      displayMode={displayMode}
      onCycleMode={onCycleMode}
    >
      {showNumber && (
        <p className="text-xl font-mono font-bold mt-0.5">{data?.total ?? 0}</p>
      )}
      {showGraph && txns.length > 0 && (
        <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-[10px] py-0.5">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span
                  className={cn(
                    "w-1 h-1 rounded-full shrink-0",
                    t.txn_type === "income"
                      ? "bg-green-400"
                      : t.txn_type === "expense"
                        ? "bg-expense"
                        : "bg-zinc-300",
                  )}
                />
                <span className="truncate text-zinc-500">{t.description}</span>
              </div>
              <span
                className={cn(
                  "font-mono shrink-0 ml-2",
                  t.txn_type === "expense" ? "text-expense" : "text-zinc-700 dark:text-zinc-300",
                )}
              >
                {t.txn_type === "expense" ? "-" : "+"}
                {formatCentsCompact(t.amount_minor)}
              </span>
            </div>
          ))}
        </div>
      )}
      {txns.length === 0 && !isLoading && (
        <p className="text-[11px] text-zinc-400">No recent transactions</p>
      )}
    </TileCard>
  );
}

function BudgetUtilizationTile({
  displayMode,
  onCycleMode,
}: {
  displayMode: TileDisplayMode;
  onCycleMode: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["budgets"],
    queryFn: () => fetchBudgets(),
  });

  const budgets = (data as { budgets: Budget[] } | undefined)?.budgets ?? [];
  const overBudget = budgets.filter((b) => b.is_over_budget);
  const sorted = [...budgets].sort((a, b) => b.spend_pct - a.spend_pct).slice(0, 5);

  const showNumber = displayMode === "number" || displayMode === "both";
  const showGraph = displayMode === "graph" || displayMode === "both";

  return (
    <TileCard
      label="Budget Utilization"
      loading={isLoading}
      error={error as Error | null}
      displayMode={displayMode}
      onCycleMode={onCycleMode}
    >
      {showNumber && (
        <p className="text-xl font-mono font-bold mt-0.5">
          {overBudget.length > 0 ? (
            <span className="text-expense">{overBudget.length} over budget</span>
          ) : budgets.length > 0 ? (
            <span className="text-green-500">On track</span>
          ) : (
            "—"
          )}
        </p>
      )}
      {showGraph && sorted.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {sorted.map((b) => (
            <div key={b.id} className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-400 w-14 truncate shrink-0">
                {b.budget_name ?? "Budget"}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-700 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, b.spend_pct)}%`,
                    background: b.is_over_budget
                      ? "oklch(0.58 0.22 25)"
                      : b.spend_pct > 80
                        ? "#eab308"
                        : "#6366f1",
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-500 w-10 text-right shrink-0">
                {Math.round(b.spend_pct)}%
              </span>
            </div>
          ))}
        </div>
      )}
      {budgets.length === 0 && !isLoading && (
        <p className="text-[11px] text-zinc-400">No budgets set</p>
      )}
    </TileCard>
  );
}

function DashboardPage() {
  const { config, update, move, toggleVis, cycleMode } = useTileConfig();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const visibleTiles = useMemo(() => config.filter((t) => t.visible), [config]);

  function renderTile(tile: TileConfig) {
    const props = {
      key: tile.id,
      displayMode: tile.displayMode,
      onCycleMode: () => cycleMode(tile.id),
    };

    switch (tile.id) {
      case "net-worth":
        return <NetWorthTile {...props} />;
      case "cash-flow":
        return <CashFlowTile {...props} />;
      case "aging":
        return <AgingTile {...props} />;
      case "outstanding":
        return <OutstandingTile {...props} />;
      case "projects":
        return <ProjectsTile {...props} />;
      case "labor-costs":
        return <LaborCostsTile {...props} />;
      case "recent-txns":
        return <RecentTransactionsTile {...props} />;
      case "budgets":
        return <BudgetUtilizationTile {...props} />;
      default:
        return null;
    }
  }

  return (
    <div className="space-y-3">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Dashboard</h1>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all",
            settingsOpen
              ? "bg-expense text-white"
              : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          <Settings2 size={12} />
          Customize
        </button>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <SettingsPanel
          config={config}
          onUpdate={update}
          onMove={move}
          onToggleVis={toggleVis}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Tile Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleTiles.map((tile) => renderTile(tile))}
      </div>
    </div>
  );
}
