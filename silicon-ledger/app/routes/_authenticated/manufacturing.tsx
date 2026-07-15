import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Factory, Truck, Plus, Search, Play, CheckCircle2, XCircle } from "lucide-react";
import { fetchManufacturingOrders, createManufacturingOrder, updateManufacturingOrderStatus, completeManufacturing, fetchJobWork, createJobWork, updateJobWork, fetchItems, fetchGodowns, fetchBOMs } from "~/lib/api";
import type { ManufacturingOrder, JobWork } from "~/lib/types";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_authenticated/manufacturing")({
  component: ManufacturingPage,
});

const TABS = [
  { id: "orders", label: "Orders", icon: Factory },
  { id: "jobwork", label: "Job Work", icon: Truck },
];

function ManufacturingPage() {
  const [tab, setTab] = useState("orders");
  const [search, setSearch] = useState("");

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Manufacturing</h1>

      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
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

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full pl-9 pr-3 py-2 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense"
        />
      </div>

      {tab === "orders" && <OrdersSection search={search} />}
      {tab === "jobwork" && <JobWorkSection search={search} />}
    </div>
  );
}

function OrdersSection({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useQuery({ queryKey: ["manufacturing-orders"], queryFn: fetchManufacturingOrders });
  const { data: items } = useQuery({ queryKey: ["items"], queryFn: fetchItems });
  const { data: godowns } = useQuery({ queryKey: ["godowns"], queryFn: fetchGodowns });
  const { data: boms } = useQuery({ queryKey: ["boms"], queryFn: fetchBOMs });
  const [showForm, setShowForm] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [plannedQty, setPlannedQty] = useState("1");
  const [selectedBomId, setSelectedBomId] = useState("");
  const [outputGodownId, setOutputGodownId] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createManufacturingOrder({
      item_id: selectedItemId,
      planned_qty: Number(plannedQty),
      bom_id: selectedBomId || undefined,
      output_godown_id: outputGodownId || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manufacturing-orders"] });
      setShowForm(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (order: ManufacturingOrder) => {
      const bom = boms?.find((b) => b.id === order.bom_id);
      return completeManufacturing({
        order_id: order.id,
        consumption: (bom?.items ?? []).map((bi) => ({
          item_id: bi.item_id,
          quantity: bi.quantity * order.planned_qty,
          rate: 0,
        })),
        output_quantity: order.planned_qty,
        output_godown_id: order.output_godown_id ?? godowns?.[0]?.id ?? "",
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["manufacturing-orders"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => updateManufacturingOrderStatus(id, "cancelled"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["manufacturing-orders"] }),
  });

  const statusStyles: Record<string, string> = {
    planned: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    in_progress: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    completed: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    cancelled: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
  };

  const filtered = (orders ?? []).filter((o) =>
    !search || o.item?.name?.toLowerCase().includes(search.toLowerCase()) || o.order_no?.toLowerCase().includes(search.toLowerCase())
  );

  function flattenGodowns(g: any[]): any[] {
    return g.flatMap((g) => [g, ...(g.children ? flattenGodowns(g.children) : [])]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{filtered.length} orders</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-2.5 py-1.5 bg-expense text-white rounded-lg text-xs font-medium">
          <Plus size={14} /> New Order
        </button>
      </div>

      {showForm && (
        <div className="p-3 rounded-xl border border-hairline space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
          <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
            <option value="">Item to manufacture *</option>
            {(items ?? []).filter((i) => i.item_type === "good").map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} placeholder="Planned quantity *" type="number" className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          <select value={selectedBomId} onChange={(e) => setSelectedBomId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
            <option value="">Select BOM</option>
            {(boms ?? []).map((b) => <option key={b.id} value={b.id}>{b.finished_item?.name}</option>)}
          </select>
          <select value={outputGodownId} onChange={(e) => setOutputGodownId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
            <option value="">Output godown</option>
            {(godowns ? flattenGodowns(godowns) : []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => createMutation.mutate()} disabled={!selectedItemId || !plannedQty || createMutation.isPending} className="w-full py-1.5 bg-expense text-white rounded-lg text-xs font-medium disabled:opacity-50">
            {createMutation.isPending ? "Creating..." : "Create Order"}
          </button>
        </div>
      )}

      {filtered.map((order) => (
        <div key={order.id} className="p-3 rounded-xl border border-hairline">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{order.item?.name ?? "Unknown"}</span>
                {order.order_no && <span className="text-[10px] font-mono text-zinc-400">{order.order_no}</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-400">
                <span>Plan: {order.planned_qty}</span>
                <span>Produced: {order.produced_qty}</span>
                {order.godown && <span>→ {order.godown.name}</span>}
              </div>
            </div>
            <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", statusStyles[order.status] ?? "")}>
              {order.status.replace("_", " ")}
            </span>
          </div>
          {order.status === "planned" && (
            <div className="flex gap-1 mt-2">
              <button onClick={() => completeMutation.mutate(order)} className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded-lg text-[10px] font-medium">
                <CheckCircle2 size={12} /> Complete
              </button>
              <button onClick={() => cancelMutation.mutate(order.id)} className="flex items-center gap-1 px-2 py-1 bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-lg text-[10px] font-medium">
                <XCircle size={12} /> Cancel
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function JobWorkSection({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const { data: jobwork, isLoading } = useQuery({ queryKey: ["jobwork"], queryFn: fetchJobWork });
  const { data: items } = useQuery({ queryKey: ["items"], queryFn: fetchItems });
  const { data: godowns } = useQuery({ queryKey: ["godowns"], queryFn: fetchGodowns });
  const [showForm, setShowForm] = useState(false);
  const [jobType, setJobType] = useState<"principal" | "job_worker">("principal");
  const [partyName, setPartyName] = useState("");
  const [itemId, setItemId] = useState("");
  const [qtySent, setQtySent] = useState("1");
  const [challanNo, setChallanNo] = useState("");
  const [godownId, setGodownId] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createJobWork({
      job_type: jobType,
      party_account_id: partyName,
      item_id: itemId,
      quantity_sent: Number(qtySent),
      challan_no: challanNo || undefined,
      godown_id: godownId || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobwork"] });
      setShowForm(false);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) => updateJobWork(id, {
      quantity_received: qty,
      status: qty > 0 ? "completed" : "partially_received",
      date_received: new Date().toISOString().slice(0, 10),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobwork"] }),
  });

  const statusStyles: Record<string, string> = {
    sent: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    partially_received: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    completed: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    cancelled: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
  };

  function flattenGodowns(g: any[]): any[] {
    return g.flatMap((g) => [g, ...(g.children ? flattenGodowns(g.children) : [])]);
  }

  const filtered = (jobwork ?? []).filter((j) =>
    !search || j.item?.name?.toLowerCase().includes(search.toLowerCase()) || j.challan_no?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{filtered.length} entries</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-2.5 py-1.5 bg-expense text-white rounded-lg text-xs font-medium">
          <Plus size={14} /> New Job Work
        </button>
      </div>

      {showForm && (
        <div className="p-3 rounded-xl border border-hairline space-y-2 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex gap-2">
            <button onClick={() => setJobType("principal")} className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium border border-hairline transition-colors", jobType === "principal" ? "bg-expense text-white border-expense" : "bg-transparent")}>We send</button>
            <button onClick={() => setJobType("job_worker")} className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium border border-hairline transition-colors", jobType === "job_worker" ? "bg-expense text-white border-expense" : "bg-transparent")}>We receive</button>
          </div>
          <input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Party name *" className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
            <option value="">Item *</option>
            {(items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input value={qtySent} onChange={(e) => setQtySent(e.target.value)} placeholder="Qty sent" type="number" className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
            <input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="Challan #" className="flex-1 px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense" />
          </div>
          <select value={godownId} onChange={(e) => setGodownId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense">
            <option value="">Godown</option>
            {(godowns ? flattenGodowns(godowns) : []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => createMutation.mutate()} disabled={!partyName || !itemId || createMutation.isPending} className="w-full py-1.5 bg-expense text-white rounded-lg text-xs font-medium disabled:opacity-50">
            {createMutation.isPending ? "Creating..." : "Create Job Work"}
          </button>
        </div>
      )}

      {filtered.map((jw) => (
        <div key={jw.id} className="p-3 rounded-xl border border-hairline">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{jw.item?.name ?? "Unknown"}</span>
                {jw.challan_no && <span className="text-[10px] font-mono text-zinc-400">#{jw.challan_no}</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-400">
                <span className="capitalize">{jw.job_type.replace("_", " ")}</span>
                <span>Sent: {jw.quantity_sent}</span>
                <span>Rcvd: {jw.quantity_received}</span>
                {jw.party && <span>Party: {jw.party.name}</span>}
              </div>
            </div>
            <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", statusStyles[jw.status] ?? "")}>
              {jw.status.replace("_", " ")}
            </span>
          </div>
          {jw.status === "sent" && (
            <div className="mt-2">
              <button
                onClick={() => receiveMutation.mutate({ id: jw.id, qty: jw.quantity_sent })}
                className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded-lg text-[10px] font-medium"
              >
                <CheckCircle2 size={12} /> Receive All
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
