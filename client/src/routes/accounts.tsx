import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Input } from "@/components/ui/input";
import { Plus, Wallet, Landmark, CreditCard, Smartphone, Eye, EyeOff } from "lucide-react";
import { AccountCard } from "@/components/AccountCard";

const editIcons: Record<string, React.ElementType> = {
  bank: Landmark, cash: Wallet, credit_card: CreditCard, e_wallet: Smartphone,
};
import { accountsApi } from "@/lib/api";
import { formatCents, cn } from "@/lib/utils";
import type { Account } from "@/types";

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editBalance, setEditBalance] = useState("");
  const [editExclude, setEditExclude] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Account> }) =>
      accountsApi.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setEditingAccount(null);
    },
  });

  const accounts = data?.accounts ?? [];
  const summary = data?.summary ?? { totalAssets: 0, totalLiabilities: 0, netWorth: 0 };

  function openEdit(account: Account) {
    setEditingAccount(account);
    setEditBalance(formatCents(account.opening_balance));
    setEditExclude(!account.include_in_assets);
  }

  function saveEdit() {
    if (!editingAccount) return;
    const parsed = Math.round(parseFloat(editBalance.replace(/[^0-9.]/g, "")) * 100);
    if (isNaN(parsed)) return;
    updateMutation.mutate({
      id: editingAccount.id,
      body: { opening_balance: parsed, include_in_assets: !editExclude },
    });
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <Button variant="ghost" size="icon" className="text-expense">
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      <Card className="border-neutral-100 bg-neutral-50/50">
        <CardContent className="pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-neutral-600">Total Assets</span>
            <span className="text-2xl font-bold font-mono text-emerald-600">
              {isLoading ? "…" : formatCents(summary.totalAssets)}
            </span>
          </div>
          {summary.totalLiabilities > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
              <span className="text-sm text-neutral-600">Total Liabilities</span>
              <span className="text-xl font-bold font-mono text-expense">
                -{isLoading ? "…" : formatCents(summary.totalLiabilities)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
            <span className="text-sm font-semibold text-neutral-700">Net Worth</span>
            <span className="text-xl font-bold font-mono text-neutral-900">
              {isLoading ? "…" : formatCents(summary.netWorth)}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-neutral-400 text-center py-8">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">No accounts yet. Create one to get started.</p>
        ) : (
          accounts.map((account) => (
            <AccountCard key={account.id} account={account} onClick={() => openEdit(account)} />
          ))
        )}
      </div>

      <BottomSheet open={!!editingAccount} onClose={() => setEditingAccount(null)} title="Edit Account">
        {editingAccount && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-neutral-100">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${editingAccount.color}15` }}
              >
                {(() => {
                  const Icon = editIcons[editingAccount.type] || Wallet;
                  return <Icon className="w-6 h-6" style={{ color: editingAccount.color }} />;
                })()}
              </div>
              <div>
                <h3 className="font-semibold">{editingAccount.name}</h3>
                <p className="text-sm text-neutral-500">{editingAccount.type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} · {editingAccount.currency}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Opening Balance</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-400">$</span>
                <Input
                  value={editBalance}
                  onChange={(e) => setEditBalance(e.target.value)}
                  className="w-full pl-8 h-12 text-lg font-mono rounded-xl bg-neutral-50 border-none focus-visible:ring-expense"
                />
              </div>
            </div>

            <button
              onClick={() => setEditExclude(!editExclude)}
              className={cn(
                "flex items-center justify-between w-full p-4 rounded-xl border transition-colors",
                editExclude ? "border-expense bg-expense/5" : "border-neutral-200"
              )}
            >
              <div className="flex items-center gap-3">
                {editExclude ? <EyeOff className="w-5 h-5 text-expense" /> : <Eye className="w-5 h-5 text-neutral-500" />}
                <div className="text-left">
                  <p className="text-sm font-medium">Exclude from Assets</p>
                  <p className="text-xs text-neutral-500">Hide from Total Assets calculation</p>
                </div>
              </div>
              <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors", editExclude ? "border-expense bg-expense" : "border-neutral-300")}>
                {editExclude && <span className="text-white text-xs">✓</span>}
              </div>
            </button>

            <Button
              onClick={saveEdit}
              disabled={updateMutation.isPending}
              className="w-full h-12 rounded-xl bg-expense hover:bg-expense/90 text-white border-none text-base font-semibold"
            >
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
