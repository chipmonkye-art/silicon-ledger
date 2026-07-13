import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { reportsApi } from "@/lib/api";
import { formatCents } from "@/lib/utils";

function DonutChart({ segments, size = 200 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={size * 0.35} fill="none" stroke="#e5e5e5" strokeWidth={size * 0.12} />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" className="text-xs fill-neutral-400" fontSize="12">
          No data
        </text>
      </svg>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const sw = size * 0.12;
  const circ = 2 * Math.PI * r;

  const gap = circ * 0.005;
  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const dashLen = Math.max(pct * circ - gap, 0);
    const dashOffset = -offset;
    offset += pct * circ;
    return { ...seg, dashLen, dashOffset, pct };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e5e5" strokeWidth={sw} />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth={sw}
          strokeDasharray={`${arc.dashLen} ${circ - arc.dashLen}`}
          strokeDashoffset={arc.dashOffset}
          strokeLinecap="butt"
          className="transition-all duration-500"
        />
      ))}
    </svg>
  );
}

export default function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "category-breakdown", monthKey],
    queryFn: () => reportsApi.categoryBreakdown(monthKey),
  });

  const categories = data?.categories ?? [];
  const total = data?.total ?? 0;

  const chartSegments = useMemo(
    () => categories.map((c) => ({ value: c.amount, color: c.color })),
    [categories]
  );

  async function handleExport() {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/reports/export?month=${monthKey}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const html = await res.text();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Button variant="ghost" size="icon" className="text-neutral-500" onClick={handleExport}>
          <Download className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-2">
        <button onClick={prevMonth} className="text-neutral-500 p-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold text-sm">{monthLabel}</span>
        <button onClick={nextMonth} className="text-neutral-500 p-1">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-16">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-16">No expenses for this month</p>
      ) : (
        <>
          <div className="flex justify-center py-4">
            <div className="relative">
              <DonutChart segments={chartSegments} size={220} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Total</p>
                  <p className="text-lg font-mono font-bold">{formatCents(total)}</p>
                </div>
              </div>
            </div>
          </div>

          <Card className="border-neutral-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="text-left p-3 font-semibold">Category</th>
                  <th className="text-right p-3 font-semibold">Amount</th>
                  <th className="text-right p-3 font-semibold">Pct</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {categories.map((cat) => (
                  <tr key={cat.name} className="hover:bg-neutral-50">
                    <td className="p-3 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-sm font-medium">{cat.name}</span>
                    </td>
                    <td className="p-3 text-right font-mono font-medium">{formatCents(cat.amount)}</td>
                    <td className="p-3 text-right font-mono text-neutral-400">{cat.pct}%</td>
                  </tr>
                ))}
                <tr className="font-bold border-t-2 border-neutral-200">
                  <td className="p-3 text-sm">TOTAL</td>
                  <td className="p-3 text-right font-mono">{formatCents(total)}</td>
                  <td className="p-3 text-right font-mono">100%</td>
                </tr>
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
