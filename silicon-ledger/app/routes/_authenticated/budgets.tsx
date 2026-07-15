import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { fetchBudgets, fetchAlerts, evaluateAlertRules, markAlertRead } from "~/lib/api";
import { CreateBudgetSheet } from "~/components/CreateBudgetSheet";
import { formatCents, cn } from "~/lib/utils";

export const Route = createFileRoute("/_authenticated/budgets")({
  component: BudgetsPage,
});

function BudgetsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("budgets");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: budgetData } = useQuery({
    queryKey: ["budgets"],
    queryFn: () => fetchBudgets(),
  });

  const { data: alertData } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetchAlerts(),
  });

  const evalMutation = useMutation({
    mutationFn: evaluateAlertRules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const readMutation = useMutation({
    mutationFn: markAlertRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const budgets = budgetData?.budgets ?? [];
  const alerts = alertData?.alerts ?? [];

  const filteredBudgets = search
    ? budgets.filter((b) => b.budget_name?.toLowerCase().includes(search.toLowerCase()) || b.cost_center_name?.toLowerCase().includes(search.toLowerCase()))
    : budgets;

  const filteredAlerts = search
    ? alerts.filter((a) => a.title.toLowerCase().includes(search.toLowerCase()))
    : alerts;

  const tabs = [
    { key: "budgets", label: "Budgets", active: tab === "budgets", onClick: () => setTab("budgets") },
    { key: "alerts", label: `Alerts (${alerts.filter((a) => !a.is_read).length})`, active: tab === "alerts", onClick: () => setTab("alerts") },
  ];

  if (tab === "budgets") {
    const budgetColumns = [
      { key: "name", label: "Budget", grow: true },
      { key: "status", label: "Used", align: "right" as const, width: "60px" },
    ];

    const budgetRows = filteredBudgets.map((b) => ({
      id: b.id,
      cells: {
        name: (
          <div>
            <div className="font-medium text-zinc-700 dark:text-zinc-300">{b.budget_name}</div>
            <div className="text-[10px] text-zinc-400">{b.cost_center_name || "Unallocated"}</div>
          </div>
        ),
        status: (
          <div className="text-right">
            <span className={cn("font-mono text-[11px]", b.is_over_budget ? "text-red-500" : "text-zinc-600")}>
              {b.spend_pct}%
            </span>
            <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full mt-1">
              <div className={cn("h-full rounded-full", b.is_over_budget ? "bg-red-500" : "bg-indigo-500")} style={{ width: `${Math.min(b.spend_pct, 100)}%` }} />
            </div>
          </div>
        ),
      },
    }));

    return (
      <>
        <CompactList
          title="Budgets"
          columns={budgetColumns}
          rows={budgetRows}
          searchable
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search budgets..."
          tabs={tabs}
          actionLabel="Evaluate Alerts"
          onAction={() => evalMutation.mutate()}
        />
        <CreateBudgetSheet isOpen={showCreate} onClose={() => setShowCreate(false)} />
      </>
    );
  }

  const alertColumns = [
    { key: "alert", label: "Alert", grow: true },
    { key: "severity", label: "", align: "right" as const, width: "50px" },
  ];

  const alertRows = filteredAlerts.map((a) => ({
    id: a.id,
    cells: {
      alert: (
        <div className={cn(!a.is_read && "font-semibold")}>
          <div className="text-zinc-700 dark:text-zinc-300">{a.title}</div>
          <div className="text-[10px] text-zinc-400 truncate">{a.message}</div>
        </div>
      ),
      severity: (
        <span className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded",
          a.severity === "critical" && "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
          a.severity === "warning" && "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
          a.severity === "info" && "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
        )}>
          {a.severity}
        </span>
      ),
    },
  }));

  return (
    <CompactList
      title="Alerts"
      columns={alertColumns}
      rows={alertRows}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search alerts..."
      tabs={tabs}
      onRowClick={(id) => readMutation.mutate(id)}
    />
  );
}
