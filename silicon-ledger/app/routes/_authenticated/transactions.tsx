import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { fetchTransactions, approveTransactionFull as approveTransaction, rejectWithNote, resubmitTransaction, fetchAllTransactionsForExport, downloadCSV, bulkApproveTransactions, bulkRejectTransactions } from "~/lib/api";
import { formatCents, cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { useWorkspaceStore } from "~/lib/stores";
import { CompactList } from "~/components/CompactList";
import { Check, X, Undo2, Send } from "lucide-react";
import type { Transaction } from "~/lib/types";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

type Filter = "all" | "staged" | "cleared" | "rejected";

const COLUMNS = [
  { key: "txn", label: "Transaction", grow: true },
  { key: "amount", label: "Amount", align: "right" as const, width: "85px" },
];

function TransactionsPage() {
  const queryClient = useQueryClient();
  const role = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.workspaceId)?.role);
  const isManager = role === "owner" || role === "manager";

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [resubmitId, setResubmitId] = useState<string | null>(null);
  const [resubmitForm, setResubmitForm] = useState({ amount_minor: "", description: "", note: "" });

  const { data: fetchRes } = useQuery({
    queryKey: ["transactions", filter],
    queryFn: () => {
      if (filter === "rejected") return fetchTransactions({ is_rejected: true, limit: 100 });
      return fetchTransactions({
        is_staged: filter === "staged" ? true : filter === "cleared" ? false : undefined,
        limit: 100,
      });
    },
  });

  const transactions = fetchRes?.transactions ?? [];
  const stagedCount = transactions.filter((t) => t.is_staged && !t.is_rejected).length;
  const rejectedCount = transactions.filter((t) => t.is_rejected).length;

  async function handleExport() {
    const all = await fetchAllTransactionsForExport();
    downloadCSV(all);
  }

  const filtered = search
    ? transactions.filter((t) => t.description?.toLowerCase().includes(search.toLowerCase()))
    : transactions;

  function toggleSelection(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  function clearSelection() { setSelectedIds([]); }

  const approveMutation = useMutation({
    mutationFn: async (id: string) => { setBusy(id); await approveTransaction(id); },
    onSettled: () => { setBusy(null); queryClient.invalidateQueries({ queryKey: ["transactions"] }); queryClient.invalidateQueries({ queryKey: ["accounts"] }); queryClient.invalidateQueries({ queryKey: ["summary"] }); },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => { setBusy(id); await rejectWithNote(id, note); },
    onSettled: () => { setBusy(null); setRejectingId(null); setRejectionNote(""); queryClient.invalidateQueries({ queryKey: ["transactions"] }); },
  });

  const resubmitMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => { setBusy(id); await resubmitTransaction(id, updates); },
    onSettled: () => { setBusy(null); setResubmitId(null); setResubmitForm({ amount_minor: "", description: "", note: "" }); queryClient.invalidateQueries({ queryKey: ["transactions"] }); },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: bulkApproveTransactions,
    onSuccess: () => { clearSelection(); queryClient.invalidateQueries({ queryKey: ["transactions", "accounts", "summary"] }); },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: bulkRejectTransactions,
    onSuccess: () => { clearSelection(); queryClient.invalidateQueries({ queryKey: ["transactions"] }); },
  });

  function openRejectSheet(id: string) { setRejectingId(id); setRejectionNote(""); }
  function confirmReject() { if (rejectingId) rejectMutation.mutate({ id: rejectingId, note: rejectionNote || "Sent back for correction" }); }

  function openResubmit(t: Transaction) {
    setResubmitId(t.id);
    setResubmitForm({ amount_minor: String(t.amount_minor), description: t.description || "", note: t.note || "" });
  }
  function confirmResubmit() {
    if (!resubmitId) return;
    const updates: Record<string, unknown> = {};
    const parsed = parseInt(resubmitForm.amount_minor, 10);
    if (!isNaN(parsed) && parsed > 0) updates.amount_minor = parsed;
    if (resubmitForm.description.trim()) updates.description = resubmitForm.description.trim();
    if (resubmitForm.note.trim()) updates.note = resubmitForm.note.trim();
    resubmitMutation.mutate({ id: resubmitId, updates });
  }

  const tabs = [
    { key: "all", label: "All", active: filter === "all", onClick: () => setFilter("all") },
    { key: "staged", label: `Staged${stagedCount > 0 ? ` (${stagedCount})` : ""}`, active: filter === "staged", onClick: () => setFilter("staged") },
    { key: "cleared", label: "Cleared", active: filter === "cleared", onClick: () => setFilter("cleared") },
    { key: "rejected", label: `Needs Correction${rejectedCount > 0 ? ` (${rejectedCount})` : ""}`, active: filter === "rejected", onClick: () => setFilter("rejected") },
  ];

  const rows = filtered.map((t) => ({
    id: t.id,
    cells: {
      txn: (
        <div className="flex items-start gap-2">
          {t.is_staged && !t.is_rejected && isManager && (
            <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelection(t.id)} className="mt-0.5 accent-indigo-600 rounded border-zinc-300" />
          )}
          <div className="flex-1 min-w-0">
            <div className={cn("text-xs truncate", t.is_rejected ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300")}>
              {t.description || "No description"}
            </div>
            <div className="text-[10px] text-zinc-400">
              {new Date(t.occurred_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {t.account && ` · ${t.account.name}`}
              {t.category && ` · ${t.category.name}`}
              {t.is_rejected && t.rejection_note && (
                <span className="ml-1 text-red-400">— {t.rejection_note}</span>
              )}
            </div>
          </div>
        </div>
      ),
      amount: (
        <div className="flex items-center gap-1.5 justify-end">
          <span className={cn("font-mono text-xs font-semibold", t.txn_type === "income" ? "text-zinc-800 dark:text-zinc-200" : "text-red-500")}>
            {t.txn_type === "income" ? "+" : t.txn_type === "expense" ? "-" : ""}{formatCents(t.amount_minor)}
          </span>
          {t.is_staged && !t.is_rejected && isManager && (
            <div className="flex gap-0.5">
              <button onClick={() => approveMutation.mutate(t.id)} disabled={busy === t.id} className="p-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 disabled:opacity-50" title="Approve">
                <Check size={10} />
              </button>
              <button onClick={() => openRejectSheet(t.id)} disabled={busy === t.id} className="p-1 rounded bg-red-100 dark:bg-red-900/40 text-red-500 hover:bg-red-200 disabled:opacity-50" title="Reject">
                <X size={10} />
              </button>
            </div>
          )}
          {t.is_rejected && (
            <button onClick={() => openResubmit(t)} disabled={busy === t.id} className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 disabled:opacity-50" title="Resubmit">
              <Undo2 size={10} />
            </button>
          )}
        </div>
      ),
    },
  }));

  return (
    <div className="flex flex-col h-full">
      <CompactList
        title="Transactions"
        columns={COLUMNS}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search transactions..."
        tabs={tabs}
        actionLabel={isManager && stagedCount > 1 ? `Approve All (${stagedCount})` : filter === "rejected" ? "Export" : undefined}
        onAction={isManager && stagedCount > 1 ? () => bulkApproveMutation.mutate(transactions.filter((t) => t.is_staged && !t.is_rejected).map((t) => t.id)) : handleExport}
      />

      {/* Bulk Action Bar */}
      {isManager && selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 bg-white dark:bg-zinc-900 border border-hairline rounded-full shadow-lg z-50">
          <span className="text-xs font-mono text-zinc-500">{selectedIds.length} selected</span>
          <div className="w-px h-4 bg-hairline" />
          <button onClick={() => bulkRejectMutation.mutate(selectedIds)} disabled={bulkRejectMutation.isPending} className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50">
            Reject All
          </button>
          <button onClick={() => bulkApproveMutation.mutate(selectedIds)} disabled={bulkApproveMutation.isPending} className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-white rounded-full bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {bulkApproveMutation.isPending ? "Approving..." : "Approve"}
          </button>
          <button onClick={clearSelection} className="ml-1 text-zinc-300 hover:text-zinc-500 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-2xl p-5 pb-8 animate-in slide-in-from-bottom-4">
            <h3 className="text-sm font-semibold mb-1">Reject Transaction</h3>
            <p className="text-xs text-zinc-400 mb-3">Provide a reason so the submitter can correct it.</p>
            <textarea value={rejectionNote} onChange={(e) => setRejectionNote(e.target.value)} placeholder="What needs to be corrected?"
              className="w-full h-24 p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" autoFocus />
            <div className="flex gap-2 mt-3">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setRejectingId(null); setRejectionNote(""); }}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={confirmReject} disabled={rejectMutation.isPending}>
                {rejectMutation.isPending ? "Rejecting..." : "Send Back"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resubmit Modal */}
      {resubmitId && (() => {
        const t = transactions.find((x) => x.id === resubmitId);
        if (!t) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-2xl p-5 pb-8 animate-in slide-in-from-bottom-4">
              <h3 className="text-sm font-semibold mb-1">Resubmit Transaction</h3>
              <p className="text-xs text-zinc-400 mb-3">Fix the issues and resubmit for approval.</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Amount (cents)</label>
                  <input type="number" value={resubmitForm.amount_minor} onChange={(e) => setResubmitForm((f) => ({ ...f, amount_minor: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Description</label>
                  <input value={resubmitForm.description} onChange={(e) => setResubmitForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Note</label>
                  <textarea value={resubmitForm.note} onChange={(e) => setResubmitForm((f) => ({ ...f, note: e.target.value }))}
                    className="w-full h-20 p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setResubmitId(null); setResubmitForm({ amount_minor: "", description: "", note: "" }); }}>Cancel</Button>
                <Button size="sm" className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={confirmResubmit} disabled={resubmitMutation.isPending}>
                  <Send size={12} className="mr-1" />{resubmitMutation.isPending ? "Submitting..." : "Resubmit"}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
