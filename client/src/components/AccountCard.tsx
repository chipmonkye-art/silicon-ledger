import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Landmark, CreditCard, Smartphone } from "lucide-react";
import { formatCents, cn } from "@/lib/utils";
import type { Account } from "@/types";

const typeIcons: Record<string, React.ElementType> = {
  bank: Landmark,
  cash: Wallet,
  credit_card: CreditCard,
  e_wallet: Smartphone,
};

const typeLabels: Record<string, string> = {
  bank: "Bank",
  cash: "Cash",
  credit_card: "Credit Card",
  e_wallet: "E-Wallet",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface AccountCardProps {
  account: Account;
  onClick?: () => void;
}

export function AccountCard({ account, onClick }: AccountCardProps) {
  const Icon = typeIcons[account.type] || Wallet;
  const isLiability = account.type === "credit_card";
  const balanceNum = Number(account.current_balance);

  return (
    <Card
      className="border-neutral-100 cursor-pointer hover:border-neutral-200 transition-colors"
      onClick={onClick}
    >
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${account.color}15` }}
            >
              <Icon className="w-5 h-5" style={{ color: account.color }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{account.name}</h3>
              <p className="text-xs text-neutral-400">
                {typeLabels[account.type]}
                {!account.include_in_assets && " · Excluded"}
                <span className="ml-1.5 text-neutral-300">· {timeAgo(account.updated_at)}</span>
              </p>
            </div>
          </div>
          <div className="text-right shrink-0 ml-4">
            <div className={cn("font-mono font-bold", isLiability ? "text-expense" : "text-neutral-900")}>
              {isLiability
                ? `(${formatCents(Math.abs(balanceNum)).replace(/^\$/, "")})`
                : formatCents(balanceNum)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
