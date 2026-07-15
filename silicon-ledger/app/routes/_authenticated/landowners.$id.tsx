import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "~/lib/client";
import { formatCents, cn } from "~/lib/utils";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import type { Account } from "~/lib/types";

interface LandownerSchedule {
  id: string;
  landowner_id: string;
  due_date: string;
  amount_minor: number;
  status: "pending" | "paid" | "overdue" | "cancelled";
  paid_date?: string;
  notes?: string;
}

interface Landowner {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  contract_type: string;
  contract_start?: string;
  contract_end?: string;
  payment_frequency: string;
  payment_amount_minor: number;
  account_id?: string;
  notes?: string;
  is_active: boolean;
  parcel_details?: Record<string, unknown>;
  account?: Account;
}

const scheduleStatusColors: Record<string, string> = {
  pending: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  paid: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  overdue: "text-red-500 bg-red-50 dark:bg-red-900/20",
  cancelled: "text-zinc-400 bg-zinc-100 dark:bg-zinc-800",
};

export const Route = createFileRoute("/_authenticated/landowners/$id")({
  component: LandownerDetailPage,
});

function LandownerDetailPage() {
  const { id } = useParams({ from: "/_authenticated/landowners/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [showEdit, setShowEdit] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data: landownerData, isLoading } = useQuery({
    queryKey: ["landowner", id],
    queryFn: () => apiFetch<{ landowner: Landowner }>(`/api/landowners/${id}`),
  });

  const { data: schedulesData } = useQuery({
    queryKey: ["landowner-schedules", id],
    queryFn: () => apiFetch<{ schedules: LandownerSchedule[] }>(`/api/landowners/${id}/schedules`),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiFetch(`/api/landowners/${id}/generate-schedules`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["landowner-schedules", id] }); setError(""); },
    onError: (e) => setError(e.message),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: (scheduleId: string) => apiFetch(`/api/landowners/${id}/schedules/${scheduleId}/pay`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landowner-schedules", id] });
      queryClient.invalidateQueries({ queryKey: ["landowner", id] });
      setShowRecordPayment(null);
      setError("");
    },
    onError: (e) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (args: Record<string, unknown>) => apiFetch(`/api/landowners/${id}`, { method: "PATCH", body: JSON.stringify(args) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["landowner", id] }); setShowEdit(false); setError(""); },
    onError: (e) => setError(e.message),
  });

  if (isLoading) return <div className="p-4 text-sm text-zinc-400">Loading...</div>;
  if (!landownerData) return <div className="p-4 text-sm text-red-500">Landowner not found</div>;

  const lo = landownerData.landowner;
  const schedules = schedulesData?.schedules ?? [];

  const tabs = [
    { key: "overview", label: "Overview", active: tab === "overview", onClick: () => setTab("overview") },
    { key: "schedules", label: "Payment Schedule", active: tab === "schedules", onClick: () => setTab("schedules") },
    { key: "edit", label: "Edit", active: tab === "edit", onClick: () => setTab("edit") },
  ];

  return (
    <div className="p-4 max-w-lg mx-auto">
      <button onClick={() => navigate({ to: "/landowners" })} className="flex items-center gap-1 text-xs text-zinc-400 mb-3">
        <ChevronLeft size={14} /> Landowners
      </button>

      <div className="flex border-b border-hairline text-[11px] font-medium mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={t.onClick}
            className={cn(
              "flex-1 pb-2 border-b-2 transition-colors",
              t.active ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-zinc-400",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{lo.name}</h1>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", lo.is_active ? "bg-emerald-100 text-emerald-600" : "bg-zinc-100 text-zinc-400")}>
              {lo.is_active ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
              <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Contract Type</div>
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{lo.contract_type.replace(/_/g, " ")}</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
              <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Payment</div>
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{lo.payment_frequency}</div>
              <div className="font-mono text-[11px] text-zinc-500">{formatCents(lo.payment_amount_minor)}</div>
            </div>
          </div>

          <div className="space-y-2">
            {lo.contact_person && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Contact</span>
                <span className="text-zinc-700 dark:text-zinc-300">{lo.contact_person}</span>
              </div>
            )}
            {lo.email && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Email</span>
                <span className="text-zinc-700 dark:text-zinc-300">{lo.email}</span>
              </div>
            )}
            {lo.phone && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Phone</span>
                <span className="text-zinc-700 dark:text-zinc-300">{lo.phone}</span>
              </div>
            )}
            {lo.contract_start && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Start</span>
                <span className="text-zinc-700 dark:text-zinc-300">{lo.contract_start}</span>
              </div>
            )}
            {lo.contract_end && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">End</span>
                <span className="text-zinc-700 dark:text-zinc-300">{lo.contract_end}</span>
              </div>
            )}
            {lo.account && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Account</span>
                <span className="text-zinc-700 dark:text-zinc-300">{lo.account.name}</span>
              </div>
            )}
          </div>

          {lo.address && (
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium mb-1">Address</div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{lo.address}</p>
            </div>
          )}

          {lo.notes && (
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium mb-1">Notes</div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{lo.notes}</p>
            </div>
          )}

          {lo.parcel_details && Object.keys(lo.parcel_details).length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium mb-1">Parcel Details</div>
              <pre className="text-[10px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 overflow-x-auto">
                {JSON.stringify(lo.parcel_details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {tab === "schedules" && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">{schedules.length} schedules</span>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {generateMutation.isPending ? "Generating..." : "Generate Schedule"}
            </button>
          </div>

          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

          <div className="divide-y divide-hairline">
            {schedules.map((s) => (
              <div key={s.id} className="py-2.5 flex justify-between items-center">
                <div className="flex-1 min-w-0 mr-2">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">{s.due_date}</div>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", scheduleStatusColors[s.status] || "")}>
                    {s.status}
                  </span>
                  {s.paid_date && <span className="text-[10px] text-zinc-400 ml-1">Paid: {s.paid_date}</span>}
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{formatCents(s.amount_minor)}</div>
                  {s.status === "pending" && (
                    <button
                      onClick={() => setShowRecordPayment(s.id)}
                      className="text-[10px] text-indigo-500 font-medium"
                    >
                      Record Payment
                    </button>
                  )}
                </div>
              </div>
            ))}
            {schedules.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-8">No schedules yet. Generate one to begin.</p>
            )}
          </div>
        </div>
      )}

      {tab === "edit" && (
        <div className="pb-4">{/* Edit is handled via the sheet below */}</div>
      )}

      {showEdit && (
        <CreateLandownerEditSheet
          isOpen={showEdit}
          onClose={() => { setShowEdit(false); setError(""); }}
          initial={lo}
          onSubmit={(args) => updateMutation.mutate(args)}
          isPending={updateMutation.isPending}
          error={error}
        />
      )}

      <BottomSheet
        isOpen={!!showRecordPayment}
        onClose={() => setShowRecordPayment(null)}
        title="Record Payment"
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Confirm payment for this schedule?
          </p>
          <button
            onClick={() => showRecordPayment && recordPaymentMutation.mutate(showRecordPayment)}
            disabled={recordPaymentMutation.isPending}
            className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {recordPaymentMutation.isPending ? "Recording..." : "Confirm Payment"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function CreateLandownerEditSheet({ isOpen, onClose, initial, onSubmit, isPending, error }: {
  isOpen: boolean;
  onClose: () => void;
  initial: Landowner;
  onSubmit: (args: Record<string, unknown>) => void;
  isPending: boolean;
  error?: string;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [contact_person, setContactPerson] = useState(initial.contact_person ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [contract_type, setContractType] = useState(initial.contract_type ?? "lease");
  const [contract_start, setContractStart] = useState(initial.contract_start ?? "");
  const [contract_end, setContractEnd] = useState(initial.contract_end ?? "");
  const [payment_frequency, setPaymentFrequency] = useState(initial.payment_frequency ?? "monthly");
  const [payment_amount_minor, setPaymentAmountMinor] = useState(String(initial.payment_amount_minor));
  const [account_id, setAccountId] = useState(initial.account_id ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

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
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Edit Landowner">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Contact Person</label>
            <input value={contact_person} onChange={(e) => setContactPerson(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
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
            <input type="number" value={payment_amount_minor} onChange={(e) => setPaymentAmountMinor(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Account</label>
          <select value={account_id} onChange={(e) => setAccountId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">No account</option>
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
          {isPending ? "Saving..." : "Update Landowner"}
        </button>
      </div>
    </BottomSheet>
  );
}
