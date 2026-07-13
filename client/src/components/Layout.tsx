import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Building2, Menu, Bell, AlertTriangle, DollarSign, FileText, Clock, ExternalLink } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AddTransaction } from "@/components/AddTransaction";
import { useTransactionSheet } from "@/stores/transactionStore";
import { notificationsApi } from "@/lib/api";

const sharedNav = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Calendar", path: "/calendar" },
  { label: "Reports", path: "/reports" },
  { label: "Accounts", path: "/accounts" },
  { label: "Search", path: "/search" },
  { label: "Transactions", path: "/transactions" },
  { label: "Expenses", path: "/expenses" },
  { label: "Invoices", path: "/invoices" },
  { label: "Recurring", path: "/recurring" },
  { label: "Vendors", path: "/vendors" },
];

const financeNav = [{ label: "Review", path: "/review" }];
const bottomNav = [{ label: "Backup", path: "/backup" }];

export function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { open, defaultTab, closeSheet } = useTransactionSheet();

  const isFinance = user?.role === "finance" || user?.role === "md";
  const mainItems = isFinance ? [...sharedNav, ...financeNav] : sharedNav;

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: notifs } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
    refetchInterval: 60_000,
    enabled: !!user,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const notifItems = [
    ...(notifs?.stale_staged ?? []),
    ...(notifs?.budget_alerts ?? []),
    ...(notifs?.overdue_invoices ?? []),
  ];

  const iconMap: Record<string, React.ElementType> = {
    stale_staged: Clock,
    budget_alert: DollarSign,
    overdue_invoice: FileText,
  };

  return (
    <div className="flex h-screen">
      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 w-64 border-r bg-card transition-transform lg:static lg:translate-x-0`}>
        <div className="flex h-14 items-center border-b px-6 gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <span className="font-semibold">Silicon Ledger</span>
        </div>
        <nav className="flex-1 flex flex-col p-4">
          <div className="space-y-1 flex-1">
            {mainItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent [&.active]:bg-accent [&.active]:text-primary"
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-neutral-100 pt-2 mt-2 space-y-1">
            {bottomNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center border-b px-6 gap-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />

          <div className="relative" ref={notifRef}>
            <Button variant="ghost" size="icon" className="relative" onClick={() => setNotifOpen(!notifOpen)}>
              <Bell className="h-4 w-4" />
              {(notifs?.total ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-expense text-white text-[8px] font-bold flex items-center justify-center">
                  {notifs!.total > 9 ? "9+" : notifs!.total}
                </span>
              )}
            </Button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="p-3 border-b border-neutral-100">
                  <p className="text-xs font-semibold text-neutral-600">Notifications</p>
                </div>
                {notifItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-400">No notifications</div>
                ) : (
                  notifItems.map((n, i) => {
                    const Icon = iconMap[n.type] || AlertTriangle;
                    return (
                      <Link
                        key={`${n.type}-${i}`}
                        to={n.link as any}
                        onClick={() => setNotifOpen(false)}
                        className="flex items-start gap-3 p-3 hover:bg-neutral-50 transition-colors border-b border-neutral-50 last:border-none"
                      >
                        <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="w-3.5 h-3.5 text-neutral-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-neutral-700 leading-relaxed">{n.message}</p>
                        </div>
                        <ExternalLink className="w-3 h-3 text-neutral-300 shrink-0 mt-1" />
                      </Link>
                    );
                  })
                )}
                {(notifs?.pending_review ?? 0) > 0 && (
                  <Link to="/review" onClick={() => setNotifOpen(false)} className="flex items-center gap-2 p-3 bg-amber-50 hover:bg-amber-100 transition-colors text-xs font-medium text-amber-700 rounded-b-xl">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {notifs!.pending_review} transaction{notifs!.pending_review !== 1 ? "s" : ""} pending review
                  </Link>
                )}
              </div>
            )}
          </div>

          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <Button variant="ghost" size="icon" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      <BottomSheet open={open} onClose={closeSheet} title="Add Transaction">
        <AddTransaction defaultTab={defaultTab} onClose={closeSheet} />
      </BottomSheet>
    </div>
  );
}
