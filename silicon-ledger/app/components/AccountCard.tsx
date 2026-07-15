import type { Account } from "~/lib/types";
import { formatCents } from "~/lib/utils";
import { cn } from "~/lib/utils";
import { useI18nStore } from "~/lib/stores";

interface AccountCardProps {
  account: Account & { current_balance?: number };
}

const iconMap: Record<string, string> = {
  wallet: "💰",
  bank: "🏦",
  card: "💳",
  savings: "🏦",
  cash: "💵",
};

export function AccountCard({ account }: AccountCardProps) {
  const locale = useI18nStore((s) => s.locale);
  const balance = account.current_balance ?? account.opening_balance;
  const isLiability = account.type === "credit_card" || balance < 0;

  const displayName = locale === "bn" && account.name_bn
    ? account.name_bn
    : account.name_alias ?? account.name;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-hairline bg-white dark:bg-zinc-900">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
        style={{ backgroundColor: account.color + "20" }}
      >
        {iconMap[account.icon] ?? "📦"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
        <p className="text-xs text-zinc-400 capitalize">{account.type.replace("_", " ")}</p>
        {account.credit_limit && account.credit_limit > 0 && (
          <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
            Limit: {formatCents(account.credit_limit)}
            {account.usage_pct !== undefined && (
              <span className={cn(
                "ml-1",
                (account.usage_pct ?? 0) > 80 ? "text-expense" : "text-zinc-400",
              )}>
                · {(account.usage_pct ?? 0).toFixed(0)}% used
              </span>
            )}
          </p>
        )}
      </div>
      <div className="text-right">
        <p
          className={cn(
            "font-mono text-sm font-semibold",
            isLiability ? "text-expense" : "text-income dark:text-white",
          )}
        >
          {formatCents(balance)}
        </p>
      </div>
    </div>
  );
}
