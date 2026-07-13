import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, ShoppingCart, Wrench, Truck, FileText, Zap, Briefcase, TrendingUp, ArrowLeftRight } from "lucide-react";
import { transactionsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { formatCents, cn } from "@/lib/utils";
import type { Transaction } from "@/types";

const categoryIcons: Record<string, React.ElementType> = {
  materials: Wrench, labor: Briefcase, permits: FileText,
  utilities: Zap, transport: Truck, food: ShoppingCart,
  "client payment": TrendingUp, investment: TrendingUp,
  refund: ArrowLeftRight, transfer: ArrowLeftRight,
};

function getTxIcon(category?: string) {
  if (!category) return ShoppingCart;
  const key = category.toLowerCase();
  for (const [k, Icon] of Object.entries(categoryIcons)) {
    if (key.includes(k)) return Icon;
  }
  return ShoppingCart;
}

export default function ReviewPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isFinance = user?.role === "finance" || user?.role === "md";

  const { data, isLoading } = useQuery({
    queryKey: ["staged"],
    queryFn: transactionsApi.staged,
  });

  const approveMutation = useMutation({
    mutationFn: (ids: string[]) => transactionsApi.bulkApprove(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staged"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      setSelected(new Set());
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (ids: string[]) => transactionsApi.bulkReject(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staged"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setSelected(new Set());
    },
  });

  const staged = data?.staged ?? [];
  const summary = data?.summary ?? { income: 0, expense: 0, transfers: 0, count: 0 };
  const netImpact = summary.income - summary.expense;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === staged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(staged.map((t) => t.id)));
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {summary.count} transaction{summary.count !== 1 ? "s" : ""} awaiting approval
          </p>
        </div>
        {isFinance && summary.count > 0 && (
          <Badge variant="warning" className="flex items-center gap-1 text-xs px-3 py-1">
            <AlertTriangle className="w-3 h-3" />Pending Review
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-neutral-100">
          <CardContent className="pt-4">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Staged Income</p>
            <p className="text-lg font-mono font-bold text-emerald-600 mt-1">{formatCents(summary.income)}</p>
          </CardContent>
        </Card>
        <Card className="border-neutral-100">
          <CardContent className="pt-4">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Staged Expense</p>
            <p className="text-lg font-mono font-bold text-expense mt-1">{formatCents(summary.expense)}</p>
          </CardContent>
        </Card>
        <Card className="border-neutral-100">
          <CardContent className="pt-4">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Net Impact</p>
            <p className={cn("text-lg font-mono font-bold mt-1", netImpact >= 0 ? "text-emerald-600" : "text-expense")}>
              {formatCents(netImpact)}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Loading…</p>
      ) : staged.length === 0 ? (
        <Card className="border-neutral-100">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-600">All caught up</p>
            <p className="text-xs text-neutral-400 mt-1">No staged transactions to review.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {isFinance && (
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.size === staged.length}
                  onChange={toggleAll}
                  className="rounded border-neutral-300 text-expense focus:ring-expense/30"
                />
                Select all ({staged.length})
              </label>
              <span className="text-xs text-neutral-400 font-mono">{selected.size} selected</span>
            </div>
          )}

          <Card className="border-neutral-100 overflow-hidden divide-y divide-neutral-50">
            {staged.map((tx: Transaction) => {
              const Icon = getTxIcon(tx.category);
              return (
                <div
                  key={tx.id}
                  className={cn(
                    "flex items-center justify-between p-4 transition-colors",
                    selected.has(tx.id) ? "bg-expense/[0.03]" : "hover:bg-neutral-50/50"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {isFinance && (
                      <input
                        type="checkbox"
                        checked={selected.has(tx.id)}
                        onChange={() => toggle(tx.id)}
                        className="rounded border-neutral-300 text-expense focus:ring-expense/30 shrink-0"
                      />
                    )}
                    <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-neutral-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{tx.description}</p>
                      <p className="text-[10px] text-neutral-400 font-mono uppercase tracking-tighter flex items-center gap-1">
                        <span>{tx.date}</span>
                        <span>· {tx.account_name || "—"}</span>
                        {tx.category && <><span>·</span><span>{tx.category}</span></>}
                      </p>
                    </div>
                  </div>
                  <div className={cn("font-mono font-bold shrink-0 ml-3", tx.type === "expense" ? "text-expense" : tx.type === "income" ? "text-emerald-600" : "text-neutral-500")}>
                    {tx.type === "income" && <span className="text-[9px] mr-0.5 opacity-50">▲</span>}
                    {tx.type === "expense" ? `-${formatCents(tx.amount).replace(/^\$/, "")}` : formatCents(tx.amount)}
                    {tx.type === "transfer" && <span className="text-[9px] ml-0.5">↔</span>}
                  </div>
                </div>
              );
            })}
          </Card>

          {isFinance && selected.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 lg:left-64 p-4 bg-white border-t border-neutral-200 flex items-center justify-center gap-3 z-40">
              <div className="flex items-center gap-3 max-w-2xl w-full">
                <p className="text-xs text-neutral-500 font-mono flex-1">{selected.size} selected</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs rounded-lg border-red-200 text-expense hover:bg-red-50"
                  onClick={() => rejectMutation.mutate(Array.from(selected))}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />Reject
                </Button>
                <Button
                  size="sm"
                  className="h-9 text-xs rounded-lg bg-expense hover:bg-expense/90 text-white border-none"
                  onClick={() => approveMutation.mutate(Array.from(selected))}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Approve
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
