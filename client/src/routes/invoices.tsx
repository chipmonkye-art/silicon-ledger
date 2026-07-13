import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, FileText, CheckCircle2, AlertCircle, Clock, Ban } from "lucide-react";
import { invoicesApi } from "@/lib/api";
import { formatCents, cn } from "@/lib/utils";
import type { Invoice } from "@/types";

const statusConfig: Record<string, { label: string; variant: "warning" | "success" | "default" | "destructive"; icon: React.ElementType }> = {
  pending: { label: "Pending", variant: "warning", icon: Clock },
  approved: { label: "Approved", variant: "success", icon: CheckCircle2 },
  paid: { label: "Paid", variant: "default", icon: AlertCircle },
  overdue: { label: "Overdue", variant: "destructive", icon: Ban },
};

const filters = ["all", "pending", "approved", "paid", "overdue"] as const;

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", filter],
    queryFn: () => invoicesApi.list(filter !== "all" ? { status: filter } : {}),
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.pay(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <Button size="sm" className="rounded-full">
          <Plus className="mr-1 h-4 w-4" />New
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border",
              filter === f ? "bg-expense text-white border-expense" : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">No invoices yet.</p>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv: Invoice) => {
            const status = statusConfig[inv.status];
            const StatusIcon = status.icon;
            const overdue = inv.status === "overdue";
            return (
              <Card key={inv.id} className={cn("border-neutral-100", overdue && "border-expense/30")}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                        <p className="text-sm font-semibold truncate">{inv.invoice_number}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-neutral-500">{inv.vendor_name || "—"}</span>
                        <span className="text-[10px] text-neutral-300">·</span>
                        <span className="text-xs text-neutral-500">{inv.project_name || "—"}</span>
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">Due {inv.due_date}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="font-mono text-sm font-semibold text-expense">{formatCents(inv.amount)}</div>
                      <Badge variant={status.variant} className="flex items-center gap-1 text-[10px] px-2 py-0.5">
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </Badge>
                      {inv.status === "approved" && (
                        <Button
                          size="sm"
                          className="h-6 text-[10px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white border-none mt-1"
                          onClick={() => payMutation.mutate(inv.id)}
                          disabled={payMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />Mark Paid
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
