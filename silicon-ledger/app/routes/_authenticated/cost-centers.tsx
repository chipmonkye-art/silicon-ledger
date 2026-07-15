import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { fetchCostCenters, createCostCenter } from "~/lib/api";
import { BottomSheet } from "~/components/ui/bottom-sheet";

export const Route = createFileRoute("/_authenticated/cost-centers")({
  component: CostCentersPage,
});

function CostCentersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data } = useQuery({ queryKey: ["cost-centers"], queryFn: fetchCostCenters });
  const costCenters = data?.cost_centers ?? [];

  const filtered = search
    ? costCenters.filter((cc) => cc.name.toLowerCase().includes(search.toLowerCase()) || cc.code?.toLowerCase().includes(search.toLowerCase()))
    : costCenters;

  const createMutation = useMutation({
    mutationFn: createCostCenter,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cost-centers"] }); setShowCreate(false); },
  });

  const columns = [
    { key: "name", label: "Cost Center", grow: true },
    { key: "code", label: "Code", width: "60px", align: "right" as const },
  ];

  const rows = filtered.map((cc) => ({
    id: cc.id,
    cells: {
      name: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300">{cc.name}</div>
          {cc.child_count ? <div className="text-[10px] text-zinc-400">{cc.child_count} sub-centers</div> : null}
        </div>
      ),
      code: <span className="text-[10px] font-mono text-zinc-400">{cc.code || "—"}</span>,
    },
  }));

  return (
    <>
      <CompactList
        title="Cost Centers"
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search cost centers..."
        actionLabel="New Cost Center"
        onAction={() => setShowCreate(true)}
      />

      <CreateCostCenterSheet isOpen={showCreate} onClose={() => setShowCreate(false)} onSubmit={(args) => createMutation.mutate(args)} isPending={createMutation.isPending} />
    </>
  );
}

function CreateCostCenterSheet({ isOpen, onClose, onSubmit, isPending }: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (args: { name: string; code?: string }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), code: code.trim() || undefined });
    setName(""); setCode("");
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Cost Center">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. MKT-001"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={handleSubmit} disabled={!name.trim() || isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {isPending ? "Creating..." : "Create Cost Center"}
        </button>
      </div>
    </BottomSheet>
  );
}
