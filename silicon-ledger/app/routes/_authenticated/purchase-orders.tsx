import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { fetchPurchaseOrders } from "~/lib/api";
import { formatCents, cn } from "~/lib/utils";
import { CreatePOSheet } from "~/components/CreatePOSheet";
import type { POStatus } from "~/lib/types";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  component: PurchaseOrdersPage,
});

const STATUS_COLORS: Record<POStatus, string> = {
  draft: "text-zinc-400",
  pending_approval: "text-amber-500",
  approved: "text-blue-500",
  ordered: "text-indigo-500",
  partially_received: "text-orange-500",
  fully_received: "text-emerald-500",
  cancelled: "text-red-400",
};

function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string>("open");
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", tab],
    queryFn: () => fetchPurchaseOrders({
      status: tab === "open" ? undefined : tab === "closed" ? "cancelled" : undefined,
    }),
  });

  const pos = data?.purchase_orders ?? [];

  const filtered = search
    ? pos.filter((po) => po.po_number.toLowerCase().includes(search.toLowerCase()) || po.vendor_name?.toLowerCase().includes(search.toLowerCase()))
    : pos;

  const tabs = [
    { key: "open", label: "Open", active: tab === "open", onClick: () => setTab("open") },
    { key: "all", label: "All", active: tab === "all", onClick: () => setTab("all") },
    { key: "closed", label: "Closed", active: tab === "closed", onClick: () => setTab("closed") },
  ];

  const columns = [
    { key: "po_number", label: "PO #", grow: true },
    { key: "amount", label: "Amount", align: "right" as const, width: "80px" },
  ];

  const rows = filtered.map((po) => ({
    id: po.id,
    cells: {
      po_number: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300">{po.po_number}</div>
          <div className="text-[10px] text-zinc-400">{po.vendor_name || "No vendor"}</div>
          <span className={cn("text-[10px] font-medium", STATUS_COLORS[po.status as POStatus])}>{po.status.replace(/_/g, " ")}</span>
        </div>
      ),
      amount: (
        <span className="font-mono text-zinc-600 dark:text-zinc-400">{formatCents(po.total_minor)}</span>
      ),
    },
  }));

  return (
    <>
      <CompactList
        title="Purchase Orders"
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search PO or vendor..."
        tabs={tabs}
        onRowClick={(id) => navigate({ to: `/purchase-orders/${id}` })}
        actionLabel="New PO"
        onAction={() => setShowCreate(true)}
      />
      <CreatePOSheet isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
