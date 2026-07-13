import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ShoppingCart, Wrench, Truck, FileText, Zap, Briefcase, TrendingUp, ArrowLeftRight } from "lucide-react";
import { transactionsApi } from "@/lib/api";
import { useTransactionSheet } from "@/stores/transactionStore";
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

type Filter = "all" | "income" | "expense" | "transfer";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "income", label: "Income" },
  { id: "expense", label: "Expense" },
  { id: "transfer", label: "Transfer" },
];

type StagingFilter = "all" | "cleared" | "staged";

export default function TransactionsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [stagingFilter, setStagingFilter] = useState<StagingFilter>("all");
  const { openSheet } = useTransactionSheet();

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", filter, stagingFilter],
    queryFn: () => transactionsApi.list({
      ...(filter !== "all" ? { type: filter } : {}),
      ...(stagingFilter !== "all" ? { is_staged: String(stagingFilter === "staged") } : {}),
      limit: "100",
    }),
  });

  const transactions = data?.transactions ?? [];

  const cleared = transactions.filter((t) => !t.is_staged);
  const outstanding = transactions.filter((t) => t.is_staged);

  const clearedTotals = cleared.reduce(
    (acc, t) => {
      if (t.type === "income") acc.income += t.amount;
      if (t.type === "expense") acc.expense += t.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );

  const outstandingTotals = outstanding.reduce(
    (acc, t) => {
      if (t.type === "income") acc.income += t.amount;
      if (t.type === "expense") acc.expense += t.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );

  const totals = stagingFilter === "staged" ? outstandingTotals : stagingFilter === "cleared" ? clearedTotals : {
    income: clearedTotals.income + outstandingTotals.income,
    expense: clearedTotals.expense + outstandingTotals.expense,
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <Button size="sm" className="rounded-full" onClick={() => openSheet()}>
          <Plus className="mr-1 h-4 w-4" />Add
        </Button>
      </div>

      <Card className="border-neutral-100 bg-neutral-50/50">
        <CardContent className="pt-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">Income</span>
            <span className="font-mono font-bold text-sm">{formatCents(totals.income)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">Expense</span>
            <span className="font-mono font-bold text-expense text-sm">-{formatCents(totals.expense).replace(/^\$/, "")}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
            <span className="text-xs uppercase tracking-wider text-neutral-600 font-bold">Net</span>
            <span className={cn("font-mono font-bold text-sm", totals.income - totals.expense >= 0 ? "text-emerald-600" : "text-expense")}>
              {formatCents(totals.income - totals.expense)}
            </span>
          </div>
          {stagingFilter === "all" && (
            <div className="pt-2 border-t border-neutral-200 space-y-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-neutral-400">Cleared</span>
                <span className="font-mono text-neutral-600">{formatCents(clearedTotals.income - clearedTotals.expense)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-neutral-400">Outstanding</span>
                <span className="font-mono text-amber-600">{formatCents(outstandingTotals.income - outstandingTotals.expense)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(["all", "cleared", "staged"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStagingFilter(s)}
            className={cn(
              "px-3 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-lg whitespace-nowrap transition-colors",
              stagingFilter === s ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
            )}
          >
            {s === "staged" && <>Outstanding {outstanding.length > 0 && <span className="ml-1 text-[9px] opacity-70">({outstanding.length})</span>}</>}
            {s === "cleared" && "Cleared"}
            {s === "all" && "All"}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
              filter === f.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Loading transactions…</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">No transactions yet.</p>
      ) : (
        <Card className="border-neutral-100 overflow-hidden divide-y divide-neutral-50">
          {transactions.map((tx: Transaction) => {
            const Icon = getTxIcon(tx.category);
            return (
              <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-neutral-50/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-neutral-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {tx.description}
                      {tx.receipt_url && (
                        <a href={tx.receipt_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0">
                          <img src={tx.receipt_url} alt="" className="w-5 h-5 rounded object-cover border border-neutral-200 hover:border-expense transition-colors" />
                        </a>
                      )}
                    </p>
                    <p className="text-[10px] text-neutral-400 font-mono uppercase tracking-tighter flex items-center gap-1">
                      <span>{tx.date}</span>
                      {tx.is_staged && <Badge variant="warning" className="text-[9px] px-1 py-0">Staged</Badge>}
                      <span>· {tx.account_name || "—"}</span>
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
      )}
    </div>
  );
}
