import { useQuery } from "@tanstack/react-query";
import { fetchAging, fetchPaymentPerformance, fetchCreditUtilization } from "~/lib/api";
import { formatCents, formatCentsCompact } from "~/lib/utils";
import { Clock, AlertTriangle, CreditCard } from "lucide-react";
import { Card, CardHeader, CardTitle } from "~/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function AgingWidget() {
  const { data: agingData } = useQuery<{ aging: Array<{ bucket: string; count: number; total_remaining: number }> }>({
    queryKey: ["aging"],
    queryFn: fetchAging,
  });

  const { data: perf } = useQuery<{ approved_count: number; rejected_count: number; avg_approval_hours: number; overdue_count: number }>({
    queryKey: ["payment-performance"],
    queryFn: fetchPaymentPerformance,
  });

  const { data: creditData } = useQuery<{ accounts: Array<{ name: string; usage_pct: number; credit_remaining: number; is_over_limit: boolean; current_balance: number; credit_limit: number }> }>({
    queryKey: ["credit-utilization"],
    queryFn: fetchCreditUtilization,
  });

  const aging = agingData?.aging ?? [];

  const bucketOrder = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days"];
  const sortedAging = [...aging].sort(
    (a, b) => bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket)
  );

  return (
    <div className="space-y-3">
      {sortedAging.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Clock size={14} className="inline mr-1.5" />
              Aging Analysis
            </CardTitle>
          </CardHeader>
          <div className="space-y-1 px-3 pb-3">
            {sortedAging.map((a) => (
              <div key={a.bucket} className="flex items-center justify-between py-1.5 border-b border-hairline last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium w-20">{a.bucket}</span>
                  <span className="text-[10px] font-mono text-zinc-400">{a.count} items</span>
                </div>
                <span className="font-mono text-xs font-semibold">
                  {a.total_remaining > 0 ? formatCentsCompact(a.total_remaining) : "\u2014"}
                </span>
              </div>
            ))}
          </div>
          {sortedAging.length > 1 && (
            <div className="h-24 px-3 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedAging.map((a) => ({
                  bucket: a.bucket,
                  amount: a.total_remaining,
                }))} barCategoryGap={4}>
                  <XAxis dataKey="bucket" tick={{ fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: number) => [formatCents(value), "Due"]}
                    contentStyle={{ fontSize: 11, fontFamily: "JetBrains Mono", borderRadius: 8, border: "1px solid oklch(0.87 0 0)" }}
                  />
                  <Bar dataKey="amount" fill="oklch(0.58 0.22 25)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      )}

      {perf && perf.approved_count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <AlertTriangle size={14} className="inline mr-1.5" />
              Payment Performance
            </CardTitle>
          </CardHeader>
          <div className="px-3 pb-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xl font-mono font-semibold">{perf.approved_count}</p>
                <p className="text-[10px] text-zinc-400">Approved</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-mono font-semibold text-expense">{perf.rejected_count}</p>
                <p className="text-[10px] text-zinc-400">Rejected</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-mono font-semibold">{perf.avg_approval_hours}h</p>
                <p className="text-[10px] text-zinc-400">Avg approval</p>
              </div>
            </div>
            {perf.overdue_count > 0 && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle size={12} />
                {perf.overdue_count} overdue payments
              </div>
            )}
          </div>
        </Card>
      )}

      {creditData?.accounts && creditData.accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <CreditCard size={14} className="inline mr-1.5" />
              Credit Utilization
            </CardTitle>
          </CardHeader>
          <div className="space-y-2 px-3 pb-3">
            {creditData.accounts.map((a) => (
              <div key={a.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{a.name}</span>
                  <span className="font-mono text-zinc-500">
                    {a.usage_pct}% used
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${a.is_over_limit ? "bg-expense" : a.usage_pct > 80 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min(a.usage_pct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                  <span>Balance: {formatCentsCompact(Math.abs(a.current_balance))}</span>
                  <span>Limit: {formatCentsCompact(a.credit_limit)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {sortedAging.length === 0 && (!perf || perf.approved_count === 0) && (
        <div className="text-center py-6">
          <p className="text-sm text-zinc-400">No aging or payment data yet</p>
          <p className="text-xs text-zinc-500 mt-1">Create transactions with due dates and payment tracking to see analytics</p>
        </div>
      )}
    </div>
  );
}
