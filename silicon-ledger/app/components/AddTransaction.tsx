import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createTransaction, createRecurring, generateRecurring, fetchAccounts, fetchCategories } from "~/lib/api";
import { useSheetStore } from "~/lib/stores";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { parseCents, todayString } from "~/lib/utils";
import { Search, RefreshCw } from "lucide-react";
import type { Account, Category } from "~/lib/types";

const txnTypes = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;

const intervals = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

function buildCategoryTree(categories: Category[]): (Category & { children: Category[] })[] {
  const map = new Map<string, Category & { children: Category[] }>();
  const roots: (Category & { children: Category[] })[] = [];
  for (const c of categories) {
    map.set(c.id, { ...c, children: [] });
  }
  for (const c of map.values()) {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

function flattenTree(nodes: (Category & { children: Category[] })[], depth = 0): { category: Category; depth: number; label: string }[] {
  const result: { category: Category; depth: number; label: string }[] = [];
  for (const n of nodes) {
    result.push({ category: n, depth, label: `${"\u00A0".repeat(depth * 4)}${n.name}` });
    result.push(...flattenTree(n.children, depth + 1));
  }
  return result;
}

export function AddTransaction() {
  const { isOpen, close, defaultDate } = useSheetStore();
  const queryClient = useQueryClient();

  const { data: accData } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, enabled: isOpen });

  const accounts = accData?.accounts ?? [];

  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [intervalType, setIntervalType] = useState("monthly");
  const [bulkGenerating, setBulkGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDate(defaultDate);
      setIsRecurring(false);
      setIntervalType("monthly");
    }
  }, [isOpen, defaultDate]);

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const flatCategories = useMemo(() => {
    const filtered = type === "transfer" ? [] : tree.filter((n) => n.kind === type);
    const flattened = flattenTree(filtered);
    if (!catSearch) return flattened;
    const q = catSearch.toLowerCase();
    return flattened.filter((f) => f.category.name.toLowerCase().includes(q));
  }, [tree, type, catSearch]);

  function reset() {
    setType("expense");
    setAccountId("");
    setToAccountId("");
    setCategoryId("");
    setAmount("");
    setDescription("");
    setNote("");
    setDate(todayString());
    setCatSearch("");
    setError("");
    setIsRecurring(false);
    setIntervalType("monthly");
  }

  async function handleSubmit() {
    if (!amount) { setError("Amount is required"); return; }
    if (!accountId) { setError("Account is required"); return; }
    if (type === "transfer" && !toAccountId) { setError("Destination account is required"); return; }
    if (type !== "transfer" && !categoryId) { setError("Category is required"); return; }

    setSubmitting(true);
    setError("");
    try {
      const cents = parseCents(amount);
      if (cents <= 0) { setError("Amount must be greater than 0"); setSubmitting(false); return; }

      await createTransaction({
        account_id: accountId,
        txn_type: type,
        category_id: type === "transfer" ? null : categoryId,
        to_account_id: type === "transfer" ? toAccountId : null,
        amount_minor: cents,
        occurred_on: date,
        description,
        note,
      });

      if (isRecurring) {
        await createRecurring({
          account_id: accountId,
          txn_type: type,
          category_id: type === "transfer" ? null : categoryId,
          to_account_id: type === "transfer" ? toAccountId : null,
          amount_minor: cents,
          description,
          note,
          interval_type: intervalType as any,
          start_date: date,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      close();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create transaction");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBulkGenerate() {
    setBulkGenerating(true);
    setError("");
    try {
      const count = await generateRecurring();
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      setError(`${count} transactions generated`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBulkGenerating(false);
    }
  }

  const fromLabel = type === "transfer" ? "From Account" : "Account";

  return (
    <BottomSheet isOpen={isOpen} onClose={close} title="Add Transaction">
      <div className="space-y-3 max-h-[80vh] overflow-y-auto pb-4">
        {/* Type Tabs */}
        <div className="flex rounded-lg border border-hairline p-0.5 bg-zinc-50 dark:bg-zinc-800">
          {txnTypes.map((t) => (
            <button
              key={t.value}
              onClick={() => { setType(t.value); setCategoryId(""); setToAccountId(""); }}
              className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                type === t.value
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-mono text-zinc-400">$</span>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-11 pl-8 pr-4 rounded-lg border border-hairline bg-white/50 dark:bg-zinc-800/50 text-xl font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>
        </div>

        {/* Account Selector */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{fromLabel}</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-hairline bg-white/50 dark:bg-zinc-800/50 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
            ))}
          </select>
        </div>

        {/* To Account (transfer only) */}
        {type === "transfer" && (
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">To Account</label>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-hairline bg-white/50 dark:bg-zinc-800/50 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Select destination</option>
              {accounts.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
              ))}
            </select>
          </div>
        )}

        {/* Category Selector (non-transfer only) */}
        {type !== "transfer" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Category</label>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search categories..."
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-hairline bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="max-h-48 overflow-y-auto border border-hairline rounded-lg divide-y divide-hairline">
              {flatCategories.length === 0 ? (
                <p className="text-sm text-zinc-400 p-3 text-center">No {type} categories found</p>
              ) : (
                flatCategories.map((f) => (
                  <button
                    key={f.category.id}
                    onClick={() => setCategoryId(f.category.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                      categoryId === f.category.id ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 font-medium" : ""
                    }`}
                  >
                    <span style={{ marginLeft: `${f.depth * 16}px` }}>{f.category.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Description */}
        <Input
          label="Description"
          placeholder="What was this for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Note */}
        <Input
          label="Note (optional)"
          placeholder="Additional details..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {/* Date */}
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {/* Make Recurring Toggle */}
        <div className="flex items-center justify-between py-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Make Recurring</label>
          <button
            onClick={() => setIsRecurring(!isRecurring)}
            className={`relative w-10 h-5 rounded-full transition-colors ${isRecurring ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isRecurring ? "translate-x-5" : ""}`}
            />
          </button>
        </div>

        {isRecurring && (
          <div className="space-y-3 p-3 rounded-lg border border-hairline">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Interval</label>
            <div className="flex flex-wrap gap-1">
              {intervals.map((i) => (
                <button
                  key={i.value}
                  onClick={() => setIntervalType(i.value)}
                  className={`px-2 py-1 rounded text-[10px] font-medium border border-hairline ${
                    intervalType === i.value ? "bg-indigo-600 text-white border-indigo-600" : "bg-transparent"
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-400">A recurring template will also be created.</p>
          </div>
        )}

        {/* Bulk Generate */}
        <Button variant="outline" size="sm" className="w-full" onClick={handleBulkGenerate} disabled={bulkGenerating}>
          <RefreshCw size={14} className={`mr-1.5 ${bulkGenerating ? "animate-spin" : ""}`} />
          {bulkGenerating ? "Generating..." : "Bulk create for next 3 years"}
        </Button>

        {error && <p className="text-xs text-expense">{error}</p>}

        <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Adding..." : `Add ${type}`}
        </Button>
      </div>
    </BottomSheet>
  );
}
