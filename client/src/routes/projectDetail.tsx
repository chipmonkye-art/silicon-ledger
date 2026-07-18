import { useMatch, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus } from "lucide-react";
import { projectsApi, transactionsApi } from "@/lib/api";
import { useTransactionSheet } from "@/stores/transactionStore";
import { formatCents } from "@/lib/utils";

const statusColor: Record<string, "warning" | "success" | "secondary" | "default" | "destructive"> = {
  planning: "warning",
  active: "success",
  on_hold: "secondary",
  completed: "default",
  cancelled: "destructive",
};

export default function ProjectDetail() {
  const { id } = useMatch({ from: "/auth/projects/$id" })!.params;
  const { openSheet } = useTransactionSheet();

  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => projectsApi.get(id),
  });

  const { data: txnsData, isLoading: txnsLoading } = useQuery({
    queryKey: ["transactions", "project", id],
    queryFn: () => transactionsApi.list({ project_id: id }),
  });

  const project = projectData?.project;
  const transactions = txnsData?.transactions ?? [];

  const nonStagedExpenses = transactions.filter((t) => t.type === "expense" && !t.is_staged);
  const totalSpent = nonStagedExpenses.reduce((s, t) => s + t.amount, 0);
  const totalIncome = transactions.filter((t) => t.type === "income" && !t.is_staged).reduce((s, t) => s + t.amount, 0);
  const stagedCount = transactions.filter((t) => t.is_staged).length;
  const spentPct = project && project.budget > 0 ? Math.round((totalSpent / project.budget) * 100) : 0;
  const remaining = project ? project.budget - totalSpent + totalIncome : 0;

  if (projectLoading) {
    return <p className="text-sm text-neutral-400 text-center py-8">Loading project…</p>;
  }
  if (!project) {
    return <p className="text-sm text-neutral-400 text-center py-8">Project not found.</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <Link to="/projects">
          <Button variant="ghost" size="icon" className="-ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">{project.name}</h1>
          <p className="text-sm text-neutral-500">{project.location}</p>
        </div>
        <Badge variant={statusColor[project.status] || "default"} className="ml-auto capitalize">
          {project.status.replace("_", " ")}
        </Badge>
      </div>

      <Card className="border-neutral-100">
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-neutral-500">Budget</span>
            <span className="font-mono font-semibold">{formatCents(project.budget)}</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Spent</span>
              <span className="font-mono text-expense">{formatCents(totalSpent)}</span>
            </div>
            <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-expense rounded-full transition-all"
                style={{ width: `${Math.min(spentPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Remaining</span>
              <span className="font-mono text-emerald-600">{formatCents(remaining)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-neutral-100">
          <CardContent className="pt-4 text-center">
            <div className="text-lg font-mono font-bold">{txnsLoading ? "…" : transactions.length}</div>
            <p className="text-xs text-neutral-500 mt-1">Transactions</p>
          </CardContent>
        </Card>
        <Card className="border-neutral-100">
          <CardContent className="pt-4 text-center">
            <div className="text-lg font-mono font-bold text-expense">{txnsLoading ? "…" : stagedCount}</div>
            <p className="text-xs text-neutral-500 mt-1">Pending</p>
          </CardContent>
        </Card>
        <Card className="border-neutral-100">
          <CardContent className="pt-4 text-center">
            <div className="text-lg font-mono font-bold text-emerald-600">{spentPct}%</div>
            <p className="text-xs text-neutral-500 mt-1">Used</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Ledger</h2>
        <Button size="sm" className="rounded-full" onClick={() => openSheet()}>
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>

      <Card className="border-neutral-100 overflow-hidden">
        <CardContent className="p-0 divide-y divide-neutral-50">
          {txnsLoading ? (
            <div className="p-4 text-center text-xs text-neutral-400">Loading transactions…</div>
          ) : transactions.length === 0 ? (
            <div className="p-4 text-center text-xs text-neutral-400">No transactions yet.</div>
          ) : (
            transactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between p-4 hover:bg-neutral-50/50 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{txn.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-neutral-400">{txn.date}</span>
                      <span className="text-[10px] text-neutral-300">·</span>
                      <span className="text-xs text-neutral-400">{txn.category}</span>
                      {txn.is_staged && (
                        <Badge variant="warning" className="text-[10px] px-1.5 py-0">Staged</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`font-mono text-right flex-shrink-0 ml-4 ${txn.type === "expense" ? "text-expense" : "text-emerald-600"}`}>
                  <div className="text-sm font-semibold">
                    {txn.type === "income" ? "+" : "-"}{formatCents(Math.abs(txn.amount))}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
