import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRecurring, createRecurring, updateRecurring, deleteRecurring, deleteRecurringWithStaged, toggleRecurring, generateRecurring, fetchAccounts, fetchCategories } from "~/lib/api";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { parseCents, formatCents, todayString } from "~/lib/utils";
import { Plus, Trash2, Play, Pause, RefreshCw, Edit2 } from "lucide-react";
import type { RecurringTransaction } from "~/lib/types";

const intervals = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
] as const;

const txnTypes = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;

const INTERVAL_LABELS: Record<string, string> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  yearly: "YEARLY",
  custom: "CUSTOM",
};

interface RecurringManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

function nextOccurrence(r: RecurringTransaction): string {
  const start = new Date(r.start_date + "T00:00:00");
  const now = new Date();
  if (start > now) return r.start_date;
  if (!r.is_active) return "Paused";

  const d = new Date(start);
  let maxLoops = 1000;
  while (d <= now && maxLoops-- > 0) {
    switch (r.interval_type) {
      case "daily": d.setDate(d.getDate() + 1); break;
      case "weekly": d.setDate(d.getDate() + 7); break;
      case "monthly": d.setMonth(d.getMonth() + 1); break;
      case "yearly": d.setFullYear(d.getFullYear() + 1); break;
      case "custom": d.setDate(d.getDate() + (r.interval_days ?? 30)); break;
    }
  }
  return d.toISOString().slice(0, 10);
}

export function RecurringManager({ isOpen, onClose }: RecurringManagerProps) {
  const queryClient = useQueryClient();
  const { data: recurring = [] } = useQuery({ queryKey: ["recurring"], queryFn: fetchRecurring, enabled: isOpen });
  const { data: accData } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts, enabled: isOpen });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, enabled: isOpen });

  const accounts = accData?.accounts ?? [];

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [applyToFutureOnly, setApplyToFutureOnly] = useState(true);

  // Form state (shared for add + edit)
  const [txnType, setTxnType] = useState<"expense" | "income" | "transfer">("expense");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [intervalType, setIntervalType] = useState<string>("monthly");
  const [intervalDays, setIntervalDays] = useState("");
  const [startDate, setStartDate] = useState(todayString());
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const activeRecurring = recurring.filter((r) => r.is_active);

  // Group by interval
  const grouped = useMemo(() => {
    const map = new Map<string, RecurringTransaction[]>();
    for (const r of recurring) {
      const key = r.interval_type === "custom" ? `custom_${r.interval_days ?? 30}` : r.interval_type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [recurring]);

  function populateForm(r: RecurringTransaction) {
    setTxnType(r.txn_type);
    setAccountId(r.account_id);
    setToAccountId(r.to_account_id ?? "");
    setCategoryId(r.category_id ?? "");
    setAmount((r.amount_minor / 100).toFixed(2));
    setDescription(r.description ?? "");
    setIntervalType(r.interval_type);
    setIntervalDays(r.interval_days ? String(r.interval_days) : "");
    setStartDate(r.start_date);
    setEndDate(r.end_date ?? "");
    setEditing(r);
    setShowAdd(true);
    setError("");
  }

  function resetForm() {
    setTxnType("expense");
    setAccountId("");
    setToAccountId("");
    setCategoryId("");
    setAmount("");
    setDescription("");
    setIntervalType("monthly");
    setIntervalDays("");
    setStartDate(todayString());
    setEndDate("");
    setEditing(null);
    setShowAdd(false);
    setApplyToFutureOnly(true);
    setError("");
    setDeleteConfirm(null);
  }

  async function handleSubmit() {
    if (!amount || !accountId) { setError("Amount and account required"); return; }
    setSubmitting(true);
    setError("");
    try {
      const cents = parseCents(amount);
      const payload = {
        account_id: accountId,
        txn_type: txnType,
        category_id: txnType === "transfer" ? null : (categoryId || null),
        to_account_id: txnType === "transfer" ? (toAccountId || null) : null,
        amount_minor: cents,
        description,
        interval_type: intervalType as any,
        interval_days: intervalType === "custom" ? parseInt(intervalDays) || null : null,
        start_date: startDate,
        end_date: endDate || null,
      };

      if (editing) {
        await updateRecurring(editing.id, {
          ...payload,
          note: editing.note,
          currency: editing.currency,
        });
      } else {
        await createRecurring(payload);
      }

      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(r: RecurringTransaction) {
    await toggleRecurring(r.id, !r.is_active);
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
  }

  async function handleDelete(id: string, keepStaged: boolean) {
    if (keepStaged) {
      await deleteRecurring(id);
    } else {
      await deleteRecurringWithStaged(id);
    }
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    setDeleteConfirm(null);
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={() => { resetForm(); onClose(); }} title="Recurring">
      <div className="space-y-4">
        {!showAdd ? (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} className="mr-1" />
            Add Recurring
          </Button>
        ) : (
          <div className="space-y-3 p-3 rounded-lg border border-hairline">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                {editing ? "Edit Template" : "New Template"}
              </span>
              {editing && (
                <button
                  onClick={() => resetForm()}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Cancel edit
                </button>
              )}
            </div>

            <div className="flex gap-1">
              {txnTypes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTxnType(t.value)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium border border-hairline ${
                    txnType === t.value ? "bg-expense text-white border-expense" : "bg-transparent"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-hairline bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-expense"
            >
              <option value="">Account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            {txnType === "transfer" && (
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-hairline bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-expense"
              >
                <option value="">To Account</option>
                {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}

            {txnType !== "transfer" && (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-hairline bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-expense"
              >
                <option value="">Category</option>
                {categories.filter((c) => c.kind === txnType).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}

            <Input label="Amount" type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input label="Description" placeholder="Rent" value={description} onChange={(e) => setDescription(e.target.value)} />

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Interval</label>
              <div className="flex flex-wrap gap-1">
                {intervals.map((i) => (
                  <button
                    key={i.value}
                    onClick={() => setIntervalType(i.value)}
                    className={`px-2 py-1 rounded text-[10px] font-medium border border-hairline ${
                      intervalType === i.value ? "bg-expense text-white border-expense" : "bg-transparent"
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>

            {intervalType === "custom" && (
              <Input label="Days" type="number" placeholder="28" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
            )}

            <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="End Date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />

            {/* Apply to Future Only — shown when editing */}
            {editing && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-hairline">
                <div>
                  <p className="text-xs font-medium">Apply to future only</p>
                  <p className="text-[10px] text-zinc-400">Preserve historical ledger integrity</p>
                </div>
                <button
                  onClick={() => setApplyToFutureOnly(!applyToFutureOnly)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${applyToFutureOnly ? "bg-expense" : "bg-zinc-300 dark:bg-zinc-600"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${applyToFutureOnly ? "translate-x-5" : ""}`} />
                </button>
              </div>
            )}

            {error && <p className="text-xs text-expense">{error}</p>}

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={resetForm}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Saving..." : editing ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {recurring.length === 0 && !showAdd && (
            <p className="text-sm text-zinc-400 text-center py-6">No recurring transactions</p>
          )}
          {recurring.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={async () => {
                try {
                  const count = await generateRecurring();
                  queryClient.invalidateQueries({ queryKey: ["recurring"] });
                  alert(`${count} transactions generated`);
                } catch (e) {
                  alert(e instanceof Error ? e.message : "Failed");
                }
              }}>
                <RefreshCw size={14} className="mr-1" />
                Generate Now
              </Button>
            </div>
          )}

          {/* Grouped by interval */}
          {grouped.map(([group, items]) => {
            const groupLabel = group.startsWith("custom_")
              ? `EVERY ${group.replace("custom_", "")} DAYS`
              : INTERVAL_LABELS[group] ?? group.toUpperCase();

            return (
              <div key={group}>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-1 pt-2 pb-1 sticky top-0 bg-white dark:bg-zinc-900 z-10">
                  {groupLabel}
                </p>
                {items.map((r) => {
                  const nextDate = nextOccurrence(r);
                  const account = accounts.find((a) => a.id === r.account_id);

                  return (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-hairline mb-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.description || "Untitled"}</p>
                        <p className="text-[10px] text-zinc-400 truncate">
                          {account?.name ?? "Unknown account"}
                        </p>
                      </div>
                      <div className="text-right mr-3">
                        <p className={`font-mono text-xs font-semibold ${r.txn_type === "expense" ? "text-expense" : "text-income dark:text-white"}`}>
                          {r.txn_type === "income" ? "↑" : ""}{formatCents(r.amount_minor)}
                        </p>
                        <p className="text-[10px] font-mono text-zinc-400">
                          {nextDate}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => populateForm(r)}
                          className="p-1.5 rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleToggle(r)}
                          className={`p-1.5 rounded ${r.is_active ? "text-green-600 hover:bg-green-50" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                          title={r.is_active ? "Pause" : "Resume"}
                        >
                          {r.is_active ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        {deleteConfirm === r.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(r.id, true)}
                              className="px-1.5 py-1 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600"
                              title="Keep staged transactions"
                            >
                              Keep
                            </button>
                            <button
                              onClick={() => handleDelete(r.id, false)}
                              className="px-1.5 py-1 rounded text-[10px] bg-expense text-white"
                              title="Delete staged transactions too"
                            >
                              All
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-1.5 py-1 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800"
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(r.id)}
                            className="p-1.5 rounded text-expense hover:bg-red-50 dark:hover:bg-red-950"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {activeRecurring.length > 0 && (
            <p className="text-[10px] text-zinc-400 text-center pt-1">{activeRecurring.length} active</p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
