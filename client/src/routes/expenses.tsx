import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, CheckCircle2, Clock, XCircle, AlertCircle, Receipt } from "lucide-react";
import { expensesApi } from "@/lib/api";
import { useTransactionSheet } from "@/stores/transactionStore";
import { formatCents, cn } from "@/lib/utils";
import type { Expense } from "@/types";

const statusConfig: Record<string, { label: string; variant: "outline" | "warning" | "success" | "destructive" | "default"; icon: React.ElementType }> = {
  draft: { label: "Draft", variant: "outline", icon: FileText },
  pending: { label: "Pending", variant: "warning", icon: Clock },
  approved: { label: "Approved", variant: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  paid: { label: "Paid", variant: "default", icon: AlertCircle },
};

const filters = ["all", "pending", "approved", "draft", "rejected", "paid"] as const;

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const { openSheet } = useTransactionSheet();

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", filter],
    queryFn: () => expensesApi.list(filter !== "all" ? { status: filter } : {}),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => expensesApi.approve(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => expensesApi.reject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const expenses = data?.expenses ?? [];
  const summary = data?.summary ?? { approved: 0, pending: 0 };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <Button size="sm" className="rounded-full" onClick={() => openSheet("expense")}>
          <Plus className="mr-1 h-4 w-4" />New
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="border-neutral-100">
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wider">Approved</p>
            <div className="text-xl font-mono font-bold text-emerald-600 mt-1">{formatCents(summary.approved)}</div>
          </CardContent>
        </Card>
        <Card className="border-neutral-100">
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wider">Pending</p>
            <div className="text-xl font-mono font-bold text-amber-600 mt-1">{formatCents(summary.pending)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border",
              filter === f
                ? "bg-expense text-white border-expense"
                : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Loading expenses…</p>
      ) : expenses.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">No expenses found.</p>
      ) : (
        <div className="space-y-3">
          {expenses.map((expense: Expense) => {
            const status = statusConfig[expense.status];
            const StatusIcon = status.icon;
            return (
              <Card key={expense.id} className="border-neutral-100">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{expense.description}</p>
                        {expense.receipt_url && (
                          <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer">
                            <img src={expense.receipt_url} alt="" className="w-5 h-5 rounded object-cover border border-neutral-200 hover:border-expense transition-colors flex-shrink-0" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-neutral-500">{expense.category}</span>
                        <span className="text-[10px] text-neutral-300">·</span>
                        <span className="text-xs text-neutral-500">{expense.project_name || "—"}</span>
                        <span className="text-[10px] text-neutral-300">·</span>
                        <span className="text-xs text-neutral-400">{expense.created_at?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="font-mono text-sm font-semibold text-expense">{formatCents(expense.amount)}</div>
                      <Badge variant={status.variant} className="flex items-center gap-1 text-[10px] px-2 py-0.5">
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  {(expense.status === "pending" || expense.status === "draft") && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-neutral-50">
                      {expense.status === "pending" && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs rounded-lg bg-expense hover:bg-expense/90 text-white border-none"
                          onClick={() => approveMutation.mutate(expense.id)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs rounded-lg border-neutral-200"
                        onClick={() => rejectMutation.mutate(expense.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <XCircle className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
