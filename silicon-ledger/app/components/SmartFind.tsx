import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowLeftRight, Users, Building2, Package, Briefcase, ClipboardList, UserCheck, FileText } from "lucide-react";
import { cn } from "~/lib/utils";
import { formatCents } from "~/lib/utils";
import { supabase } from "~/lib/supabase";
import { apiFetch } from "~/lib/client";
import type { Account, Transaction, Vendor, PurchaseOrder, Project, Item } from "~/lib/types";

interface SmartFindProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FlatResult {
  id: string;
  label: string;
  subtitle: string;
  entityType: string;
  route: string;
}

const ENTITY_CONFIG: Record<string, { label: string; icon: typeof Search }> = {
  transactions: { label: "Transactions", icon: ArrowLeftRight },
  accounts: { label: "Accounts", icon: Building2 },
  categories: { label: "Categories", icon: FileText },
  landowners: { label: "Landowners", icon: Users },
  vendors: { label: "Vendors", icon: Building2 },
  "purchase-orders": { label: "Purchase Orders", icon: ClipboardList },
  projects: { label: "Projects", icon: Briefcase },
  items: { label: "Inventory Items", icon: Package },
  employees: { label: "Employees", icon: UserCheck },
};

export function SmartFind({ isOpen, onClose }: SmartFindProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<FlatResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!isOpen) return;
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    const q = debouncedQuery.trim().toLowerCase();
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      try {
        const [txnsRes, accsRes, itemsRes, landownersRes, vendorsRes, posRes, projectsRes, employeesRes] =
          await Promise.allSettled([
            supabase
              .from("transactions")
              .select("id, description, amount_minor, txn_type, currency")
              .ilike("description", `%${q}%`)
              .order("occurred_on", { ascending: false })
              .limit(5),
            supabase
              .from("accounts")
              .select("id, name, type, currency")
              .ilike("name", `%${q}%`)
              .order("name")
              .limit(5),
            supabase
              .from("items")
              .select("id, name, sku, item_type")
              .ilike("name", `%${q}%`)
              .order("name")
              .limit(5),
            apiFetch<{ landowners: Array<{ id: string; name: string }> }>(
              `/api/landowners?search=${encodeURIComponent(q)}`,
            ),
            apiFetch<{ vendors: Vendor[] }>(
              `/api/budgets/vendors?search=${encodeURIComponent(q)}`,
            ),
            apiFetch<{ purchase_orders: PurchaseOrder[] }>(
              `/api/purchase-orders?search=${encodeURIComponent(q)}`,
            ),
            apiFetch<{ projects: Project[] }>("/api/budgets/projects"),
            apiFetch<{ employees: Array<{ id: string; name: string; email?: string }> }>(
              "/api/payroll/employees",
            ),
          ]);

        if (cancelled) return;

        const flat: FlatResult[] = [];

        if (txnsRes.status === "fulfilled" && txnsRes.value.data) {
          for (const t of txnsRes.value.data) {
            const sign = t.txn_type === "expense" ? "-" : "+";
            flat.push({
              id: t.id,
              label: t.description || "(no description)",
              subtitle: `${sign}${formatCents(t.amount_minor)}`,
              entityType: "transactions",
              route: "/transactions",
            });
          }
        }

        if (accsRes.status === "fulfilled" && accsRes.value.data) {
          for (const a of accsRes.value.data) {
            flat.push({
              id: a.id,
              label: a.name,
              subtitle: a.type,
              entityType: "accounts",
              route: "/accounts",
            });
          }
        }

        if (itemsRes.status === "fulfilled" && itemsRes.value.data) {
          for (const i of itemsRes.value.data) {
            flat.push({
              id: i.id,
              label: i.name,
              subtitle: i.sku ? `SKU: ${i.sku}` : i.item_type,
              entityType: "items",
              route: "/inventory",
            });
          }
        }

        if (landownersRes.status === "fulfilled") {
          const data = landownersRes.value as { landowners: Array<{ id: string; name: string }> };
          for (const l of data.landowners ?? []) {
            flat.push({
              id: l.id,
              label: l.name,
              subtitle: "",
              entityType: "landowners",
              route: `/landowners/${l.id}`,
            });
          }
        }

        if (vendorsRes.status === "fulfilled") {
          const data = vendorsRes.value as { vendors: Vendor[] };
          for (const v of data.vendors ?? []) {
            if (!v.name.toLowerCase().includes(q)) continue;
            flat.push({
              id: v.id,
              label: v.name,
              subtitle: v.contact_person ? `Contact: ${v.contact_person}` : "",
              entityType: "vendors",
              route: "/vendors",
            });
          }
        }

        if (posRes.status === "fulfilled") {
          const data = posRes.value as { purchase_orders: PurchaseOrder[] };
          for (const po of data.purchase_orders ?? []) {
            flat.push({
              id: po.id,
              label: po.po_number || po.id.slice(0, 8),
              subtitle: po.vendor_name ?? "No vendor",
              entityType: "purchase-orders",
              route: `/purchase-orders/${po.id}`,
            });
          }
        }

        if (projectsRes.status === "fulfilled") {
          const data = projectsRes.value as { projects: Project[] };
          for (const p of data.projects ?? []) {
            if (!p.name.toLowerCase().includes(q)) continue;
            flat.push({
              id: p.id,
              label: p.name,
              subtitle: p.code ?? p.status,
              entityType: "projects",
              route: "/projects",
            });
          }
        }

        if (employeesRes.status === "fulfilled") {
          const data = employeesRes.value as { employees: Array<{ id: string; name: string; email?: string }> };
          for (const e of data.employees ?? []) {
            if (!e.name.toLowerCase().includes(q)) continue;
            flat.push({
              id: e.id,
              label: e.name,
              subtitle: e.email ?? "",
              entityType: "employees",
              route: "/payroll",
            });
          }
        }

        setResults(flat);
        setSelectedIndex(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, isOpen]);

  const handleSelect = useCallback(
    (result: FlatResult) => {
      navigate({ to: result.route as never });
      onClose();
    },
    [navigate, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(results.length - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
      if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, results, selectedIndex, handleSelect, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const groups = results.reduce<Record<string, FlatResult[]>>((acc, r) => {
    if (!acc[r.entityType]) acc[r.entityType] = [];
    acc[r.entityType].push(r);
    return acc;
  }, {});

  let globalIndex = 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-xl border border-hairline shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
          <Search size={18} className="text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions, accounts, items..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          {loading && (
            <div className="w-4 h-4 rounded-full border-2 border-zinc-300 border-t-accent animate-spin" />
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded border border-hairline font-mono">
            ESC
          </kbd>
        </div>

        {results.length > 0 && (
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {Object.entries(groups).map(([type, items]) => {
              const config = ENTITY_CONFIG[type];
              const Icon = config?.icon ?? Search;
              return (
                <div key={type}>
                  <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    <Icon size={12} />
                    {config?.label ?? type}
                  </div>
                  {items.map((item) => {
                    const currentIndex = globalIndex++;
                    return (
                      <button
                        key={`${type}-${item.id}`}
                        data-index={currentIndex}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 text-left text-xs transition-colors",
                          currentIndex === selectedIndex
                            ? "bg-accent/10 text-accent"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800",
                        )}
                      >
                        <Icon size={14} className="shrink-0 text-zinc-400" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.label}</div>
                          {item.subtitle && (
                            <div className="text-[10px] text-zinc-400 truncate">
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {query && !loading && results.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-8 text-zinc-400">
            <Search size={24} />
            <p className="text-xs">No results found</p>
            <p className="text-[10px]">Try a different search term</p>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-2 border-t border-hairline text-[10px] text-zinc-400">
          <span>↑↓ to navigate</span>
          <span>↵ to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
