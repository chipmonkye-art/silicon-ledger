import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { apiFetch } from "~/lib/client";
import { formatCents, cn } from "~/lib/utils";
import { ChevronLeft } from "lucide-react";
import type { Account } from "~/lib/types";

interface StatementLine {
  id: string;
  statement_id: string;
  line_date: string;
  description: string;
  debit_minor?: number;
  credit_minor?: number;
  balance_minor: number;
  ref_no?: string;
  match_status: "unmatched" | "matched" | "ignored" | "partial";
  match_confidence?: number;
  matched_transaction_id?: string;
}

interface BankStatement {
  id: string;
  account_id: string;
  statement_date: string;
  closing_balance_minor: number;
  opening_balance_minor?: number;
  line_count: number;
  matched_count: number;
  account?: Account;
  lines?: StatementLine[];
}

const matchStatusColors: Record<string, string> = {
  unmatched: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  matched: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  ignored: "text-zinc-400 bg-zinc-100 dark:bg-zinc-800",
  partial: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
};

export const Route = createFileRoute("/_authenticated/bank-reconciliation")({
  component: BankReconciliationPage,
});

function BankReconciliationPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["reconciliation-statements"],
    queryFn: () => apiFetch<{ statements: BankStatement[] }>("/api/bank-reconciliation/statements"),
  });

  const statements = data?.statements ?? [];

  const filtered = search
    ? statements.filter((s) => s.account?.name?.toLowerCase().includes(search.toLowerCase()) || s.statement_date.includes(search))
    : statements;

  const deleteMutation = useMutation({
    mutationFn: (statementId: string) => apiFetch(`/api/bank-reconciliation/statements/${statementId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reconciliation-statements"] }),
  });

  if (selectedStatement) {
    return (
      <StatementDetail
        statement={selectedStatement}
        onBack={() => setSelectedStatement(null)}
      />
    );
  }

  const columns = [
    { key: "statement", label: "Statement", grow: true },
    { key: "progress", label: "Matched", width: "80px", align: "right" as const },
  ];

  const rows = filtered.map((s) => ({
    id: s.id,
    cells: {
      statement: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300">
            {s.account?.name ?? "Unknown account"}
          </div>
          <div className="text-[10px] text-zinc-400">
            {s.statement_date} &middot; {s.line_count} lines
          </div>
          <div className="font-mono text-[11px] text-zinc-500">
            Closing: {formatCents(s.closing_balance_minor)}
          </div>
        </div>
      ),
      progress: (
        <div className="text-right">
          <span className={cn(
            "font-mono text-xs",
            s.matched_count === s.line_count ? "text-emerald-500" : "text-amber-500",
          )}>
            {s.matched_count}/{s.line_count}
          </span>
          <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full mt-1">
            <div
              className={cn("h-full rounded-full", s.matched_count === s.line_count ? "bg-emerald-500" : "bg-amber-500")}
              style={{ width: `${s.line_count > 0 ? (s.matched_count / s.line_count) * 100 : 0}%` }}
            />
          </div>
        </div>
      ),
    },
  }));

  return (
    <>
      <CompactList
        title="Bank Reconciliation"
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search statements..."
        onRowClick={(id) => {
          const s = statements.find((x) => x.id === id);
          if (s) setSelectedStatement(s);
        }}
        actionLabel="Import Statement"
        onAction={() => setShowImport(true)}
      />

      <ImportStatementSheet
        isOpen={showImport}
        onClose={() => { setShowImport(false); setError(""); }}
      />
    </>
  );
}

function StatementDetail({ statement, onBack }: { statement: BankStatement; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["reconciliation-statement-lines", statement.id],
    queryFn: () => apiFetch<{ statement: BankStatement }>(`/api/bank-reconciliation/statements/${statement.id}`),
  });

  const lines = data?.statement?.lines ?? [];
  const stmt = data?.statement ?? statement;

  const autoMatchMutation = useMutation({
    mutationFn: () => apiFetch(`/api/bank-reconciliation/statements/${statement.id}/match-auto`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-statement-lines", statement.id] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-statements"] });
      setError("");
    },
    onError: (e) => setError(e.message),
  });

  const ignoreMutation = useMutation({
    mutationFn: (lineId: string) =>
      apiFetch(`/api/bank-reconciliation/statements/${statement.id}/lines/${lineId}/ignore`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-statement-lines", statement.id] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-statements"] });
    },
  });

  const matchMutation = useMutation({
    mutationFn: ({ lineId, transactionId }: { lineId: string; transactionId: string }) =>
      apiFetch(`/api/bank-reconciliation/statements/${statement.id}/lines/${lineId}/match`, {
        method: "POST",
        body: JSON.stringify({ transaction_id: transactionId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-statement-lines", statement.id] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-statements"] });
    },
  });

  return (
    <div className="p-4 max-w-lg mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-zinc-400 mb-3">
        <ChevronLeft size={14} /> Statements
      </button>

      <div className="mb-4">
        <h1 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
          {stmt.account?.name ?? "Statement"}
        </h1>
        <div className="text-xs text-zinc-400 space-x-2">
          <span>{stmt.statement_date}</span>
          <span>·</span>
          <span className="font-mono">Open: {formatCents(stmt.opening_balance_minor ?? 0)}</span>
          <span>·</span>
          <span className="font-mono">Close: {formatCents(stmt.closing_balance_minor)}</span>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <div className="mb-3">
        <button
          onClick={() => autoMatchMutation.mutate()}
          disabled={autoMatchMutation.isPending}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50"
        >
          {autoMatchMutation.isPending ? "Matching..." : "Auto-Match"}
        </button>
      </div>

      <div className="divide-y divide-hairline">
        {lines.map((line) => (
          <div key={line.id} className="py-2.5">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0 mr-2">
                <div className="text-xs text-zinc-500">{line.line_date}</div>
                <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{line.description}</div>
                {line.ref_no && <div className="text-[9px] text-zinc-400 font-mono">Ref: {line.ref_no}</div>}
              </div>
              <div className="text-right">
                {line.debit_minor != null && line.debit_minor > 0 && (
                  <div className="font-mono text-xs text-red-500">{formatCents(line.debit_minor)}</div>
                )}
                {line.credit_minor != null && line.credit_minor > 0 && (
                  <div className="font-mono text-xs text-emerald-500">{formatCents(line.credit_minor)}</div>
                )}
                <div className="font-mono text-[10px] text-zinc-400">{formatCents(line.balance_minor)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("text-[9px] font-medium px-1 py-0.5 rounded", matchStatusColors[line.match_status])}>
                {line.match_status}
              </span>
              {line.match_confidence != null && (
                <span className="text-[9px] text-zinc-400">{Math.round(line.match_confidence * 100)}%</span>
              )}
              <div className="flex-1" />
              {line.match_status === "unmatched" && (
                <>
                  <button
                    onClick={() => {
                      const txId = prompt("Enter transaction ID to match:");
                      if (txId) matchMutation.mutate({ lineId: line.id, transactionId: txId });
                    }}
                    className="text-[9px] text-indigo-500 font-medium"
                  >
                    Match
                  </button>
                  <button
                    onClick={() => ignoreMutation.mutate(line.id)}
                    className="text-[9px] text-zinc-400"
                  >
                    Ignore
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {lines.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-8">No lines in this statement.</p>
        )}
      </div>
    </div>
  );
}

function ImportStatementSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [account_id, setAccountId] = useState("");
  const [statement_date, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [closing_balance, setClosingBalance] = useState("");
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<{ accounts: Account[] }>("/api/accounts"),
  });
  const accounts = accountsData?.accounts ?? [];

  const importMutation = useMutation({
    mutationFn: (args: Record<string, unknown>) =>
      apiFetch("/api/bank-reconciliation/statements", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-statements"] });
      setError("");
      onClose();
      setAccountId(""); setClosingBalance(""); setCsv("");
    },
    onError: (e) => setError(e.message),
  });

  function handleSubmit() {
    if (!account_id || !closing_balance) return;
    const lines = csv.trim()
      ? csv.trim().split("\n").map((line) => {
          const parts = line.split("\t");
          return {
            line_date: parts[0]?.trim(),
            description: parts[1]?.trim(),
            debit_minor: parts[2] ? parseInt(parts[2]) || 0 : undefined,
            credit_minor: parts[3] ? parseInt(parts[3]) || 0 : undefined,
            balance_minor: parseInt(parts[4]) || 0,
            ref_no: parts[5]?.trim(),
          };
        }).filter((l) => l.line_date && l.description)
      : [];

    importMutation.mutate({
      account_id,
      statement_date,
      closing_balance_minor: parseInt(closing_balance) || 0,
      lines,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Import Statement">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Account</label>
          <select value={account_id} onChange={(e) => setAccountId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select account</option>
            {accounts.filter((a) => a.type === "bank").map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Statement Date</label>
            <input type="date" value={statement_date} onChange={(e) => setStatementDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Closing Balance (cents)</label>
            <input type="number" value={closing_balance} onChange={(e) => setClosingBalance(e.target.value)} placeholder="100000"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
            Statement Lines <span className="text-zinc-400 normal-case">(tab-separated: date, description, debit, credit, balance, ref)</span>
          </label>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder={`2024-01-15\tOpening Balance\t\t\t500000\tOB-001\n2024-01-16\tDeposit\t\t100000\t600000\tDEP-001`}
            className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={handleSubmit} disabled={!account_id || !closing_balance || importMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {importMutation.isPending ? "Importing..." : "Import Statement"}
        </button>
      </div>
    </BottomSheet>
  );
}
