import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { fetchAlertRules, createAlertRule, deleteAlertRule } from "~/lib/api";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Trash2 } from "lucide-react";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_authenticated/alert-rules")({
  component: AlertRulesPage,
});

function AlertRulesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data } = useQuery({ queryKey: ["alert-rules"], queryFn: fetchAlertRules });
  const rules = data?.alert_rules ?? [];

  const deleteMutation = useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const filtered = search
    ? rules.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.metric.toLowerCase().includes(search.toLowerCase()))
    : rules;

  const columns = [
    { key: "rule", label: "Alert Rule", grow: true },
    { key: "status", label: "", width: "50px" },
  ];

  const rows = filtered.map((r) => ({
    id: r.id,
    cells: {
      rule: (
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-zinc-700 dark:text-zinc-300">{r.name}</div>
            <div className="text-[10px] text-zinc-400">
              {r.entity_type} · {r.metric} {r.operator} {r.threshold}{r.metric === "spend_pct" ? "%" : ""}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(r.id); }}
            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      ),
      status: (
        <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", r.is_active ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-zinc-100 text-zinc-400")}>
          {r.is_active ? "ON" : "OFF"}
        </span>
      ),
    },
  }));

  return (
    <>
      <CompactList
        title="Alert Rules"
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search alert rules..."
        actionLabel="New Rule"
        onAction={() => setShowCreate(true)}
      />

      <CreateAlertRuleSheet isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}

function CreateAlertRuleSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [entity_type, setEntityType] = useState("budget");
  const [metric, setMetric] = useState("spend_pct");
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState("");

  const createMutation = useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      onClose();
      setName(""); setThreshold("");
    },
  });

  function handleSubmit() {
    if (!name.trim() || !threshold) return;
    createMutation.mutate({
      name: name.trim(),
      entity_type,
      metric: metric as "spend_pct",
      operator: operator as ">",
      threshold: parseFloat(threshold),
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Alert Rule">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Rule Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Budget 80% warning"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Entity</label>
            <select value={entity_type} onChange={(e) => setEntityType(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="budget">Budget</option>
              <option value="cost_center">Cost Center</option>
              <option value="project">Project</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="spend_pct">Spend %</option>
              <option value="spend_remaining">Remaining</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Operator</label>
            <select value={operator} onChange={(e) => setOperator(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Threshold</label>
            <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="80"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={!name.trim() || !threshold || createMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {createMutation.isPending ? "Creating..." : "Create Alert Rule"}
        </button>
      </div>
    </BottomSheet>
  );
}
