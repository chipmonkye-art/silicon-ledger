import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { createPurchaseOrder, fetchVendors } from "~/lib/api";
import { Plus, X } from "lucide-react";

interface CreatePOSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePOSheet({ isOpen, onClose }: CreatePOSheetProps) {
  const queryClient = useQueryClient();
  const [vendor_id, setVendorId] = useState("");
  const [expected_delivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Array<{ description: string; quantity: number; unit: string; unit_price_minor: number }>>([
    { description: "", quantity: 1, unit: "pcs", unit_price_minor: 0 },
  ]);

  const { data: vendorData } = useQuery({
    queryKey: ["vendors"],
    queryFn: fetchVendors,
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      onClose();
      resetForm();
    },
  });

  function resetForm() {
    setVendorId("");
    setExpectedDelivery("");
    setNotes("");
    setItems([{ description: "", quantity: 1, unit: "pcs", unit_price_minor: 0 }]);
  }

  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unit: "pcs", unit_price_minor: 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: string, value: string | number) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  function handleSubmit() {
    const validItems = items.filter((i) => i.description.trim() && i.unit_price_minor > 0);
    if (!validItems.length) return;
    createMutation.mutate({
      vendor_id: vendor_id || undefined,
      expected_delivery: expected_delivery || undefined,
      notes: notes || undefined,
      items: validItems,
    });
  }

  const total = items.reduce((s, i) => s + (i.quantity || 1) * (i.unit_price_minor || 0), 0);
  const isValid = items.some((i) => i.description.trim() && i.unit_price_minor > 0);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Purchase Order">
      <div className="space-y-3">
        {/* Vendor */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Vendor</label>
          <select value={vendor_id} onChange={(e) => setVendorId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select vendor...</option>
            {(vendorData?.vendors ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        {/* Expected Delivery */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Expected Delivery</label>
          <input type="date" value={expected_delivery} onChange={(e) => setExpectedDelivery(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Items</label>
            <button onClick={addItem} className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
              <Plus size={12} /> Add Item
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-start bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
                <div className="flex-1 space-y-1.5 min-w-0">
                  <input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)}
                    placeholder="Item description" className="w-full h-8 px-2 rounded border border-hairline bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  <div className="flex gap-1.5">
                    <input type="number" value={item.quantity || ""} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                      placeholder="Qty" className="w-16 h-8 px-2 rounded border border-hairline bg-transparent text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <select value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)}
                      className="h-8 px-2 rounded border border-hairline bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500">
                      <option value="pcs">pcs</option>
                      <option value="kg">kg</option>
                      <option value="m">m</option>
                      <option value="hr">hr</option>
                      <option value="box">box</option>
                      <option value="set">set</option>
                    </select>
                    <input type="number" value={item.unit_price_minor || ""} onChange={(e) => updateItem(idx, "unit_price_minor", parseInt(e.target.value) || 0)}
                      placeholder="Price (cents)" className="flex-1 h-8 px-2 rounded border border-hairline bg-transparent text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>
                {items.length > 1 && (
                  <button onClick={() => removeItem(idx)} className="p-1 mt-1 text-zinc-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
            className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {/* Total */}
        <div className="flex justify-between items-center py-2 border-t border-hairline">
          <span className="text-xs text-zinc-500">Total</span>
          <span className="font-mono text-sm font-bold">{(total / 100).toFixed(2)}</span>
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!isValid || createMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all">
          {createMutation.isPending ? "Creating..." : "Create Purchase Order"}
        </button>
      </div>
    </BottomSheet>
  );
}
