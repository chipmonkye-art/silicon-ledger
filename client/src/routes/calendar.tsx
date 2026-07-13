import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { transactionsApi } from "@/lib/api";
import { useTransactionSheet } from "@/stores/transactionStore";
import { formatCents, cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, ShoppingCart, Wrench, Truck, FileText, Zap, Briefcase, TrendingUp, ArrowLeftRight } from "lucide-react";
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

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

type ViewMode = "ie" | "co";

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("ie");
  const { openSheet } = useTransactionSheet();

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", "calendar", monthKey],
    queryFn: () => transactionsApi.calendar(monthKey),
  });

  const transactions = data?.transactions ?? [];
  const carryover = data?.carryover ?? 0;
  const monthTotals = data?.totals ?? { income: 0, expense: 0, balance: 0 };

  const dailyTotals = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    for (const tx of transactions) {
      if (tx.is_staged) continue;
      const day = tx.date;
      if (!map[day]) map[day] = { income: 0, expense: 0 };
      if (tx.type === "income") map[day].income += tx.amount;
      if (tx.type === "expense") map[day].expense += tx.amount;
    }
    return map;
  }, [transactions]);

  const days = getMonthDays(year, month);

  const selectedTxns = useMemo(
    () => transactions.filter((tx) => tx.date === selectedDate),
    [transactions, selectedDate]
  );

  const selectedDayTotals = selectedDate
    ? dailyTotals[selectedDate] ?? { income: 0, expense: 0 }
    : { income: 0, expense: 0 };

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setSelectedDate(null);
  }

  function formatDate(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const monthLabel = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth} className="text-neutral-500">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold">{monthLabel}</h1>
        <Button variant="ghost" size="icon" onClick={nextMonth} className="text-neutral-500">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center text-xs text-neutral-400 py-16">Loading calendar…</div>
      ) : (<>
      <div className="flex bg-neutral-100 rounded-xl p-0.5 w-fit mx-auto">
        <button
          onClick={() => setViewMode("ie")}
          className={cn("px-4 py-1.5 text-xs font-medium rounded-lg transition-colors", viewMode === "ie" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500")}
        >
          I / E / B
        </button>
        <button
          onClick={() => setViewMode("co")}
          className={cn("px-4 py-1.5 text-xs font-medium rounded-lg transition-colors", viewMode === "co" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500")}
        >
          Carry / Balance
        </button>
      </div>

      <Card className="border-neutral-100 overflow-hidden">
        <div className="grid grid-cols-7 bg-neutral-50 border-b border-neutral-100">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold text-neutral-400 uppercase tracking-wider py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="aspect-square" />;
            const dateStr = formatDate(year, month, day);
            const totals = dailyTotals[dateStr];
            const net = totals ? totals.income - totals.expense : 0;
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === now.toISOString().slice(0, 10);

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={cn(
                  "aspect-square flex flex-col items-center justify-center p-0.5 transition-colors relative",
                  isSelected ? "bg-expense/10" : "hover:bg-neutral-50"
                )}
              >
                <span className={cn(
                  "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                  isSelected ? "bg-expense text-white" : isToday ? "bg-neutral-200 text-neutral-900" : "text-neutral-700"
                )}>
                  {day}
                </span>
                {net !== 0 && (
                  <span className={cn(
                    "text-[9px] font-mono font-bold leading-tight mt-0.5",
                    net > 0 ? "text-neutral-700" : "text-expense"
                  )}>
                    {net > 0 ? "+" : "-"}${(Math.abs(net) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="border-neutral-100 bg-neutral-50/50">
        <div className="p-3 space-y-1.5">
          {viewMode === "ie" ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold">Income</span>
                <span className="text-sm font-mono font-bold">{formatCents(monthTotals.income)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold">Expense</span>
                <span className="text-sm font-mono font-bold text-expense">-{formatCents(monthTotals.expense).replace(/^\$/, "")}</span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-neutral-200">
                <span className="text-[10px] uppercase tracking-widest text-neutral-600 font-bold">Balance</span>
                <span className={cn("text-sm font-mono font-bold", monthTotals.balance >= 0 ? "text-emerald-600" : "text-expense")}>
                  {formatCents(monthTotals.balance)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold">Carry-over</span>
                <span className="text-sm font-mono font-bold">{formatCents(carryover)}</span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-neutral-200">
                <span className="text-[10px] uppercase tracking-widest text-neutral-600 font-bold">Running Balance</span>
                <span className={cn("text-sm font-mono font-bold", (carryover + monthTotals.balance) >= 0 ? "text-emerald-600" : "text-expense")}>
                  {formatCents(carryover + monthTotals.balance)}
                </span>
              </div>
            </>
          )}
        </div>
      </Card>

      {selectedDate && (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </h3>
            <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400">
              {selectedDayTotals.income > 0 && <span className="text-neutral-600">▲{formatCents(selectedDayTotals.income)}</span>}
              {selectedDayTotals.expense > 0 && <span className="text-expense">-{formatCents(selectedDayTotals.expense).replace(/^\$/, "")}</span>}
            </div>
          </div>

          {selectedTxns.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-6">No transactions for this day</p>
          ) : (
            <Card className="divide-y divide-neutral-50 rounded-2xl overflow-hidden border-neutral-100">
              {selectedTxns.map((tx: Transaction) => {
                const Icon = getTxIcon(tx.category);
                return (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-white hover:bg-neutral-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-neutral-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{tx.description}</p>
                        <p className="text-[10px] text-neutral-400 font-mono uppercase tracking-tighter">
                          {tx.type === "transfer"
                            ? `${tx.account_name || "?"} ➔ ${tx.to_account_name || "?"}`
                            : tx.account_name || "—"}
                        </p>
                      </div>
                    </div>
                    <div className={cn("font-mono font-bold shrink-0 ml-3", tx.type === "expense" ? "text-expense" : "text-neutral-900")}>
                      {tx.type === "income" && <span className="text-[9px] mr-0.5 opacity-50">▲</span>}
                      {tx.type === "expense" ? `-${formatCents(tx.amount).replace(/^\$/, "")}` : formatCents(tx.amount)}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => openSheet()}
            className="w-full text-expense text-xs mt-2"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />Add Transaction
          </Button>
        </div>
      )}

      </>)}
    </div>
  );
}
