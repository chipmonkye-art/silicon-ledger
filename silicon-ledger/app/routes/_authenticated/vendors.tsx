import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { fetchVendors, createVendor, updateVendor } from "~/lib/api";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import type { Vendor } from "~/lib/types";

export const Route = createFileRoute("/_authenticated/vendors")({
  component: VendorsPage,
});

function VendorsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);

  const { data } = useQuery({ queryKey: ["vendors"], queryFn: fetchVendors });
  const vendors = data?.vendors ?? [];

  const filtered = search
    ? vendors.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()) || v.email?.toLowerCase().includes(search.toLowerCase()))
    : vendors;

  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: createVendor,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); setShowCreate(false); setError(""); },
    onError: (e) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, args }: { id: string; args: Partial<Vendor> }) => updateVendor(id, args),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); setEditVendor(null); setError(""); },
    onError: (e) => setError(e.message),
  });

  const columns = [
    { key: "vendor", label: "Vendor", grow: true },
    { key: "contact", label: "Contact", width: "120px" },
  ];

  const rows = filtered.map((v) => ({
    id: v.id,
    cells: {
      vendor: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            {v.name}
            {!v.is_active && <span className="text-[9px] text-red-400">Inactive</span>}
          </div>
          {v.payment_terms && <div className="text-[10px] text-zinc-400">{v.payment_terms}</div>}
        </div>
      ),
      contact: (
        <div className="text-right text-[10px] text-zinc-400">
          {v.phone && <div>{v.phone}</div>}
          {v.email && <div className="truncate">{v.email}</div>}
        </div>
      ),
    },
  }));

  return (
    <>
      <CompactList
        title="Vendors"
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search vendors..."
        onRowClick={(id) => {
          const v = vendors.find((x) => x.id === id);
          if (v) setEditVendor(v);
        }}
        actionLabel="New Vendor"
        onAction={() => setShowCreate(true)}
      />

      {/* Create Vendor */}
      <VendorForm
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setError(""); }}
        onSubmit={(args) => createMutation.mutate(args)}
        isPending={createMutation.isPending}
        error={error}
      />

      {/* Edit Vendor */}
      {editVendor && (
        <VendorForm
          isOpen={!!editVendor}
          onClose={() => { setEditVendor(null); setError(""); }}
          initial={editVendor}
          onSubmit={(args) => updateMutation.mutate({ id: editVendor.id, args })}
          isPending={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

function VendorForm({ isOpen, onClose, initial, onSubmit, isPending, error }: {
  isOpen: boolean;
  onClose: () => void;
  initial?: Vendor;
  onSubmit: (args: { name: string; contact_person?: string; email?: string; phone?: string; address?: string; gst?: string; payment_terms?: string }) => void;
  isPending: boolean;
  error?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact_person, setContactPerson] = useState(initial?.contact_person ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [gst, setGst] = useState(initial?.gst ?? "");
  const [payment_terms, setPaymentTerms] = useState(initial?.payment_terms ?? "");

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      contact_person: contact_person || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      gst: gst || undefined,
      payment_terms: payment_terms || undefined,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={initial ? "Edit Vendor" : "New Vendor"}>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Contact Person</label>
            <input value={contact_person} onChange={(e) => setContactPerson(e.target.value)} placeholder="John Doe"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 234 567 890"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendor@example.com"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Payment Terms</label>
          <input value={payment_terms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Net 30"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">GST/VAT</label>
          <input value={gst} onChange={(e) => setGst(e.target.value)} placeholder="GSTIN"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Address</label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2}
            className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={handleSubmit} disabled={!name.trim() || isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {isPending ? "Saving..." : initial ? "Update Vendor" : "Create Vendor"}
        </button>
      </div>
    </BottomSheet>
  );
}
