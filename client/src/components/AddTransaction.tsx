import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { accountsApi, transactionsApi, categoriesApi, uploadApi } from "@/lib/api";
import { scanReceipt } from "@/lib/ocr";
import { Camera, Loader2, Image, X } from "lucide-react";

type Tab = "expense" | "income" | "transfer";

const tabs: { id: Tab; label: string }[] = [
  { id: "expense", label: "Expense" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfer" },
];

interface AddTransactionProps {
  defaultTab?: Tab;
  onClose: () => void;
}

export function AddTransaction({ defaultTab = "expense", onClose }: AddTransactionProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [note, setNote] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [scanning, setScanning] = useState(false);

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
  });

  const accounts = accountsData?.accounts ?? [];
  const categories = (categoriesData?.categories ?? []).filter((c) => c.type === tab);

  const accountsByType = {
    bank: accounts.filter((a) => a.type === "bank"),
    cash: accounts.filter((a) => a.type === "cash"),
    credit_card: accounts.filter((a) => a.type === "credit_card"),
    e_wallet: accounts.filter((a) => a.type === "e_wallet"),
  };

  const availableAccounts = tab === "expense"
    ? [...accountsByType.bank, ...accountsByType.cash, ...accountsByType.credit_card, ...accountsByType.e_wallet]
    : tab === "income"
    ? [...accountsByType.bank, ...accountsByType.cash, ...accountsByType.e_wallet]
    : accounts;

  async function handleScan(file: File) {
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
    setScanning(true);
    setError("");

    try {
      const { url } = await uploadApi.receipt(file);
      setReceiptUrl(url);

      const ocr = await scanReceipt(file);
      if (ocr.amount) {
        setAmount((ocr.amount / 100).toFixed(2));
      }
      if (ocr.date) {
        setTxDate(new Date(ocr.date).toISOString().slice(0, 10));
      }
      if (ocr.vendor && !note) {
        setNote(ocr.vendor);
      }
    } catch (err) {
      setError("Could not read receipt. Fill in manually.");
    } finally {
      setScanning(false);
    }
  }

  function clearReceipt() {
    setReceiptFile(null);
    setReceiptPreview("");
    setReceiptUrl("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => transactionsApi.create(body as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!amount && !receiptFile) {
      setError("Enter an amount or scan a receipt");
      return;
    }

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!accountId) {
      setError(tab === "transfer" ? "Select source account" : "Select account");
      return;
    }
    if (tab === "transfer" && !toAccountId) {
      setError("Select destination account");
      return;
    }
    if (tab === "transfer" && accountId === toAccountId) {
      setError("Cannot transfer to the same account");
      return;
    }
    if (!note) {
      setError("Add a description");
      return;
    }

    let finalReceiptUrl = receiptUrl;
    if (receiptFile && !receiptUrl) {
      try {
        const { url } = await uploadApi.receipt(receiptFile);
        finalReceiptUrl = url;
      } catch {
        setError("Failed to upload receipt");
        return;
      }
    }

    createMutation.mutate({
      type: tab,
      account_id: accountId,
      to_account_id: tab === "transfer" ? toAccountId : undefined,
      amount: amountCents,
      description: note,
      category: selectedCategory || undefined,
      date: txDate,
      receipt_url: finalReceiptUrl || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex bg-neutral-100 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setAccountId(""); setToAccountId(""); setSelectedCategory(""); setError(""); }}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === t.id
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Amount</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-neutral-400">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-14 pl-8 pr-14 bg-neutral-50 rounded-xl text-2xl font-mono font-semibold text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-expense/20"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-neutral-200/50 text-neutral-400 hover:text-expense transition-colors disabled:opacity-50"
            title="Scan receipt"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleScan(f);
        }}
      />

      {receiptPreview && (
        <div className="relative rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50">
          <img src={receiptPreview} alt="Receipt" className="w-full h-28 object-cover" />
          <button
            type="button"
            onClick={clearReceipt}
            className="absolute top-2 right-2 p-1 rounded-full bg-white/80 hover:bg-white text-neutral-500 hover:text-expense transition-colors shadow-sm"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {scanning && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-expense" />
              <span className="text-xs font-mono text-neutral-500">Reading receipt…</span>
            </div>
          )}
        </div>
      )}

      {tab === "transfer" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">From Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-12 px-4 bg-neutral-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-expense/20 appearance-none"
            >
              <option value="">Select source…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === toAccountId}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">To Account</label>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="w-full h-12 px-4 bg-neutral-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-expense/20 appearance-none"
            >
              <option value="">Select destination…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === accountId}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full h-12 px-4 bg-neutral-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-expense/20 appearance-none"
          >
            <option value="">Select account…</option>
            {availableAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Category</label>
        <div className="grid grid-cols-4 gap-2">
          {categories.length > 0 ? categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.name)}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-xl border transition-colors text-center",
                selectedCategory === cat.name
                  ? "border-expense bg-expense/10 text-expense"
                  : "border-neutral-100 bg-neutral-50 text-neutral-600 hover:border-neutral-200"
              )}
            >
              <span className="text-lg">{cat.icon || "📦"}</span>
              <span className="text-[10px] font-medium leading-tight">{cat.name}</span>
            </button>
          )) : (
            <div className="col-span-4 text-xs text-neutral-400 text-center py-3">
              No categories yet. Type a custom one below.
            </div>
          )}
        </div>
        {!selectedCategory && (
          <input
            type="text"
            value={selectedCategory || ""}
            onChange={(e) => setSelectedCategory(e.target.value)}
            placeholder="Or type a custom category…"
            className="w-full h-10 px-4 bg-neutral-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-expense/20 placeholder-neutral-300"
          />
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-expense/20 placeholder-neutral-300"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</label>
        <input
          type="date"
          value={txDate}
          onChange={(e) => setTxDate(e.target.value)}
          className="w-full h-12 px-4 bg-neutral-50 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-expense/20 [color-scheme:light]"
        />
      </div>

      {error && (
        <p className="text-expense text-xs text-center">{error}</p>
      )}

      <Button
        type="submit"
        disabled={createMutation.isPending}
        className="w-full h-12 rounded-xl text-base font-semibold bg-expense hover:bg-expense/90 text-white border-none"
      >
        {createMutation.isPending
          ? "Submitting…"
          : `Add ${tab === "transfer" ? "Transfer" : tab === "income" ? "Income" : "Expense"}`}
      </Button>
    </form>
  );
}
