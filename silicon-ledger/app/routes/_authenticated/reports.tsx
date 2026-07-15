import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSummary, fetchCategoryBreakdown, fetchAccounts, fetchAllTransactionsForExport } from "~/lib/api";
import { formatCents, formatCentsCompact } from "~/lib/utils";
import { Card, CardHeader, CardTitle } from "~/components/ui/card";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { Button } from "~/components/ui/button";
import { generateBrandedPDF } from "~/lib/branded-pdf";
import { AgingWidget } from "~/components/AgingWidget";
import { useWorkspaceStore } from "~/lib/stores";
import { t } from "~/lib/i18n";
import { FileText, Download } from "lucide-react";
import type { MonthlySummary } from "~/lib/types";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const COLORS = [
  "#e74c3c", "#f39c12", "#2ecc71", "#3498db", "#9b59b6",
  "#1abc9c", "#e67e22", "#2980b9", "#c0392b", "#16a085",
  "#d35400", "#27ae60", "#8e44ad", "#2c3e50", "#f1c40f",
];

function ReportsPage() {
  const [chartKind, setChartKind] = useState<"expense" | "income">("expense");
  const [brandedPdfLoading, setBrandedPdfLoading] = useState(false);
  const [showAging, setShowAging] = useState(false);
  const workspace = useWorkspaceStore.getState().currentWorkspace();

  const { data: summary = [] } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
  });

  const { data: breakdown = [] } = useQuery({
    queryKey: ["breakdown"],
    queryFn: () => fetchCategoryBreakdown(),
  });

  const { data: accData } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const accounts = accData?.accounts ?? [];
  const accSummary = accData?.summary;

  const filteredBreakdown = breakdown.filter((b) => b.kind === chartKind).slice(0, 10);
  const totalForChart = filteredBreakdown.reduce((s, b) => s + b.total, 0);

  const assetAccounts = accounts.filter((a) => a.include_in_assets && a.type !== "credit_card");
  const liabilityAccounts = accounts.filter((a) => a.type === "credit_card" || !a.include_in_assets);
  const assetTotal = assetAccounts.reduce((s, a) => s + Math.max(0, (a.current_balance ?? 0)), 0);
  const liabilityTotal = Math.abs(liabilityAccounts.reduce((s, a) => s + Math.min(0, (a.current_balance ?? 0)), 0));

  const totalIncome = summary.reduce((s: number, m: MonthlySummary) => s + m.income, 0);
  const totalExpense = summary.reduce((s: number, m: MonthlySummary) => s + m.expense, 0);

  async function handleBrandedPDF() {
    setBrandedPdfLoading(true);
    try {
      const transactions = await fetchAllTransactionsForExport();
      const logoUrl = new URL("/logo.jpg", window.location.origin).href;
      await generateBrandedPDF(transactions, summary, workspace?.name, logoUrl);
    } finally {
      setBrandedPdfLoading(false);
    }
  }

  const pieData = filteredBreakdown.map((b, i) => ({
    name: b.category_name,
    value: b.total,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-xl font-bold">Reports</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Lifetime summary & analytics</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleBrandedPDF} disabled={brandedPdfLoading}>
          <Download size={14} />
        </Button>
      </div>

      {/* Lifetime Totals */}
      <Card>
        <CardHeader>
          <CardTitle>Lifetime Totals</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-zinc-400">Income</p>
            <p className="font-mono text-lg font-semibold text-income dark:text-white">{formatCents(totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Expense</p>
            <p className="font-mono text-lg font-semibold text-expense">{formatCents(totalExpense)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Net</p>
            <p className="font-mono text-lg font-semibold">{formatCents(totalIncome - totalExpense)}</p>
          </div>
        </div>
      </Card>

      {/* Category Breakdown Donut with Recharts Legend */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
            <div className="flex gap-1">
              {(["expense", "income"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setChartKind(v)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border border-hairline capitalize ${
                    chartKind === v ? "bg-expense text-white border-expense" : "bg-transparent"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </CardHeader>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`$${(value / 100).toFixed(2)}`, "Amount"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.87 0 0)", fontFamily: "JetBrains Mono", fontSize: 12 }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  formatter={(value: string, entry: any) => {
                    const pct = totalForChart > 0 ? ((entry.payload?.value ?? 0) / totalForChart * 100).toFixed(1) : "0";
                    return `${value} (${pct}%)`;
                  }}
                  wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono", paddingLeft: 16 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Asset Allocation */}
      {(assetTotal > 0 || liabilityTotal > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Asset Allocation</CardTitle>
          </CardHeader>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Assets", value: assetTotal },
                    { name: "Liabilities", value: liabilityTotal },
                  ].filter((d) => d.value > 0)}
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  <Cell fill="#2ecc71" />
                  <Cell fill="#e74c3c" />
                </Pie>
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  formatter={(value: string) => `${value}`}
                  wrapperStyle={{ fontSize: 12, fontFamily: "JetBrains Mono", paddingLeft: 16 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-sm px-2 pt-2 border-t border-hairline mt-2">
            <span className="font-medium">Net Worth</span>
            <span className="font-mono font-semibold">{formatCents(accSummary?.netWorth ?? 0)}</span>
          </div>
        </Card>
      )}

      {/* Monthly Trends */}
      {summary.length > 1 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Monthly Trends</CardTitle>
            </CardHeader>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.slice(-12)} barCategoryGap={4}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
                    tickFormatter={(v: string) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ fontSize: 12, fontFamily: "JetBrains Mono", borderRadius: 8, border: "1px solid oklch(0.87 0 0)", background: "#fafafa" }}
                    formatter={(value: number) => [formatCents(value), ""]}
                    labelFormatter={(month: string) => new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  />
                  <Bar dataKey="expense" fill="oklch(0.58 0.22 25)" radius={[3, 3, 0, 0]} name="Expense" />
                  <Bar dataKey="income" fill="oklch(0.15 0 0)" radius={[3, 3, 0, 0]} name="Income" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Net Worth Trend</CardTitle>
            </CardHeader>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.slice(-12)}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
                    tickFormatter={(v: string) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ fontSize: 12, fontFamily: "JetBrains Mono", borderRadius: 8, border: "1px solid oklch(0.87 0 0)", background: "#fafafa" }}
                    formatter={(value: number) => [formatCents(value), "Net Worth"]}
                    labelFormatter={(month: string) => new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  />
                  <Line type="monotone" dataKey="balance" stroke="oklch(0.58 0.22 25)" strokeWidth={2} dot={{ r: 3 }} name="Net Worth" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      {/* Aging & Performance Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Analytics</h2>
        <Button variant="ghost" size="sm" onClick={() => setShowAging(!showAging)}>
          {showAging ? "Hide" : "Show"} Aging
        </Button>
      </div>
      {showAging && <AgingWidget />}

      {/* Invoice Export */}
      <Card>
        <CardHeader>
          <CardTitle><FileText size={14} className="inline mr-1.5" />{t("report.branded_invoice")}</CardTitle>
        </CardHeader>
        <div className="px-3 pb-3 space-y-3">
          <Button variant="outline" size="sm" onClick={handleBrandedPDF} disabled={brandedPdfLoading} className="w-full">
            <Download size={14} className="mr-1" />
            {brandedPdfLoading ? "Generating..." : "Download Branded PDF"}
          </Button>
          <p className="text-xs text-zinc-400">
            Generates a single branded PDF with your company logo, auto timestamp, and "EDITED ON" footer.
          </p>
        </div>
      </Card>

      {/* Monthly Breakdown Table */}
      <div className="space-y-1">
        <h2 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1">
          Monthly Breakdown
        </h2>
        {summary.map((m: MonthlySummary) => (
          <div key={m.month} className="p-3 rounded-lg border border-hairline">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">
                {new Date(m.month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <span className="font-mono text-sm font-semibold">{formatCents(m.balance)}</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex">
              <div className="bg-expense h-full transition-all" style={{ width: `${m.income > 0 ? Math.min((m.expense / m.income) * 100, 100) : 0}%` }} />
              <div className="bg-income dark:bg-white h-full transition-all" style={{ width: `${totalIncome > 0 ? (m.income / totalIncome) * 100 : 0}%` }} />
            </div>
            <div className="flex justify-between text-xs text-zinc-400 mt-1 font-mono">
              <span>E {formatCents(m.expense)}</span>
              <span>I {formatCents(m.income)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
