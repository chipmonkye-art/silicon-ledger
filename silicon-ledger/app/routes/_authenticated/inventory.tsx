import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Package, Warehouse, BarChart3, FileJson, Plus, Search, Trash2, Pencil, Layers, Box } from "lucide-react";
import { fetchItems, createItem, deleteItem, fetchGodowns, createGodown, deleteGodown, fetchStockBalances, fetchBOMs, createBOM, deleteBOM, fetchUOMs, createUOM, deleteUOM, fetchBatches, createBatch } from "~/lib/api";
import type { Item as ItemType, Godown as GodownType, StockBalance, BOM, BOMItem, ItemUOM, ItemBatch } from "~/lib/types";
import { cn, formatCents } from "~/lib/utils";
import { useWorkspaceStore } from "~/lib/stores";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: InventoryPage,
});

const TABS = [
  { id: "items", label: "Items", icon: Package },
  { id: "godowns", label: "Godowns", icon: Warehouse },
  { id: "stock", label: "Stock", icon: BarChart3 },
  { id: "boms", label: "BOMs", icon: FileJson },
  { id: "uoms", label: "UOMs", icon: Layers },
];

function InventoryPage() {
  const [tab, setTab] = useState("items");
  const [search, setSearch] = useState("");
  const wsId = useWorkspaceStore((s) => s.workspaceId);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Inventory</h1>

      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              tab === t.id
                ? "bg-expense text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200",
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full pl-9 pr-3 py-2 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense"
        />
      </div>

      {tab === "items" && <ItemsSection search={search} />}
      {tab === "godowns" && <GodownsSection search={search} />}
      {tab === "stock" && <StockSection search={search} />}
      {tab === "boms" && <BOMSection search={search} />}
      {tab === "uoms" && <UOMSection />}
    </div>
  );
}

function ItemsSection({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery({ queryKey: ["items"], queryFn: fetchItems });
  const { data: uoms } = useQuery({ queryKey: ["uoms"], queryFn: fetchUOMs });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [itemType, setItemType] = useState<"good" | "service">("good");
  const [uomId, setUomId] = useState("");
  const [valMethod, setValMethod] = useState("average");
  const [reorderLevel, setReorderLevel] = useState("");
  const [reorderQty, setReorderQty] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createItem({
      name, sku: sku || undefined, item_type: itemType,
      base_uom_id: uomId || undefined,
      valuation_method: valMethod as any,
      reorder_level: reorderLevel ? Number(reorderLevel) : undefined,
      reorder_qty: reorderQty ? Number(reorderQty) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      setName(""); setSku(""); setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["items"] }),
  });

  const filtered = (items ?? []).filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <p className="text-xs text-zinc-400">Loading...</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{filtered.length} items</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-2.5 py-1.5 bg-expense text-white rounded-lg text-xs font-medium">
          <Plus size={14} /> Add Item
        </button>
      </div>

      {showForm && (
        <div className="p-3 rounded-xl border border-hairline space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name *" className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          <div className="flex gap-2">
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
            <select value={itemType} onChange={(e) => setItemType(e.target.value as any)} className="px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
              <option value="good">Good</option>
              <option value="service">Service</option>
            </select>
          </div>
          <div className="flex gap-2">
            <select value={uomId} onChange={(e) => setUomId(e.target.value)} className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
              <option value="">Base UOM</option>
              {(uoms ?? []).map((u) => <option key={u.id} value={u.id}>{u.short_name}</option>)}
            </select>
            <select value={valMethod} onChange={(e) => setValMethod(e.target.value)} className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
              <option value="average">Avg Cost</option>
              <option value="fifo">FIFO</option>
              <option value="lifo">LIFO</option>
              <option value="standard">Standard</option>
              <option value="last_purchase">Last Purchase</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="Reorder level" type="number" className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
            <input value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} placeholder="Reorder qty" type="number" className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          </div>
          <button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending} className="w-full py-1.5 bg-expense text-white rounded-lg text-xs font-medium disabled:opacity-50">
            {createMutation.isPending ? "Saving..." : "Create Item"}
          </button>
        </div>
      )}

      {filtered.map((item) => (
        <div key={item.id} className="flex items-center justify-between p-3 rounded-xl border border-hairline">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{item.name}</span>
              {item.sku && <span className="text-[10px] font-mono text-zinc-400">{item.sku}</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-400">
              <span className="capitalize">{item.item_type}</span>
              <span className="capitalize">{item.valuation_method}</span>
              {item.base_uom && <span>{item.base_uom.short_name}</span>}
              {item.reorder_level !== null && <span>Reorder: {item.reorder_level}</span>}
            </div>
          </div>
          <button onClick={() => deleteMutation.mutate(item.id)} className="p-1.5 text-zinc-400 hover:text-expense transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function GodownsSection({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const { data: godowns, isLoading } = useQuery({ queryKey: ["godowns"], queryFn: fetchGodowns });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [address, setAddress] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createGodown({ name, parent_id: parentId || undefined, address: address || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["godowns"] }); setName(""); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGodown(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["godowns"] }),
  });

  function renderGodown(g: GodownType, depth = 0) {
    const matches = !search || g.name.toLowerCase().includes(search.toLowerCase());
    return (
      <div key={g.id}>
        {matches && (
          <div className="flex items-center justify-between py-2 px-3" style={{ paddingLeft: `${12 + depth * 16}px` }}>
            <span className="text-xs font-medium">{g.name}</span>
            <div className="flex items-center gap-2">
              {g.address && <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">{g.address}</span>}
              <button onClick={() => deleteMutation.mutate(g.id)} className="p-1 text-zinc-400 hover:text-expense">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )}
        {g.children?.map((c) => renderGodown(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{godowns?.length ?? 0} godowns</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-2.5 py-1.5 bg-expense text-white rounded-lg text-xs font-medium">
          <Plus size={14} /> Add Godown
        </button>
      </div>

      {showForm && (
        <div className="p-3 rounded-xl border border-hairline space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Godown name *" className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
            <option value="">No parent (root)</option>
            {(godowns ?? []).flatMap((g) => [g, ...(g.children ?? [])]).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          <button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending} className="w-full py-1.5 bg-expense text-white rounded-lg text-xs font-medium disabled:opacity-50">
            {createMutation.isPending ? "Saving..." : "Create Godown"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-hairline divide-y divide-hairline">
        {(godowns ?? []).map((g) => renderGodown(g))}
      </div>
    </div>
  );
}

function StockSection({ search }: { search: string }) {
  const { data: stock, isLoading } = useQuery({ queryKey: ["stock"], queryFn: fetchStockBalances });

  const filtered = (stock ?? []).filter((s) =>
    !search || s.item_name.toLowerCase().includes(search.toLowerCase()) || s.sku?.toLowerCase().includes(search.toLowerCase()) || s.godown_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <p className="text-xs text-zinc-400">Loading...</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">{filtered.length} stock entries</p>
      <div className="rounded-xl border border-hairline divide-y divide-hairline">
        {filtered.map((s) => (
          <div key={`${s.item_id}-${s.godown_id}-${s.batch_id}`} className="p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{s.item_name}</span>
                  {s.sku && <span className="text-[10px] font-mono text-zinc-400">{s.sku}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-400">
                  {s.godown_name && <span>{s.godown_name}</span>}
                  {s.batch_no && <span>Batch: {s.batch_no}</span>}
                  {s.expiry_date && <span>Exp: {s.expiry_date}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-semibold">{Number(s.current_qty).toFixed(2)}</p>
                <p className="text-[10px] font-mono text-zinc-400">{formatCents(s.avg_rate)}/u</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BOMSection({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const { data: boms, isLoading } = useQuery({ queryKey: ["boms"], queryFn: fetchBOMs });
  const { data: items } = useQuery({ queryKey: ["items"], queryFn: fetchItems });
  const { data: uoms } = useQuery({ queryKey: ["uoms"], queryFn: fetchUOMs });
  const [showForm, setShowForm] = useState(false);
  const [finishedItemId, setFinishedItemId] = useState("");
  const [bomQty, setBomQty] = useState("1");
  const [bomWastage, setBomWastage] = useState("0");
  const [bomLines, setBomLines] = useState<Array<{ item_id: string; quantity: string; uom_id: string; is_scrap: boolean }>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createBOM({
      finished_item_id: finishedItemId,
      quantity: Number(bomQty),
      wastage_pct: Number(bomWastage),
      items: bomLines.filter((l) => l.item_id && l.quantity).map((l) => ({
        item_id: l.item_id,
        quantity: Number(l.quantity),
        uom_id: l.uom_id || undefined,
        is_scrap: l.is_scrap,
      })),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["boms"] }); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBOM(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["boms"] }),
  });

  const filtered = (boms ?? []).filter((b) =>
    !search || b.finished_item?.name?.toLowerCase().includes(search.toLowerCase())
  );

  function addLine() {
    setBomLines([...bomLines, { item_id: "", quantity: "1", uom_id: "", is_scrap: false }]);
  }

  function updateLine(idx: number, field: string, value: any) {
    const updated = [...bomLines];
    (updated[idx] as any)[field] = value;
    setBomLines(updated);
  }

  function removeLine(idx: number) {
    setBomLines(bomLines.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{filtered.length} BOMs</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-2.5 py-1.5 bg-expense text-white rounded-lg text-xs font-medium">
          <Plus size={14} /> New BOM
        </button>
      </div>

      {showForm && (
        <div className="p-3 rounded-xl border border-hairline space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
          <select value={finishedItemId} onChange={(e) => setFinishedItemId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
            <option value="">Finished item *</option>
            {(items ?? []).filter((i) => i.item_type === "good").map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input value={bomQty} onChange={(e) => setBomQty(e.target.value)} placeholder="Output qty" type="number" className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
            <input value={bomWastage} onChange={(e) => setBomWastage(e.target.value)} placeholder="Wastage %" type="number" className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-zinc-500">Raw Materials</span>
              <button onClick={addLine} className="text-[10px] text-expense font-medium">+ Add</button>
            </div>
            {bomLines.map((line, i) => (
              <div key={i} className="flex gap-1 items-center">
                <select value={line.item_id} onChange={(e) => updateLine(i, "item_id", e.target.value)} className="flex-[2] px-2 py-1 text-[10px] border border-hairline rounded-lg bg-transparent outline-none">
                  <option value="">Item</option>
                  {items?.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
                <input value={line.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} placeholder="Qty" type="number" className="flex-1 px-2 py-1 text-[10px] border border-hairline rounded-lg bg-transparent outline-none w-16" />
                <select value={line.uom_id} onChange={(e) => updateLine(i, "uom_id", e.target.value)} className="flex-1 px-2 py-1 text-[10px] border border-hairline rounded-lg bg-transparent outline-none">
                  <option value="">UOM</option>
                  {uoms?.map((u) => <option key={u.id} value={u.id}>{u.short_name}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <input type="checkbox" checked={line.is_scrap} onChange={(e) => updateLine(i, "is_scrap", e.target.checked)} />
                  Scrap
                </label>
                <button onClick={() => removeLine(i)} className="p-1 text-zinc-400 hover:text-expense"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => createMutation.mutate()} disabled={!finishedItemId || createMutation.isPending} className="w-full py-1.5 bg-expense text-white rounded-lg text-xs font-medium disabled:opacity-50">
            {createMutation.isPending ? "Saving..." : "Create BOM"}
          </button>
        </div>
      )}

      {filtered.map((bom) => (
        <div key={bom.id} className="rounded-xl border border-hairline overflow-hidden">
          <button onClick={() => setExpandedId(expandedId === bom.id ? null : bom.id)} className="flex items-center justify-between w-full p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
            <div>
              <span className="text-sm font-medium">{bom.finished_item?.name ?? "Unknown"}</span>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                Qty: {bom.quantity} | Wastage: {bom.wastage_pct}% | {bom.items?.length ?? 0} materials
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(bom.id); }} className="p-1 text-zinc-400 hover:text-expense"><Trash2 size={14} /></button>
          </button>
          {expandedId === bom.id && bom.items && (
            <div className="border-t border-hairline divide-y divide-hairline">
              {bom.items.map((bi) => (
                <div key={bi.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{bi.item?.name ?? "Unknown"}</span>
                    {bi.is_scrap && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Scrap</span>}
                  </div>
                  <span className="text-xs font-mono">{bi.quantity} {bi.uom?.short_name ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UOMSection() {
  const queryClient = useQueryClient();
  const { data: uoms, isLoading } = useQuery({ queryKey: ["uoms"], queryFn: fetchUOMs });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [category, setCategory] = useState("count");

  const createMutation = useMutation({
    mutationFn: () => createUOM({ name, short_name: shortName, uom_category: category }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["uoms"] }); setName(""); setShortName(""); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUOM(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["uoms"] }),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{uoms?.length ?? 0} UOMs</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-2.5 py-1.5 bg-expense text-white rounded-lg text-xs font-medium">
          <Plus size={14} /> Add UOM
        </button>
      </div>

      {showForm && (
        <div className="p-3 rounded-xl border border-hairline space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Kilogram)" className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          <div className="flex gap-2">
            <input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Short (e.g. kg)" className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
              <option value="count">Count</option>
              <option value="weight">Weight</option>
              <option value="volume">Volume</option>
              <option value="length">Length</option>
              <option value="area">Area</option>
              <option value="time">Time</option>
            </select>
          </div>
          <button onClick={() => createMutation.mutate()} disabled={!name || !shortName || createMutation.isPending} className="w-full py-1.5 bg-expense text-white rounded-lg text-xs font-medium disabled:opacity-50">
            {createMutation.isPending ? "Saving..." : "Create UOM"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-hairline divide-y divide-hairline">
        {(uoms ?? []).map((u) => (
          <div key={u.id} className="flex items-center justify-between p-3">
            <div>
              <span className="text-sm font-medium">{u.name}</span>
              <span className="ml-2 text-xs font-mono text-zinc-400">{u.short_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 capitalize">{u.uom_category}</span>
              <button onClick={() => deleteMutation.mutate(u.id)} className="p-1 text-zinc-400 hover:text-expense"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
