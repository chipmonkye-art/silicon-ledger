import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { apiFetch } from "~/lib/client";
import { formatCents, cn } from "~/lib/utils";
import type { Account } from "~/lib/types";

interface Cheque {
  id: string;
  account_id: string;
  cheque_book_name?: string;
  cheque_number: string;
  cheque_date: string;
  payee: string;
  amount_minor: number;
  status: "issued" | "cleared" | "bounced" | "cancelled" | "stopped" | "post_dated";
  notes?: string;
  clearance_date?: string;
  bounce_reason?: string;
  account?: Account;
}

const statusColors: Record<string, string> = {
  issued: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  cleared: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  bounced: "text-red-500 bg-red-50 dark:bg-red-900/20",
  cancelled: "text-zinc-400 bg-zinc-100 dark:bg-zinc-800",
  stopped: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  post_dated: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
};

const statusOptions = ["issued", "cleared", "bounced", "cancelled", "stopped", "post_dated"];

export const Route = createFileRoute("/_authenticated/cheque-register")({
  component: ChequeRegisterPage,
});

function ChequeRegisterPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editCheque, setEditCheque] = useState<Cheque | null>(null);
  const [error, setError] = useState("");

  const params = new URLSearchParams();
  if (accountFilter) params.set("account_id", accountFilter);
  if (statusFilter) params.set("status", statusFilter);
  const qs = params.toString();

  const { data } = useQuery({
    queryKey: ["cheques", { accountFilter, statusFilter }],
    queryFn: () => apiFetch<{ cheques: Cheque[] }>(`/api/cheque-register${qs ? `?${qs}` : ""}`),
  });

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<{ accounts: Account[] }>("/api/accounts"),
  });

  const cheques = data?.cheques ?? [];
  const accounts = accountsData?.accounts ?? [];

  const filtered = search
    ? cheques.filter((c) =>
        c.payee.toLowerCase().includes(search.toLowerCase()) ||
        c.cheque_number.toLowerCase().includes(search.toLowerCase()),
      )
    : cheques;

  const createMutation = useMutation({
    mutationFn: (args: Record<string, unknown>) => apiFetch("/api/cheque-register", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cheques"] }); setShowCreate(false); setError(""); },
    onError: (e) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, args }: { id: string; args: Record<string, unknown> }) =>
      apiFetch(`/api/cheque-register/${id}`, { method: "PATCH", body: JSON.stringify(args) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cheques"] }); setEditCheque(null); setError(""); },
    onError: (e) => setError(e.message),
  });

  const columns = [
    { key: "cheque", label: "Cheque", grow: true },
    { key: "amount", label: "Amount", align: "right" as const, width: "80px" },
    { key: "status", label: "Status", width: "70px" },
  ];

  const rows = filtered.map((c) => ({
    id: c.id,
    cells: {
      cheque: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300 font-mono">{c.cheque_number}</div>
          <div className="text-[10px] text-zinc-400">{c.payee}</div>
          <div className="text-[9px] text-zinc-400">{c.cheque_date}{c.account ? ` · ${c.account.name}` : ""}</div>
          {c.notes && <div className="text-[9px] text-zinc-400 truncate">{c.notes}</div>}
        </div>
      ),
      amount: (
        <div className="text-right">
          <div className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{formatCents(c.amount_minor)}</div>
          {c.clearance_date && <div className="text-[9px] text-zinc-400">Cleared: {c.clearance_date}</div>}
          {c.bounce_reason && <div className="text-[9px] text-red-400">{c.bounce_reason}</div>}
        </div>
      ),
      status: (
        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block", statusColors[c.status])}>
          {c.status.replace(/_/g, " ")}
        </span>
      ),
    },
  }));

  return (
    <>
      {/* Filters */}
      <div className="px-4 pt-4 pb-2 space-y-2">
        <h1 className="text-base font-bold text-zinc-800 dark:text-zinc-100">Cheque Register</h1>
        <div className="flex gap-2">
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
            className="flex-1 h-8 px-2 rounded-lg border border-hairline bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 h-8 px-2 rounded-lg border border-hairline bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">All Status</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      <CompactList
        title=""
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search cheque or payee..."
        onRowClick={(id) => {
          const c = cheques.find((x) => x.id === id);
          if (c) setEditCheque(c);
        }}
        actionLabel="Issue Cheque"
        onAction={() => setShowCreate(true)}
      />

      <CreateChequeSheet
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setError(""); }}
        accounts={accounts}
        onSubmit={(args) => createMutation.mutate(args)}
        isPending={createMutation.isPending}
        error={error}
      />

      {editCheque && (
        <UpdateChequeSheet
          isOpen={!!editCheque}
          onClose={() => { setEditCheque(null); setError(""); }}
          cheque={editCheque}
          onSubmit={(args) => updateMutation.mutate({ id: editCheque.id, args })}
          isPending={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

function CreateChequeSheet({ isOpen, onClose, accounts, onSubmit, isPending, error }: {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  onSubmit: (args: Record<string, unknown>) => void;
  isPending: boolean;
  error?: string;
}) {
  const [account_id, setAccountId] = useState("");
  const [cheque_book_name, setChequeBookName] = useState("");
  const [cheque_number, setChequeNumber] = useState("");
  const [cheque_date, setChequeDate] = useState(new Date().toISOString().slice(0, 10));
  const [payee, setPayee] = useState("");
  const [amount_minor, setAmountMinor] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit() {
    if (!payee.trim() || !cheque_number.trim() || !account_id) return;
    onSubmit({
      account_id,
      cheque_book_name: cheque_book_name || undefined,
      cheque_number: cheque_number.trim(),
      cheque_date,
      payee: payee.trim(),
      amount_minor: parseInt(amount_minor) || 0,
      notes: notes || undefined,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Issue Cheque">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Account</label>
          <select value={account_id} onChange={(e) => setAccountId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Cheque Book</label>
            <input value={cheque_book_name} onChange={(e) => setChequeBookName(e.target.value)} placeholder="e.g. SB-2024"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Cheque No.</label>
            <input value={cheque_number} onChange={(e) => setChequeNumber(e.target.value)} placeholder="123456"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Cheque Date</label>
            <input type="date" value={cheque_date} onChange={(e) => setChequeDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Amount (cents)</label>
            <input type="number" value={amount_minor} onChange={(e) => setAmountMinor(e.target.value)} placeholder="50000"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Payee</label>
          <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Payee name"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={handleSubmit} disabled={!payee.trim() || !cheque_number.trim() || !account_id || isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {isPending ? "Issuing..." : "Issue Cheque"}
        </button>
      </div>
    </BottomSheet>
  );
}

function UpdateChequeSheet({ isOpen, onClose, cheque, onSubmit, isPending, error }: {
  isOpen: boolean;
  onClose: () => void;
  cheque: Cheque;
  onSubmit: (args: Record<string, unknown>) => void;
  isPending: boolean;
  error?: string;
}) {
  const [status, setStatus] = useState(cheque.status);
  const [clearance_date, setClearanceDate] = useState(cheque.clearance_date ?? "");
  const [bounce_reason, setBounceReason] = useState(cheque.bounce_reason ?? "");

  function handleSubmit() {
    onSubmit({
      status,
      clearance_date: clearance_date || undefined,
      bounce_reason: bounce_reason || undefined,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Update Cheque #${cheque.cheque_number}`}>
      <div className="space-y-3">
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Payee</span>
            <span className="text-zinc-700 dark:text-zinc-300">{cheque.payee}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Amount</span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{formatCents(cheque.amount_minor)}</span>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Cheque["status"])}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>

        {status === "cleared" && (
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Clearance Date</label>
            <input type="date" value={clearance_date} onChange={(e) => setClearanceDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        )}

        {status === "bounced" && (
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Bounce Reason</label>
            <textarea value={bounce_reason} onChange={(e) => setBounceReason(e.target.value)} rows={2} placeholder="Insufficient funds"
              className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        )}

        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={handleSubmit} disabled={isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {isPending ? "Updating..." : "Update Status"}
        </button>
      </div>
    </BottomSheet>
  );
}
