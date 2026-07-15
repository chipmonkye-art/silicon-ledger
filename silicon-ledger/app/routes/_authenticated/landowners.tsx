import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { apiFetch } from "~/lib/client";
import { formatCents, cn } from "~/lib/utils";
import type { Account } from "~/lib/types";

interface Landowner {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  contract_type: "lease" | "revenue_share" | "outright" | "easement" | "other";
  contract_start?: string;
  contract_end?: string;
  payment_frequency: "monthly" | "quarterly" | "yearly" | "lumpsum" | "custom";
  payment_amount_minor: number;
  account_id?: string;
  notes?: string;
  is_active: boolean;
  total_due_minor?: number;
  status?: string;
  account?: Account;
}

const contractTypeColors: Record<string, string> = {
  lease: "text-blue-500",
  revenue_share: "text-emerald-500",
  outright: "text-indigo-500",
  easement: "text-orange-500",
  other: "text-zinc-400",
};

export const Route = createFileRoute("/_authenticated/landowners")({
  component: LandownersPage,
});

function LandownersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["landowners"],
    queryFn: () => apiFetch<{ landowners: Landowner[] }>("/api/landowners"),
  });

  const landowners = data?.landowners ?? [];

  const filtered = landowners.filter((l) => {
    if (tab === "active" && !l.is_active) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return l.name.toLowerCase().includes(q) || l.contact_person?.toLowerCase().includes(q);
  });

  const createMutation = useMutation({
    mutationFn: (args: Record<string, unknown>) => apiFetch("/api/landowners", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["landowners"] }); setShowCreate(false); setError(""); },
    onError: (e) => setError(e.message),
  });

  const tabs = [
    { key: "active", label: "Active", active: tab === "active", onClick: () => setTab("active") },
    { key: "all", label: "All", active: tab === "all", onClick: () => setTab("all") },
  ];

  const columns = [
    { key: "landowner", label: "Landowner", grow: true },
    { key: "status", label: "Status", align: "right" as const, width: "80px" },
    { key: "amount", label: "Due", align: "right" as const, width: "80px" },
  ];

  const rows = filtered.map((l) => ({
    id: l.id,
    cells: {
      landowner: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300">{l.name}</div>
          <span className={cn("text-[10px] font-medium", contractTypeColors[l.contract_type] || "text-zinc-400")}>
            {l.contract_type.replace(/_/g, " ")}
          </span>
          {l.contact_person && <span className="text-[10px] text-zinc-400 ml-2">{l.contact_person}</span>}
        </div>
      ),
      status: (
        <span className={cn("text-[10px] font-medium", l.is_active ? "text-emerald-500" : "text-zinc-400")}>
          {l.is_active ? "Active" : "Inactive"}
        </span>
      ),
      amount: (
        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {l.total_due_minor != null ? formatCents(l.total_due_minor) : "—"}
        </span>
      ),
    },
  }));

  return (
    <>
      <CompactList
        title="Landowners"
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search landowners..."
        tabs={tabs}
        onRowClick={(id) => navigate({ to: `/landowners/${id}` })}
        actionLabel="New Landowner"
        onAction={() => setShowCreate(true)}
      />

      <CreateLandownerSheet
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setError(""); }}
        onSubmit={(args) => createMutation.mutate(args)}
        isPending={createMutation.isPending}
        error={error}
      />
    </>
  );
}

function CreateLandownerSheet({ isOpen, onClose, initial, onSubmit, isPending, error }: {
  isOpen: boolean;
  onClose: () => void;
  initial?: Landowner;
  onSubmit: (args: Record<string, unknown>) => void;
  isPending: boolean;
  error?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact_person, setContactPerson] = useState(initial?.contact_person ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [contract_type, setContractType] = useState<string>(initial?.contract_type ?? "lease");
  const [contract_start, setContractStart] = useState(initial?.contract_start ?? "");
  const [contract_end, setContractEnd] = useState(initial?.contract_end ?? "");
  const [payment_frequency, setPaymentFrequency] = useState<string>(initial?.payment_frequency ?? "monthly");
  const [payment_amount_minor, setPaymentAmountMinor] = useState(initial ? String(initial.payment_amount_minor) : "");
  const [account_id, setAccountId] = useState(initial?.account_id ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<{ accounts: Account[] }>("/api/accounts"),
  });
  const accounts = accountsData?.accounts ?? [];

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      contact_person: contact_person || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      contract_type,
      contract_start: contract_start || undefined,
      contract_end: contract_end || undefined,
      payment_frequency,
      payment_amount_minor: parseInt(payment_amount_minor) || 0,
      account_id: account_id || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={initial ? "Edit Landowner" : "Create Landowner"}>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Landowner name"
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
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="landowner@example.com"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Contract Type</label>
          <select value={contract_type} onChange={(e) => setContractType(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="lease">Lease</option>
            <option value="revenue_share">Revenue Share</option>
            <option value="outright">Outright</option>
            <option value="easement">Easement</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Contract Start</label>
            <input type="date" value={contract_start} onChange={(e) => setContractStart(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Contract End</label>
            <input type="date" value={contract_end} onChange={(e) => setContractEnd(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Payment Frequency</label>
            <select value={payment_frequency} onChange={(e) => setPaymentFrequency(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="lumpsum">Lump Sum</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Amount (cents)</label>
            <input type="number" value={payment_amount_minor} onChange={(e) => setPaymentAmountMinor(e.target.value)} placeholder="50000"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Account</label>
          <select value={account_id} onChange={(e) => setAccountId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">No account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Address</label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2}
            className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={handleSubmit} disabled={!name.trim() || isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {isPending ? "Saving..." : initial ? "Update Landowner" : "Create Landowner"}
        </button>
      </div>
    </BottomSheet>
  );
}
