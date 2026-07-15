import { Outlet, createFileRoute, redirect, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { AddTransaction } from "~/components/AddTransaction";
import { useAuthStore, useSheetStore, useWorkspaceStore, useSettingsStore } from "~/lib/stores";
import { supabase } from "~/lib/supabase";
import { seedUserData, generateRecurring, fetchWorkspaces } from "~/lib/api";
import { useEffect, useState, useRef } from "react";
import {
  Check, ChevronsUpDown, Plus, LayoutDashboard, ArrowLeftRight, Calendar, BarChart3,
  Settings, ScrollText, Package, Factory, Upload, Search, Sun, Moon, ClipboardList, Bell,
  Building2, GitBranch, AlertTriangle, Briefcase, Users, UserCheck, Banknote, Landmark, Receipt,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { ExcelImport } from "~/components/ExcelImport";
import { SmartFind } from "~/components/SmartFind";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth/login" });
  },
  component: AuthenticatedLayout,
  errorComponent: () => (
    <div className="p-4 text-expense">Authentication required</div>
  ),
});

const NAV_ITEMS = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { path: "/import", icon: Upload, label: "Import" },
  { path: "/calendar", icon: Calendar, label: "Calendar" },
  { path: "/reports", icon: BarChart3, label: "Reports" },

  { path: "/purchase-orders", icon: ClipboardList, label: "Purchase Orders" },
  { path: "/vendors", icon: Building2, label: "Vendors" },
  { path: "/projects", icon: Briefcase, label: "Projects" },
  { path: "/budgets", icon: Bell, label: "Budgets & Alerts" },
  { path: "/cost-centers", icon: GitBranch, label: "Cost Centers" },
  { path: "/alert-rules", icon: AlertTriangle, label: "Alert Rules" },

  { path: "/landowners", icon: Users, label: "Landowners" },
  { path: "/inventory", icon: Package, label: "Inventory" },
  { path: "/manufacturing", icon: Factory, label: "Manufacturing" },
  { path: "/attendance", icon: UserCheck, label: "Attendance" },
  { path: "/cheque-register", icon: Receipt, label: "Cheque Register" },
  { path: "/bank-reconciliation", icon: Landmark, label: "Bank Reconciliation" },
  { path: "/payroll", icon: Banknote, label: "Payroll" },
];

const BOTTOM_NAV = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { path: "/reports", icon: BarChart3, label: "Reports" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const openSheet = useSheetStore((s) => s.open);
  const { workspaceId, workspaces, setWorkspace, setWorkspaces } = useWorkspaceStore();
  const { theme, setTheme } = useSettingsStore();
  const [wsOpen, setWsOpen] = useState(false);
  const [wsInput, setWsInput] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [smartFindOpen, setSmartFindOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const wsRef = useRef<HTMLDivElement>(null);

  const role = workspaces.find((w) => w.id === workspaceId)?.role;
  const isManager = role === "owner" || role === "manager";
  const showAudit = isManager || role === "auditor";

  function renderNavLink(item: (typeof NAV_ITEMS)[number]) {
    const isActive = location.pathname.startsWith(item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        className={cn(
          "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
          isActive
            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
            : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400",
        )}
        title={sidebarOpen ? undefined : item.label}
      >
        <item.icon size={16} strokeWidth={isActive ? 2.5 : 1.5} />
        {sidebarOpen && <span>{item.label}</span>}
      </Link>
    );
  }

  const currentWs = workspaces.find((w) => w.id === workspaceId);
  const userInitials = "SK";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session.access_token, data.session.user.id);
        seedUserData().catch(() => {});
        generateRecurring().catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    fetchWorkspaces()
      .then((res) => setWorkspaces(Array.isArray(res) ? res : (res as { workspaces: typeof res }).workspaces ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setWsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey) return;
      switch (e.key) {
        case "n": e.preventDefault(); openSheet(); break;
        case "t": e.preventDefault(); navigate({ to: "/calendar" }); break;
        case "r": e.preventDefault(); navigate({ to: "/reports" }); break;
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  async function handleCreateWorkspace() {
    if (!wsInput.trim()) return;
    setCreatingWs(true);
    try {
      const mod = await import("~/lib/api");
      const ws = await mod.createWorkspace(wsInput.trim());
      const updated = await fetchWorkspaces();
      const list = Array.isArray(updated) ? updated : (updated as { workspaces: typeof updated }).workspaces ?? [];
      setWorkspaces(list);
      setWorkspace(ws.id ?? list[0]?.id ?? "");
      setWsInput("");
      setWsOpen(false);
    } catch (e) {
      console.error("Failed to create workspace:", e);
    } finally {
      setCreatingWs(false);
    }
  }

  return (
    <div className="flex min-h-dvh">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col w-56 sidebar-blur border-r border-hairline shrink-0",
        !sidebarOpen && "w-16",
      )}>
        {/* App Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-hairline">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">S</span>
          </div>
          {sidebarOpen && <span className="text-xs font-semibold">Silicon Ledger</span>}
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-zinc-400" />
            <input
              className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-lg py-1.5 pl-7 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-zinc-400"
              placeholder="Search... (⌘K)"
              onFocus={() => setSmartFindOpen(true)}
              readOnly
            />
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
          {/* Core */}
          {NAV_ITEMS.slice(0, 5).map((item) => renderNavLink(item))}

          {sidebarOpen && <div className="text-[9px] text-zinc-300 uppercase tracking-wider font-bold px-3 pt-3 pb-1">Procurement</div>}
          {NAV_ITEMS.slice(5, 12).map((item) => renderNavLink(item))}

          {sidebarOpen && <div className="text-[9px] text-zinc-300 uppercase tracking-wider font-bold px-3 pt-3 pb-1">Operations</div>}
          {NAV_ITEMS.slice(12).map((item) => renderNavLink(item))}

          {showAudit && (
            <Link
              to="/audit"
              className={cn(
                "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                location.pathname.startsWith("/audit")
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400",
              )}
              title={sidebarOpen ? undefined : "Audit"}
            >
              <ScrollText size={16} strokeWidth={location.pathname.startsWith("/audit") ? 2.5 : 1.5} />
              {sidebarOpen && <span>Audit</span>}
            </Link>
          )}
        </nav>

        {/* Workspace Switcher + Profile */}
        <div className="px-2 py-2 border-t border-hairline space-y-1.5">
          <div ref={wsRef} className="relative px-1">
            <button
              onClick={() => setWsOpen(!wsOpen)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="w-4 h-4 rounded bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                <span className="text-white text-[7px] font-bold">W</span>
              </div>
              <span className="flex-1 truncate text-left font-medium text-zinc-600 dark:text-zinc-300">
                {currentWs?.name ?? "Workspace"}
              </span>
              <ChevronsUpDown size={11} className="text-zinc-400 shrink-0" />
            </button>
            {wsOpen && (
              <div className="absolute bottom-full mb-1 left-0 w-56 bg-white dark:bg-zinc-900 rounded-xl border border-hairline shadow-lg z-50 overflow-hidden">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => { setWorkspace(ws.id); setWsOpen(false); }}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                      ws.id === workspaceId && "font-semibold",
                    )}
                  >
                    <div className={cn("w-2 h-2 rounded-full", ws.id === workspaceId ? "bg-accent" : "bg-zinc-300")} />
                    <span className="flex-1 truncate">{ws.name}</span>
                    <span className="text-[10px] text-zinc-400 capitalize">{ws.role}</span>
                    {ws.id === workspaceId && <Check size={12} className="text-accent shrink-0" />}
                  </button>
                ))}
                <div className="border-t border-hairline p-2">
                  <div className="flex gap-1">
                    <input
                      value={wsInput}
                      onChange={(e) => setWsInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
                      placeholder="New workspace..."
                      className="flex-1 px-2 py-1 text-[11px] border border-hairline rounded-lg bg-transparent outline-none focus:border-accent"
                    />
                    <button
                      onClick={handleCreateWorkspace}
                      disabled={creatingWs || !wsInput.trim()}
                      className="px-2 py-1 bg-accent text-white rounded-lg text-[11px] font-medium disabled:opacity-50"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {userInitials}
            </div>
            {sidebarOpen && (
              <>
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate flex-1">Syed Kabir</span>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (desktop) */}
        <header className="hidden lg:flex h-14 items-center justify-between px-5 border-b border-hairline bg-white/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-white text-[8px] font-bold">S</span>
              </div>
              <span className="text-xs font-semibold">
                {NAV_ITEMS.find((i) => location.pathname.startsWith(i.path))?.label ?? "Dashboard"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-semibold hover:bg-indigo-700 transition-colors"
            >
              + Import
            </button>
            <button
              onClick={openSheet}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-[10px] font-semibold hover:bg-accent-dark transition-colors"
            >
              + New Transaction
            </button>
          </div>
        </header>

        {/* Mobile Top Bar */}
        <div className="lg:hidden sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b border-hairline">
          <div className="px-4 py-2 flex items-center justify-between">
            <div ref={wsRef} className="relative">
              <button
                onClick={() => setWsOpen(!wsOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-hairline text-[10px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500" />
                <span className="max-w-[100px] truncate">{currentWs?.name ?? "Workspace"}</span>
                <ChevronsUpDown size={10} className="text-zinc-400" />
              </button>
              {wsOpen && (
                <div className="absolute top-full mt-1 left-0 w-52 bg-white dark:bg-zinc-900 rounded-xl border border-hairline shadow-lg z-50 overflow-hidden">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => { setWorkspace(ws.id); setWsOpen(false); }}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 text-[11px] text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                        ws.id === workspaceId && "font-semibold",
                      )}
                    >
                      <div className={cn("w-1.5 h-1.5 rounded-full", ws.id === workspaceId ? "bg-accent" : "bg-zinc-300")} />
                      <span className="flex-1 truncate">{ws.name}</span>
                      <span className="text-[10px] text-zinc-400 capitalize">{ws.role}</span>
                      {ws.id === workspaceId && <Check size={10} className="text-accent shrink-0" />}
                    </button>
                  ))}
                  <div className="border-t border-hairline p-2">
                    <div className="flex gap-1">
                      <input
                        value={wsInput}
                        onChange={(e) => setWsInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
                        placeholder="New workspace..."
                        className="flex-1 px-2 py-1 text-[11px] border border-hairline rounded-lg bg-transparent outline-none focus:border-accent"
                      />
                      <button
                        onClick={handleCreateWorkspace}
                        disabled={creatingWs || !wsInput.trim()}
                        className="px-2 py-1 bg-accent text-white rounded-lg text-[11px] font-medium disabled:opacity-50"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <span className="text-[10px] text-zinc-400 font-medium capitalize">{currentWs?.role ?? ""}</span>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto p-4 lg:p-6">
            <Outlet />
          </div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-lg border-t border-hairline safe-area-bottom">
          <div className="flex items-center justify-around h-14 max-w-lg mx-auto relative">
            {BOTTOM_NAV.map((tab) => {
              const isActive = location.pathname.startsWith(tab.path);
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 w-14 h-full",
                    "text-[9px] font-medium transition-colors",
                    isActive ? "text-indigo-600" : "text-zinc-400",
                  )}
                >
                  <tab.icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
                  {tab.label}
                </Link>
              );
            })}
            <button
              onClick={openSheet}
              className="absolute -top-4 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg flex items-center justify-center hover:shadow-xl transition-all active:scale-90"
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          </div>
        </nav>
      </div>

      <AddTransaction />
      <ExcelImport isOpen={showImport} onClose={() => setShowImport(false)} />
      <SmartFind isOpen={smartFindOpen} onClose={() => setSmartFindOpen(false)} />
    </div>
  );
}
