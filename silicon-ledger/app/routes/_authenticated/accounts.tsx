import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchAccounts } from "~/lib/api";
import { AccountCard } from "~/components/AccountCard";
import { AccountForm } from "~/components/AccountForm";
import { Card, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { formatCents } from "~/lib/utils";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const [showForm, setShowForm] = useState(false);
  const { data } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const accounts = data?.accounts ?? [];
  const summary = data?.summary;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-xl font-bold">Accounts</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{accounts.length} accounts</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus size={16} className="mr-1" />
          Add
        </Button>
      </div>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-zinc-400">Assets</p>
              <p className="font-mono text-sm font-semibold text-income dark:text-white">
                {formatCents(summary.totalAssets)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Liabilities</p>
              <p className="font-mono text-sm font-semibold text-expense">
                {formatCents(summary.totalLiabilities)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Net</p>
              <p className="font-mono text-sm font-semibold">
                {formatCents(summary.netWorth)}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
        {accounts.length === 0 && (
          <p className="text-center text-sm text-zinc-400 py-8">
            No accounts yet. Tap "Add" to create one.
          </p>
        )}
      </div>

      <AccountForm isOpen={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
}
