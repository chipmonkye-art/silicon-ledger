import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { fetchProjects, createProject } from "~/lib/api";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { formatCents, cn } from "~/lib/utils";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const projects = data?.projects ?? [];

  const filtered = search
    ? projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase()))
    : projects;

  const columns = [
    { key: "project", label: "Project", grow: true },
    { key: "budget", label: "Budget", align: "right" as const, width: "80px" },
  ];

  const rows = filtered.map((p) => ({
    id: p.id,
    cells: {
      project: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            {p.name}
            <span className={cn("text-[9px] px-1 py-0.5 rounded-full", p.status === "active" ? "bg-emerald-100 text-emerald-600" : p.status === "on_hold" ? "bg-amber-100 text-amber-600" : "bg-zinc-100 text-zinc-400")}>
              {p.status}
            </span>
          </div>
          {p.code && <div className="text-[10px] text-zinc-400 font-mono">{p.code}</div>}
        </div>
      ),
      budget: (
        <div className="text-right">
          <div className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{formatCents(p.budget_minor)}</div>
          {(p as any).spent_minor > 0 && (
            <div className="text-[9px] text-zinc-400">{formatCents((p as any).spent_minor)} spent</div>
          )}
        </div>
      ),
    },
  }));

  return (
    <>
      <CompactList
        title="Projects"
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search projects..."
        actionLabel="New Project"
        onAction={() => setShowCreate(true)}
      />

      <CreateProjectSheet isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}

function CreateProjectSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [budget_minor, setBudgetMinor] = useState("");
  const [start_date, setStartDate] = useState("");
  const [target_end_date, setTargetEndDate] = useState("");

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
      setName(""); setCode(""); setBudgetMinor(""); setStartDate(""); setTargetEndDate("");
    },
  });

  function handleSubmit() {
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      code: code.trim() || undefined,
      budget_minor: parseInt(budget_minor) || 0,
      start_date: start_date || undefined,
      target_end_date: target_end_date || undefined,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Project">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Project Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Renovation"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. PRJ-001"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Budget (cents)</label>
          <input type="number" value={budget_minor} onChange={(e) => setBudgetMinor(e.target.value)} placeholder="e.g. 500000"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Start Date</label>
            <input type="date" value={start_date} onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Target End</label>
            <input type="date" value={target_end_date} onChange={(e) => setTargetEndDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={!name.trim() || createMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {createMutation.isPending ? "Creating..." : "Create Project"}
        </button>
      </div>
    </BottomSheet>
  );
}
