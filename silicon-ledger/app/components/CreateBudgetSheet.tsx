import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { createBudget, fetchCostCenters, fetchProjects } from "~/lib/api";

interface CreateBudgetSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateBudgetSheet({ isOpen, onClose }: CreateBudgetSheetProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [cost_center_id, setCostCenterId] = useState("");
  const [project_id, setProjectId] = useState("");
  const [amount_minor, setAmountMinor] = useState("");
  const [period_start, setPeriodStart] = useState("");
  const [period_end, setPeriodEnd] = useState("");

  const { data: ccData } = useQuery({ queryKey: ["cost-centers"], queryFn: fetchCostCenters, enabled: isOpen });
  const { data: projData } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects, enabled: isOpen });

  const createMutation = useMutation({
    mutationFn: createBudget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      onClose();
      setName(""); setCostCenterId(""); setProjectId(""); setAmountMinor(""); setPeriodStart(""); setPeriodEnd("");
    },
  });

  function handleSubmit() {
    if (!name.trim() || !amount_minor || !period_start || !period_end) return;
    createMutation.mutate({
      name: name.trim(),
      cost_center_id: cost_center_id || undefined,
      project_id: project_id || undefined,
      amount_minor: parseInt(amount_minor, 10),
      period_start,
      period_end,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Budget">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Budget Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Marketing"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Cost Center</label>
          <select value={cost_center_id} onChange={(e) => setCostCenterId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">None</option>
            {(ccData?.cost_centers ?? []).map((cc) => (
              <option key={cc.id} value={cc.id}>{cc.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Project</label>
          <select value={project_id} onChange={(e) => setProjectId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">None</option>
            {(projData?.projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Amount (cents)</label>
          <input type="number" value={amount_minor} onChange={(e) => setAmountMinor(e.target.value)} placeholder="e.g. 100000"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Start Date</label>
            <input type="date" value={period_start} onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">End Date</label>
            <input type="date" value={period_end} onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <button onClick={handleSubmit} disabled={!name || !amount_minor || !period_start || !period_end || createMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all">
          {createMutation.isPending ? "Creating..." : "Create Budget"}
        </button>
      </div>
    </BottomSheet>
  );
}
