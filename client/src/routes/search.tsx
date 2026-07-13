import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Search as SearchIcon, ShoppingCart, Wrench, Truck, FileText, Zap, Briefcase, TrendingUp, ArrowLeftRight, Building2 } from "lucide-react";
import { searchApi } from "@/lib/api";
import { formatCents, cn } from "@/lib/utils";

const categoryIcons: Record<string, React.ElementType> = {
  materials: Wrench, labor: Briefcase, permits: FileText,
  utilities: Zap, transport: Truck, food: ShoppingCart,
  "client payment": TrendingUp, investment: TrendingUp,
  refund: ArrowLeftRight, transfer: ArrowLeftRight,
};

function getTxIcon(category?: string) {
  if (!category) return ShoppingCart;
  const key = category.toLowerCase();
  for (const [k, Icon] of Object.entries(categoryIcons)) {
    if (key.includes(k)) return Icon;
  }
  return ShoppingCart;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ["search", debounced, typeFilter],
    queryFn: () => searchApi.all({ q: debounced, type: typeFilter, limit: "30" }),
    enabled: debounced.length >= 2 || debounced.length === 0,
  });

  const results = data?.results ?? [];
  const hasQuery = debounced.length >= 2;

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24">
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search transactions & projects…"
          className="w-full h-12 pl-12 pr-4 bg-neutral-50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-expense/20 placeholder-neutral-400"
          autoFocus
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {["all", "income", "expense", "transfer", "project"].map((f) => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
              typeFilter === f ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Searching…</p>
      ) : !hasQuery ? (
        <p className="text-sm text-neutral-400 text-center py-8">Type at least 2 characters to search</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">No results for "{debounced}"</p>
      ) : (
        <div className="space-y-2">
          {results.map((item: any) => {
            if (item.result_type === "project") {
              return (
                <Card key={`p-${item.id}`} className="border-neutral-100">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-neutral-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-neutral-400">{item.location || "—"} · {item.status}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            const Icon = getTxIcon(item.category);
            return (
              <Card key={`t-${item.id}`} className="border-neutral-100">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-neutral-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.description}</p>
                        <p className="text-[10px] text-neutral-400 font-mono uppercase tracking-tighter">
                          {item.type === "transfer"
                            ? `${item.account_name || "?"} → ${item.to_account_name || "?"}`
                            : item.account_name || "—"}
                        </p>
                      </div>
                    </div>
                    <div className={cn("font-mono font-bold shrink-0 ml-3", item.type === "expense" ? "text-expense" : item.type === "income" ? "text-emerald-600" : "text-neutral-500")}>
                      {item.type === "income" && <span className="text-[9px] mr-0.5 opacity-50">▲</span>}
                      {item.type === "expense" ? `-${formatCents(item.amount).replace(/^\$/, "")}` : formatCents(item.amount)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
