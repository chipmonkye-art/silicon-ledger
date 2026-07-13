import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui/card";
import { Plus, Search, ShoppingCart, Wrench, Truck, FileText, Zap, Briefcase, TrendingUp, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accountsApi, transactionsApi } from "@/lib/api";
import { useTransactionSheet } from "@/stores/transactionStore";
import { formatCents, cn } from "@/lib/utils";
import type { Transaction } from "@/types";

const categoryIcons: Record<string, React.ElementType> = {
  materials: Wrench,
  labor: Briefcase,
  permits: FileText,
  utilities: Zap,
  transport: Truck,
  food: ShoppingCart,
  "client payment": TrendingUp,
  investment: TrendingUp,
  refund: ArrowLeftRight,
  transfer: ArrowLeftRight,
};

function getTxIcon(category?: string) {
  if (!category) return ShoppingCart;
  const key = category.toLowerCase();
  for (const [k, Icon] of Object.entries(categoryIcons)) {
    if (key.includes(k)) return Icon;
  }
  return ShoppingCart;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const { openSheet } = useTransactionSheet();

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
  });

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["transactions", "summary"],
    queryFn: transactionsApi.summary,
  });

  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () => transactionsApi.list({ limit: "5", is_staged: "false" }),
  });

  const netWorth = accountsData?.summary?.netWorth ?? 0;
  const month = summaryData?.month ?? { income: 0, expense: 0, balance: 0 };
  const recent = (recentData?.transactions ?? []).slice(0, 5);

  return (
    <div className="p-4 space-y-6 max-w-md mx-auto pb-24">
      <Card className="border-none shadow-none bg-neutral-50/50">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg border border-neutral-100 flex items-center justify-center">
              <Search className="w-4 h-4 text-neutral-400" />
            </div>
            <span className="text-sm font-medium text-neutral-500">Net Worth</span>
          </div>
          <div className={cn("text-2xl font-bold font-mono", netWorth >= 0 ? "text-emerald-600" : "text-expense")}>
            {accountsLoading ? "…" : formatCents(netWorth)}
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 border-neutral-100 shadow-none bg-neutral-50/50">
          <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold mb-1">
            Month Income
          </p>
          <div className="flex items-baseline gap-1 justify-end">
            <span className="text-[10px] text-neutral-400">▲</span>
            <span className="text-xl font-mono font-bold text-neutral-900">
              {summaryLoading ? "…" : formatCents(month.income)}
            </span>
          </div>
        </Card>
        <Card className="p-4 border-neutral-100 shadow-none bg-neutral-50/50">
          <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold mb-1">
            Month Expense
          </p>
          <div className="text-xl font-mono font-bold text-expense text-right">
            {summaryLoading ? "…" : `-${formatCents(month.expense).replace(/^\$/, "")}`}
          </div>
        </Card>
      </div>

      <div className="space-y-1">
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider px-1 pb-1">
          Recent Transactions
        </h3>
        <Card className="divide-y divide-neutral-50 rounded-2xl overflow-hidden border-neutral-100">
          {recentLoading ? (
            <div className="p-8 text-center text-xs text-neutral-400">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400">No transactions yet</div>
          ) : (
            recent.map((tx: Transaction) => {
              const Icon = getTxIcon(tx.category);
              return (
                <div key={tx.id} className="flex items-center justify-between p-4 bg-white active:bg-neutral-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-neutral-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{tx.description}</p>
                      <p className="text-[10px] text-neutral-400">{formatTime(tx.date || tx.created_at)}</p>
                    </div>
                  </div>
                  <div className={cn("font-mono font-bold shrink-0 ml-3", tx.type === "expense" ? "text-expense" : "text-neutral-900")}>
                    {tx.type === "income" && <span className="text-[10px] mr-0.5 opacity-50">▲</span>}
                    {tx.type === "expense" ? `-${formatCents(tx.amount).replace(/^\$/, "")}` : formatCents(tx.amount)}
                    {tx.type === "transfer" && <span className="text-[10px] ml-0.5 text-neutral-400">↔</span>}
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </div>

      <Button
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-expense hover:bg-expense/90 shadow-xl z-40"
        size="icon"
        onClick={() => openSheet()}
      >
        <Plus className="w-8 h-8 text-white" />
      </Button>
    </div>
  );
}
