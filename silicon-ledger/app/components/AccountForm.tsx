import { useState } from "react";
import { createAccount } from "~/lib/api";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { parseCents } from "~/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useI18nStore } from "~/lib/stores";

const accountTypes = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "credit_card", label: "Credit Card" },
  { value: "ewallet", label: "E-wallet" },
  { value: "custom", label: "Custom" },
] as const;

const currencies = ["USD", "EUR", "GBP", "JPY", "NGN", "KES", "ZAR", "GHS", "BDT"];

interface AccountFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountForm({ isOpen, onClose }: AccountFormProps) {
  const queryClient = useQueryClient();
  const locale = useI18nStore((s) => s.locale);
  const [name, setName] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [nameAlias, setNameAlias] = useState("");
  const [type, setType] = useState<typeof accountTypes[number]["value"]>("bank");
  const [currency, setCurrency] = useState("USD");
  const [openingBalance, setOpeningBalance] = useState("");
  const [includeInAssets, setIncludeInAssets] = useState(true);
  const [creditLimit, setCreditLimit] = useState("");
  const [creditLimitType, setCreditLimitType] = useState<"soft" | "hard">("hard");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!name.trim()) { setError("Account name is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      const payload: Parameters<typeof createAccount>[0] = {
        name: name.trim(),
        type,
        currency,
        opening_balance: parseCents(openingBalance),
        include_in_assets: includeInAssets,
      };
      if (nameBn.trim()) (payload as any).name_bn = nameBn.trim();
      if (nameAlias.trim()) (payload as any).name_alias = nameAlias.trim();
      if (creditLimit) {
        (payload as any).credit_limit = parseInt(creditLimit, 10) * 100;
        (payload as any).credit_limit_type = creditLimitType;
      }
      await createAccount(payload);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      onClose();
      setName("");
      setNameBn("");
      setNameAlias("");
      setOpeningBalance("");
      setCreditLimit("");
      setCreditLimitType("hard");
      setType("bank");
      setCurrency("USD");
      setIncludeInAssets(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Account">
      <div className="space-y-4">
        <Input
          label="Name"
          placeholder="Main Checking"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {locale === "bn" && (
          <Input
            label="নাম (বাংলা)"
            placeholder="প্রধান অ্যাকাউন্ট"
            value={nameBn}
            onChange={(e) => setNameBn(e.target.value)}
          />
        )}

        <Input
          label="Alias (print name)"
          placeholder="For invoices in different language"
          value={nameAlias}
          onChange={(e) => setNameAlias(e.target.value)}
        />

        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {accountTypes.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`py-2 rounded-lg text-xs font-medium border border-hairline transition-colors ${
                  type === t.value
                    ? "bg-expense text-white border-expense"
                    : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-expense"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <Input
          label="Opening Balance"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
        />

        {/* Credit Limit — shown for credit_card and custom */}
        {(type === "credit_card" || type === "custom") && (
          <div className="space-y-2 p-3 rounded-lg border border-hairline">
            <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Credit Limit</p>
            <Input
              label="Limit (dollars)"
              type="number"
              step="1"
              placeholder="5000"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
            />
            <div className="flex gap-2">
              {(["soft", "hard"] as const).map((ct) => (
                <button
                  key={ct}
                  onClick={() => setCreditLimitType(ct)}
                  className={`flex-1 py-1.5 rounded text-[10px] font-medium border border-hairline ${
                    creditLimitType === ct
                      ? "bg-expense text-white border-expense"
                      : "bg-transparent"
                  }`}
                >
                  {ct === "soft" ? "Soft (warning)" : "Hard (block)"}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            checked={includeInAssets}
            onChange={(e) => setIncludeInAssets(e.target.checked)}
            className="w-4 h-4 rounded border-hairline text-expense focus:ring-expense"
          />
          <span className="text-sm">Include in total assets</span>
        </label>

        {error && <p className="text-xs text-expense">{error}</p>}

        <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Creating..." : "Create Account"}
        </Button>
      </div>
    </BottomSheet>
  );
}
