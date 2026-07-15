import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCalendarMonth, fetchSummary, rejectTransaction } from "~/lib/api";
import { cn, monthString, formatCents, formatCentsCompact } from "~/lib/utils";
import { useSheetStore, useSettingsStore } from "~/lib/stores";
import { ChevronLeft, ChevronRight, Copy, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_PRESS_MS = 500;
const SWIPE_THRESHOLD = 60;

function CalendarPage() {
  const queryClient = useQueryClient();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const swipeStartX = useRef(0);
  const swipeOpenId = useRef<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState(() => monthString());
  const [viewMode, setViewMode] = useState<"cashflow" | "wealth">("cashflow");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { open } = useSheetStore();
  const userFirstDay = useSettingsStore((s) => s.firstDayOfWeek);

  const { year, month, daysInMonth, firstDayOffset, orderedDays } = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    const actualFirstDay = new Date(y!, m! - 1, 1).getDay();
    const offset = (actualFirstDay - userFirstDay + 7) % 7;
    const ordered = [...DAYS.slice(userFirstDay), ...DAYS.slice(0, userFirstDay)];
    return {
      year: y!,
      month: m! - 1,
      daysInMonth: new Date(y!, m!, 0).getDate(),
      firstDayOffset: offset,
      orderedDays: ordered,
    };
  }, [currentMonth, userFirstDay]);

  const { data: dayData = {} } = useQuery({
    queryKey: ["calendar", currentMonth],
    queryFn: () => fetchCalendarMonth(currentMonth),
  });

  const { data: summary = [] } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
  });

  const carryOver = useMemo(() => {
    const idx = summary.findIndex((s) => s.month === currentMonth);
    return idx > 0 ? summary[idx - 1]!.balance : 0;
  }, [summary, currentMonth]);

  const days = useMemo(() => {
    const result: { date: string; day: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ date: `${currentMonth}-${String(d).padStart(2, "0")}`, day: d });
    }
    return result;
  }, [daysInMonth, currentMonth]);

  const monthIncome = useMemo(() => Object.values(dayData).reduce((s, d) => s + d.income, 0), [dayData]);
  const monthExpense = useMemo(() => Object.values(dayData).reduce((s, d) => s + d.expense, 0), [dayData]);
  const monthBalance = monthIncome - monthExpense;

  const runningBalances = useMemo(() => {
    const map: Record<string, number> = {};
    let running = carryOver;
    for (const d of days) {
      const info = dayData[d.date];
      const dayIncome = info?.income ?? 0;
      const dayExpense = info?.expense ?? 0;
      running += dayIncome - dayExpense;
      map[d.date] = running;
    }
    return map;
  }, [days, dayData, carryOver]);

  const prevMonth = () => {
    const d = new Date(year, month, 1);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(monthString(d));
    setSelectedDay(null);
  };

  const nextMonth = () => {
    const d = new Date(year, month, 1);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(monthString(d));
    setSelectedDay(null);
  };

  const selectedTxns = selectedDay ? dayData[selectedDay]?.transactions ?? [] : [];
  const selectedRunning = selectedDay ? runningBalances[selectedDay] : 0;

  async function handleDelete(id: string) {
    await rejectTransaction(id);
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  function handleCopy(date: string, txn: { description: string; amount_minor: number; txn_type: string; account_id: string; category_id: string | null; to_account_id: string | null; currency: string; note: string }) {
    open(date);
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={prevMonth} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">
          {new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h1>
        <button onClick={nextMonth} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Month Summary */}
      <div className="flex items-center justify-around text-center py-2 border border-hairline rounded-lg">
        <div>
          <p className="text-[10px] text-zinc-400 uppercase">Carry-over</p>
          <p className={cn("font-mono text-xs", carryOver >= 0 ? "text-income dark:text-white" : "text-expense")}>
            {formatCentsCompact(carryOver)}
          </p>
        </div>
        <div className="w-px h-8 bg-hairline" />
        <div>
          <p className="text-[10px] text-zinc-400 uppercase">Income</p>
          <p className="font-mono text-sm text-income dark:text-white">↑{formatCentsCompact(monthIncome)}</p>
        </div>
        <div className="w-px h-8 bg-hairline" />
        <div>
          <p className="text-[10px] text-zinc-400 uppercase">Expense</p>
          <p className="font-mono text-sm text-expense">{formatCentsCompact(monthExpense)}</p>
        </div>
        <div className="w-px h-8 bg-hairline" />
        <div>
          <p className="text-[10px] text-zinc-400 uppercase">Balance</p>
          <p className={cn("font-mono text-sm", monthBalance >= 0 ? "text-income dark:text-white" : "text-expense")}>
            {formatCentsCompact(monthBalance)}
          </p>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2">
        {([
          { value: "cashflow", label: "Cash Flow" },
          { value: "wealth", label: "Daily Wealth" },
        ] as const).map((v) => (
          <button
            key={v.value}
            onClick={() => setViewMode(v.value)}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-xs font-medium border border-hairline transition-colors",
              viewMode === v.value
                ? "bg-expense text-white border-expense"
                : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-hairline rounded-lg overflow-hidden">
        {orderedDays.map((d) => (
          <div key={d} className="bg-white dark:bg-zinc-900 p-2 text-center text-[10px] font-medium text-zinc-400">
            {d}
          </div>
        ))}
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-white dark:bg-zinc-900 p-2 min-h-[64px]" />
        ))}
        {days.map((d) => {
          const info = dayData[d.date];
          const isSelected = selectedDay === d.date;
          const dayIncome = info?.income ?? 0;
          const dayExpense = info?.expense ?? 0;
          const hasData = dayIncome > 0 || dayExpense > 0;
          const running = runningBalances[d.date] ?? 0;
          const startOfDay = running - (dayIncome - dayExpense);

          function onPointerDown() {
            longPressFired.current = false;
            longPressTimer.current = setTimeout(() => {
              longPressFired.current = true;
              open(d.date);
            }, LONG_PRESS_MS);
          }
          function onPointerUp() {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
          }

          return (
            <button
              key={d.date}
              onClick={() => {
                if (!longPressFired.current) setSelectedDay(isSelected ? null : d.date);
              }}
              onMouseDown={onPointerDown}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerUp}
              onTouchStart={onPointerDown}
              onTouchEnd={onPointerUp}
              className={cn(
                "bg-white dark:bg-zinc-900 p-1 min-h-[64px] text-left border border-hairline/50 dark:border-zinc-700/50 transition-colors",
                "hover:bg-zinc-50 dark:hover:bg-zinc-800 relative",
                isSelected && "ring-2 ring-expense ring-inset",
              )}
            >
              <span className="text-[10px] font-mono text-zinc-500">{d.day}</span>
              {viewMode === "cashflow" && hasData && (
                <div className="mt-0.5 space-y-0.5">
                  {dayIncome > 0 && (
                    <p className="text-[9px] font-mono leading-tight text-income dark:text-white">↑{formatCentsCompact(dayIncome)}</p>
                  )}
                  {dayExpense > 0 && (
                    <p className="text-[9px] font-mono leading-tight text-expense">{formatCentsCompact(dayExpense)}</p>
                  )}
                </div>
              )}
              {viewMode === "wealth" && (
                <div className="mt-0.5 space-y-0.5">
                  <p className={cn("text-[8px] font-mono leading-tight", startOfDay >= 0 ? "text-zinc-500" : "text-expense")}>
                    {formatCentsCompact(startOfDay)}
                  </p>
                  <p className={cn("text-[9px] font-mono leading-tight", running >= 0 ? "text-income dark:text-white" : "text-expense")}>
                    {formatCentsCompact(running)}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Day Detail */}
      {selectedDay && (
        <div className="space-y-2 border border-hairline rounded-lg p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-zinc-500 uppercase">
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h3>
            <p className={cn("font-mono text-xs", selectedRunning >= 0 ? "text-income dark:text-white" : "text-expense")}>
              Running: {formatCents(selectedRunning)}
            </p>
          </div>
          <p className="text-[10px] text-zinc-400">
            Carry-over: {formatCents(carryOver)} → End of day: {formatCents(selectedRunning)}
          </p>
          {selectedTxns.length === 0 ? (
            <p className="text-sm text-zinc-400">No transactions this day</p>
          ) : (
            selectedTxns.map((t) => (
              <SwipeableRow
                key={t.id}
                onDelete={() => handleDelete(t.id)}
                onCopy={() => handleCopy(selectedDay, t)}
              >
                <div className="flex items-center justify-between py-1.5 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{t.description || "No description"}</p>
                    <p className="text-[10px] text-zinc-400">
                      {t.account?.name}{t.category ? ` · ${t.category.name}` : ""}
                    </p>
                  </div>
                  <p className={cn(
                    "font-mono text-sm font-semibold ml-2",
                    t.txn_type === "transfer" ? "text-zinc-500" : t.txn_type === "income" ? "text-income dark:text-white" : "text-expense",
                  )}>
                    {t.txn_type === "transfer" ? "" : t.txn_type === "income" ? "↑" : "-"}
                    {formatCents(t.amount_minor)}
                  </p>
                </div>
              </SwipeableRow>
            ))
          )}
          <button
            onClick={() => open(selectedDay)}
            className="w-full text-xs text-center py-2 rounded-lg border border-hairline text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 mt-1"
          >
            + Add on this day
          </button>
        </div>
      )}
    </div>
  );
}

function SwipeableRow({
  children,
  onDelete,
  onCopy,
}: {
  children: ReactNode;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const [swiped, setSwiped] = useState(false);
  const touchStartX = useRef(0);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]!.clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = touchStartX.current - e.changedTouches[0]!.clientX;
    if (dx > SWIPE_THRESHOLD) setSwiped(true);
    else if (dx < -SWIPE_THRESHOLD) setSwiped(false);
  }

  return (
    <div className="relative overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1">
        <button
          onClick={onCopy}
          className="p-2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded bg-red-100 dark:bg-red-900 text-expense"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div
        className="relative transition-transform duration-200 bg-white dark:bg-zinc-900"
        style={{ transform: swiped ? "translateX(-72px)" : "translateX(0)" }}
      >
        {children}
      </div>
    </div>
  );
}
