import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Input } from "@/components/ui/input";
import { Plus, Clock, Play, Trash2, Wallet, Landmark, CreditCard, Smartphone, ArrowLeftRight } from "lucide-react";
import { recurringApi, accountsApi } from "@/lib/api";
import { formatCents, cn } from "@/lib/utils";
import type { RecurringTemplate } from "@/types";

const intervalLabels: Record<string, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly",
  yearly: "Yearly", custom_weeks: "Custom Weeks",
};

const typeIcons: Record<string, React.ElementType> = {
  bank: Landmark, cash: Wallet, credit_card: CreditCard, e_wallet: Smartphone,
};

export default function RecurringPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["recurring"],
    queryFn: recurringApi.list,
  });

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
  });

  const grouped = data?.grouped ?? {};
  const accounts = accountsData?.accounts ?? [];

  const generateMutation = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => recurringApi.generate(id, count),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: (years: number) => recurringApi.bulkGenerate(years),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recurringApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring"] }),
  });

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recurring</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs rounded-lg border-neutral-200"
            onClick={() => bulkMutation.mutate(1)}
            disabled={bulkMutation.isPending}
          >
            <Play className="w-3 h-3 mr-1" />Generate Year
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" />New
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Loading…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">No recurring templates yet.</p>
      ) : (
        Object.entries(grouped).map(([interval, templates]) => (
          <section key={interval}>
            <div className="bg-neutral-50 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">
              {interval}
            </div>
            <div className="divide-y divide-neutral-100 rounded-2xl overflow-hidden border border-neutral-100 bg-white">
              {(templates as RecurringTemplate[]).map((t) => {
                const isExpense = t.type === "expense";
                const isTransfer = t.type === "transfer";
                return (
                  <div key={t.id} className="flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                        {isTransfer ? (
                          <ArrowLeftRight className="w-5 h-5 text-neutral-500" />
                        ) : (
                          <Clock className="w-5 h-5 text-neutral-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{t.name}</p>
                        <p className="text-[10px] text-neutral-400 uppercase font-mono tracking-tighter">
                          {t.account_name || "—"}
                          {isTransfer && t.to_account_name && ` → ${t.to_account_name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <div className="text-right">
                        <p className={cn("font-mono font-bold text-sm", isExpense ? "text-expense" : isTransfer ? "text-neutral-500" : "text-emerald-600")}>
                          {isExpense ? "-" : isTransfer ? "" : "+"}{formatCents(t.amount)}
                        </p>
                        <p className="text-[10px] text-neutral-400 font-mono">{t.next_occurrence}</p>
                      </div>
                      <button
                        onClick={() => generateMutation.mutate({ id: t.id, count: 1 })}
                        disabled={generateMutation.isPending}
                        className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
                        title="Generate next occurrence"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(t.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-expense transition-colors"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {bulkMutation.data && (
        <p className="text-xs text-center text-emerald-600">
          Generated {bulkMutation.data.count} transactions
        </p>
      )}

      <AddRecurringForm
        open={showForm}
        onClose={() => setShowForm(false)}
        accounts={accounts}
      />
    </div>
  );
}

function AddRecurringForm({
  open, onClose, accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: { id: string; name: string; type: string }[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [intervalType, setIntervalType] = useState("monthly");
  const [intervalValue, setIntervalValue] = useState("1");
  const [nextDate, setNextDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: (body: Partial<RecurringTemplate>) => recurringApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      onClose();
      setName(""); setAmount(""); setAccountId(""); setToAccountId(""); setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!amountCents || amountCents <= 0) { setError("Enter a valid amount"); return; }
    if (!accountId) { setError("Select an account"); return; }
    if (type === "transfer" && !toAccountId) { setError("Select destination account"); return; }
    if (type === "transfer" && accountId === toAccountId) { setError("Cannot transfer to same account"); return; }

    createMutation.mutate({
      name: name.trim(),
      type,
      amount: amountCents,
      account_id: accountId,
      to_account_id: type === "transfer" ? toAccountId : undefined,
      interval_type: intervalType,
      interval_value: parseInt(intervalValue),
      next_occurrence: nextDate,
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="New Recurring Template">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex bg-neutral-100 rounded-xl p-0.5">
          {(["expense", "income", "transfer"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setType(t); setToAccountId(""); }}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize",
                type === t ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly Rent" className="rounded-xl bg-neutral-50 border-none" />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-400">$</span>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" className="w-full pl-8 h-12 text-lg font-mono rounded-xl bg-neutral-50 border-none" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full h-12 px-4 bg-neutral-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-expense/20 appearance-none">
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {type === "transfer" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Destination Account</label>
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="w-full h-12 px-4 bg-neutral-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-expense/20 appearance-none">
              <option value="">Select destination…</option>
              {accounts.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Interval</label>
            <select value={intervalType} onChange={(e) => setIntervalType(e.target.value)} className="w-full h-12 px-4 bg-neutral-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-expense/20 appearance-none">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom_weeks">Custom Weeks</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Every</label>
            <Input value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} inputMode="numeric" className="rounded-xl bg-neutral-50 border-none h-12 text-center font-mono" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Next Occurrence</label>
          <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="rounded-xl bg-neutral-50 border-none h-12" />
        </div>

        {error && <p className="text-expense text-xs text-center">{error}</p>}

        <Button type="submit" disabled={createMutation.isPending} className="w-full h-12 rounded-xl bg-expense hover:bg-expense/90 text-white border-none text-base font-semibold">
          {createMutation.isPending ? "Creating…" : "Create Template"}
        </Button>
      </form>
    </BottomSheet>
  );
}
