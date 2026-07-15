import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { fetchPurchaseOrder, receivePurchaseOrder } from "~/lib/api";
import { formatCents, cn } from "~/lib/utils";
import { ChevronLeft, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/purchase-orders/$id")({
  component: PurchaseOrderDetailPage,
});

function PurchaseOrderDetailPage() {
  const { id } = useParams({ from: "/_authenticated/purchase-orders/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [receiving, setReceiving] = useState(false);
  const [receiveItems, setReceiveItems] = useState<Record<string, { accepted: number; rejected: number; reason: string }>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => fetchPurchaseOrder(id),
  });

  const receiveMutation = useMutation({
    mutationFn: (args: { items: Array<{ po_item_id: string; quantity_accepted: number; quantity_rejected: number; rejection_reason?: string }> }) =>
      receivePurchaseOrder(id, { items: args.items.map((i) => ({ ...i, quantity_received: i.quantity_accepted + i.quantity_rejected })) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setReceiving(false);
    },
  });

  if (isLoading) return <div className="p-4 text-sm text-zinc-400">Loading...</div>;
  if (!data) return <div className="p-4 text-sm text-red-500">PO not found</div>;

  const { purchase_order: po, items, goods_receipts: receipts } = data;

  const statusColor: Record<string, string> = {
    draft: "text-zinc-400",
    pending_approval: "text-amber-500",
    approved: "text-blue-500",
    ordered: "text-indigo-500",
    partially_received: "text-orange-500",
    fully_received: "text-emerald-500",
    cancelled: "text-red-400",
  };

  const canReceive = po.status === "ordered" || po.status === "partially_received";

  function handleReceive() {
    const mappedItems = items.map((item) => ({
      po_item_id: item.id,
      quantity_accepted: receiveItems[item.id]?.accepted ?? item.quantity - item.received_qty,
      quantity_rejected: receiveItems[item.id]?.rejected ?? 0,
      rejection_reason: receiveItems[item.id]?.reason || undefined,
    }));
    receiveMutation.mutate({ items: mappedItems });
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Back */}
      <button onClick={() => navigate({ to: "/purchase-orders" })} className="flex items-center gap-1 text-xs text-zinc-400 mb-3">
        <ChevronLeft size={14} /> POs
      </button>

      {/* PO Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{po.po_number}</h1>
          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800", statusColor[po.status])}>
            {po.status.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-xs text-zinc-400">{po.vendor_name || "No vendor"}</p>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
          <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Total</div>
          <div className="font-mono text-sm font-bold text-zinc-800 dark:text-zinc-100">{formatCents(po.total_minor)}</div>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
          <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Ordered</div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">{po.order_date}</div>
          {po.expected_delivery && <div className="text-[10px] text-zinc-400">Due: {po.expected_delivery}</div>}
        </div>
      </div>

      {/* Line Items */}
      <div className="mb-4">
        <h2 className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-2">Items</h2>
        <div className="divide-y divide-hairline">
          {items.map((item) => (
            <div key={item.id} className="py-2">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 mr-2">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{item.description}</div>
                  <div className="text-[10px] text-zinc-400">
                    {item.quantity} × {formatCents(item.unit_price_minor)}/{item.unit}
                  </div>
                </div>
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatCents(item.total_minor)}</span>
              </div>
              {item.received_qty > 0 && (
                <div className="text-[10px] text-emerald-500 mt-0.5">Received: {item.received_qty}/{item.quantity}</div>
              )}

              {/* Receiving form */}
              {receiving && (
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <label className="text-[9px] text-zinc-400">Accepted</label>
                    <input
                      type="number"
                      defaultValue={item.quantity - item.received_qty}
                      onChange={(e) => setReceiveItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], accepted: parseInt(e.target.value) || 0 } }))}
                      className="w-full bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] text-zinc-400">Rejected</label>
                    <input
                      type="number"
                      defaultValue={0}
                      onChange={(e) => setReceiveItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], rejected: parseInt(e.target.value) || 0 } }))}
                      className="w-full bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-1 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Goods Receipts */}
      {receipts.length > 0 && (
        <div className="mb-4">
          <h2 className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-2">Goods Receipts</h2>
          <div className="divide-y divide-hairline">
            {receipts.map((gr) => (
              <div key={gr.id} className="py-2 flex justify-between">
                <div>
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{gr.gr_number}</div>
                  <div className="text-[10px] text-zinc-400">{gr.received_date}</div>
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  gr.status === "complete" && "text-emerald-500",
                  gr.status === "partial" && "text-orange-500",
                  gr.status === "over_received" && "text-red-500",
                )}>
                  {gr.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {canReceive && !receiving && (
          <button onClick={() => setReceiving(true)} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-full text-[13px] font-bold">
            Receive Goods
          </button>
        )}
        {receiving && (
          <>
            <button onClick={() => setReceiving(false)} className="flex-1 bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 py-2.5 rounded-full text-[13px] font-bold">
              Cancel
            </button>
            <button onClick={handleReceive} disabled={receiveMutation.isPending} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-full text-[13px] font-bold">
              {receiveMutation.isPending ? "Saving..." : "Confirm Receipt"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
