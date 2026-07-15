import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog, fetchAuditSummary, fetchTransactionAudit } from "~/lib/api";
import { formatCents } from "~/lib/utils";
import { Card, CardHeader, CardTitle } from "~/components/ui/card";
import { useWorkspaceStore } from "~/lib/stores";
import { AlertCircle, Check, X, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { TransactionAudit } from "~/lib/types";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

const ACTION_COLORS: Record<string, string> = {
  INSERT: "text-blue-600 dark:text-blue-400",
  UPDATE: "text-amber-600 dark:text-amber-400",
  DELETE: "text-red-600 dark:text-red-400",
  REJECT: "text-red-700 dark:text-red-500",
};

function AuditPage() {
  const queryClient = useQueryClient();
  const role = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.workspaceId)?.role,
  );
  const isReadOnly = role === "auditor";

  const [actionFilter, setActionFilter] = useState<string>("");

  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.workspaceId)
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [txnAuditId, setTxnAuditId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", actionFilter],
    queryFn: () => fetchAuditLog({ action: actionFilter || undefined, limit: 100 }),
  });

  const { data: summary } = useQuery({
    queryKey: ["audit-summary"],
    queryFn: fetchAuditSummary,
  });

  const { data: txnAudit } = useQuery({
    queryKey: ["txn-audit", txnAuditId],
    queryFn: () => (txnAuditId ? fetchTransactionAudit(txnAuditId) : null),
    enabled: !!txnAuditId,
  });

  const entries: TransactionAudit[] = data?.entries ?? [];

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function viewTransactionAudit(txnId: string) {
    setTxnAuditId((prev) => (prev === txnId ? null : txnId));
    setExpandedId(null);
  }

  return (
    <div className="p-4 space-y-4 pb-28">
      <div className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-xl font-bold">Audit Trail</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {isReadOnly ? "Read-only view" : "Full change history"}
          </p>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["audit-log"] })}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <div className="space-y-1">
              {summary.actions?.map((a: { action: string; count: number }) => (
                <div key={a.action} className="flex items-center justify-between px-3 py-1">
                  <span className={`text-xs font-mono ${ACTION_COLORS[a.action] || ""}`}>{a.action}</span>
                  <span className="text-xs font-mono text-zinc-500">{a.count}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
            </CardHeader>
            <div className="px-3 pb-3">
              <p className="text-2xl font-mono font-semibold">{summary.distinct_users}</p>
              <p className="text-[10px] text-zinc-400">distinct users</p>
            </div>
          </Card>
        </div>
      )}

      {/* Action Filter */}
      <div className="flex gap-2 flex-wrap">
        {["", "INSERT", "UPDATE", "DELETE", "REJECT"].map((a) => (
          <button
            key={a}
            onClick={() => setActionFilter(a)}
            className={
              `px-3 py-1.5 rounded-lg text-xs font-medium border border-hairline transition-colors capitalize ` +
              (actionFilter === a ? "bg-expense text-white border-expense" : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800")
            }
          >
            {a || "All"}
          </button>
        ))}
      </div>

      {/* Audit Entries */}
      {isLoading ? (
        <p className="text-sm text-zinc-400 text-center py-8">Loading...</p>
      ) : (
        <div className="space-y-1">
          {entries.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-8">No audit entries found</p>
          )}
          {entries.map((entry) => (
            <div key={entry.id}>
              <div
                onClick={() => toggleExpand(entry.id)}
                className="flex items-center justify-between p-3 rounded-lg border border-hairline cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-semibold ${ACTION_COLORS[entry.action] || ""}`}>
                      {entry.action === "INSERT" ? <Check size={12} className="inline mr-1" /> :
                       entry.action === "REJECT" ? <X size={12} className="inline mr-1" /> :
                       <AlertCircle size={12} className="inline mr-1" />}
                      {entry.action}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      {entry.user_id?.slice(0, 8)}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); viewTransactionAudit(entry.transaction_id); }}
                    className="text-[9px] font-mono text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
                  >
                    #{entry.transaction_id?.slice(0, 8)}
                  </button>
                </div>
              </div>

              {/* Expanded diff */}
              {expandedId === entry.id && (
                <div className="mx-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-hairline text-[10px] font-mono space-y-1">
                  {entry.before && Object.keys(entry.before).length > 0 && (
                    <div>
                      <p className="text-red-500 font-semibold mb-1">Before:</p>
                      {Object.entries(entry.before).map(([k, v]) => (
                        <p key={k} className="text-zinc-500"><span className="text-zinc-400">{k}:</span> {JSON.stringify(v)}</p>
                      ))}
                    </div>
                  )}
                  {entry.after && Object.keys(entry.after).length > 0 && (
                    <div className="mt-1">
                      <p className="text-green-600 dark:text-green-400 font-semibold mb-1">After:</p>
                      {Object.entries(entry.after).map(([k, v]) => (
                        <p key={k} className="text-zinc-500"><span className="text-zinc-400">{k}:</span> {JSON.stringify(v)}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Full transaction audit history */}
              {txnAuditId === entry.transaction_id && txnAudit && (
                <div className="mx-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-hairline">
                  <p className="text-[10px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider">
                    Full History ({(txnAudit as { entries: TransactionAudit[] }).entries?.length || 0} entries)
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {(txnAudit as { entries: TransactionAudit[] }).entries?.map((ae: TransactionAudit) => (
                      <div key={ae.id} className="flex items-center justify-between text-[10px] font-mono">
                        <span className={ACTION_COLORS[ae.action]}>{ae.action}</span>
                        <span className="text-zinc-400">{new Date(ae.created_at).toLocaleString()}</span>
                        <span className="text-zinc-500">{ae.user_id?.slice(0, 8)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
