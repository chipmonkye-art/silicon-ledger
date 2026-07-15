import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { apiFetch } from "~/lib/client";
import { formatCents, cn } from "~/lib/utils";

interface PayrollGroup {
  id: string;
  name: string;
  description?: string;
  employee_count?: number;
  created_at: string;
}

interface PayrollEmployee {
  id: string;
  group_id: string;
  employee_code: string;
  employee_name: string;
  designation?: string;
  basic_pay_minor: number;
  allowances_minor: number;
  deductions_minor: number;
  net_pay_minor: number;
  bank_account?: string;
  pan_no?: string;
  is_active: boolean;
  group_name?: string;
}

interface PayrollRun {
  id: string;
  group_id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "approved" | "paid" | "cancelled";
  total_employees: number;
  total_gross_minor: number;
  total_deductions_minor: number;
  total_net_minor: number;
  group_name?: string;
}

const runStatusColors: Record<string, string> = {
  draft: "text-zinc-400 bg-zinc-100 dark:bg-zinc-800",
  approved: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  paid: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  cancelled: "text-red-400 bg-red-50 dark:bg-red-900/20",
};

export const Route = createFileRoute("/_authenticated/payroll")({
  component: PayrollPage,
});

function PayrollPage() {
  const [tab, setTab] = useState("groups");
  const [search, setSearch] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);
  const [showCreateRun, setShowCreateRun] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");

  const tabs = [
    { key: "groups", label: "Groups", active: tab === "groups", onClick: () => setTab("groups") },
    { key: "employees", label: "Employees", active: tab === "employees", onClick: () => setTab("employees") },
    { key: "payruns", label: "Pay Runs", active: tab === "payruns", onClick: () => setTab("payruns") },
  ];

  return (
    <>
      <div className="px-4 pt-4 pb-1">
        <h1 className="text-base font-bold text-zinc-800 dark:text-zinc-100 mb-2">Payroll</h1>
        <div className="flex border-b border-hairline text-[11px] font-medium mb-2">
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
      </div>

      {tab === "groups" && (
        <GroupsTab
          search={search}
          onSearchChange={setSearch}
          onShowCreate={() => setShowCreateGroup(true)}
        />
      )}

      {tab === "employees" && (
        <EmployeesTab
          search={search}
          onSearchChange={setSearch}
          groupFilter={groupFilter}
          onGroupFilterChange={setGroupFilter}
          onShowCreate={() => setShowCreateEmployee(true)}
        />
      )}

      {tab === "payruns" && (
        <PayRunsTab
          search={search}
          onSearchChange={setSearch}
          onShowCreate={() => setShowCreateRun(true)}
        />
      )}

      <CreateGroupSheet isOpen={showCreateGroup} onClose={() => setShowCreateGroup(false)} />
      <CreateEmployeeSheet isOpen={showCreateEmployee} onClose={() => setShowCreateEmployee(false)} />
      <CreatePayRunSheet isOpen={showCreateRun} onClose={() => setShowCreateRun(false)} />
    </>
  );
}

/* ── Groups Tab ── */

function GroupsTab({ search, onSearchChange, onShowCreate }: {
  search: string;
  onSearchChange: (v: string) => void;
  onShowCreate: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["payroll-groups"],
    queryFn: () => apiFetch<{ groups: PayrollGroup[] }>("/api/payroll/groups"),
  });
  const groups = data?.groups ?? [];

  const filtered = search
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;

  const columns = [
    { key: "name", label: "Group", grow: true },
    { key: "count", label: "Employees", align: "right" as const, width: "70px" },
  ];

  const rows = filtered.map((g) => ({
    id: g.id,
    cells: {
      name: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300">{g.name}</div>
          {g.description && <div className="text-[10px] text-zinc-400 truncate">{g.description}</div>}
        </div>
      ),
      count: (
        <span className="font-mono text-xs text-zinc-500">{g.employee_count ?? 0}</span>
      ),
    },
  }));

  return (
    <CompactList
      title=""
      columns={columns}
      rows={rows}
      searchable
      searchValue={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search groups..."
      actionLabel="New Group"
      onAction={onShowCreate}
    />
  );
}

/* ── Employees Tab ── */

function EmployeesTab({ search, onSearchChange, groupFilter, onGroupFilterChange, onShowCreate }: {
  search: string;
  onSearchChange: (v: string) => void;
  groupFilter: string;
  onGroupFilterChange: (v: string) => void;
  onShowCreate: () => void;
}) {
  const params = new URLSearchParams();
  if (groupFilter) params.set("group_id", groupFilter);
  const qs = params.toString();

  const { data } = useQuery({
    queryKey: ["payroll-employees", { groupFilter }],
    queryFn: () => apiFetch<{ employees: PayrollEmployee[] }>(`/api/payroll/employees${qs ? `?${qs}` : ""}`),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["payroll-groups"],
    queryFn: () => apiFetch<{ groups: PayrollGroup[] }>("/api/payroll/groups"),
  });

  const employees = data?.employees ?? [];
  const groups = groupsData?.groups ?? [];

  const filtered = search
    ? employees.filter((e) =>
        e.employee_name.toLowerCase().includes(search.toLowerCase()) ||
        e.employee_code.toLowerCase().includes(search.toLowerCase()),
      )
    : employees;

  const columns = [
    { key: "employee", label: "Employee", grow: true },
    { key: "net", label: "Net Pay", align: "right" as const, width: "80px" },
  ];

  const rows = filtered.map((e) => ({
    id: e.id,
    cells: {
      employee: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300">{e.employee_name}</div>
          <div className="text-[10px] text-zinc-400">
            <span className="font-mono">{e.employee_code}</span>
            {e.designation && <span> · {e.designation}</span>}
            {e.group_name && <span> · {e.group_name}</span>}
          </div>
        </div>
      ),
      net: (
        <div className="text-right">
          <div className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{formatCents(e.net_pay_minor)}</div>
          <div className="text-[9px] text-zinc-400">{formatCents(e.basic_pay_minor)} base</div>
        </div>
      ),
    },
  }));

  return (
    <>
      <div className="px-4 pb-2">
        <select value={groupFilter} onChange={(e) => onGroupFilterChange(e.target.value)}
          className="w-full h-8 px-2 rounded-lg border border-hairline bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      <CompactList
        title=""
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search employees..."
        actionLabel="New Employee"
        onAction={onShowCreate}
      />
    </>
  );
}

/* ── Pay Runs Tab ── */

function PayRunsTab({ search, onSearchChange, onShowCreate }: {
  search: string;
  onSearchChange: (v: string) => void;
  onShowCreate: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["payroll-runs"],
    queryFn: () => apiFetch<{ runs: PayrollRun[] }>("/api/payroll/runs"),
  });
  const runs = data?.runs ?? [];

  const filtered = search
    ? runs.filter((r) => r.group_name?.toLowerCase().includes(search.toLowerCase()) || r.period_start.includes(search))
    : runs;

  const approveMutation = useMutation({
    mutationFn: (runId: string) => apiFetch(`/api/payroll/runs/${runId}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payroll-runs"] }); setError(""); },
    onError: (e) => setError(e.message),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ runId, account_id }: { runId: string; account_id: string }) =>
      apiFetch(`/api/payroll/runs/${runId}/pay`, { method: "POST", body: JSON.stringify({ account_id }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payroll-runs"] }); setError(""); },
    onError: (e) => setError(e.message),
  });

  const columns = [
    { key: "run", label: "Run", grow: true },
    { key: "amount", label: "Total Net", align: "right" as const, width: "80px" },
    { key: "actions", label: "", width: "70px", align: "right" as const },
  ];

  const rows = filtered.map((r) => ({
    id: r.id,
    cells: {
      run: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300">{r.group_name || "Unknown group"}</div>
          <div className="text-[10px] text-zinc-400">
            {r.period_start} → {r.period_end}
          </div>
          <span className={cn("text-[9px] font-medium px-1 py-0.5 rounded", runStatusColors[r.status])}>
            {r.status}
          </span>
          <span className="text-[10px] text-zinc-400 ml-1">{r.total_employees} employees</span>
        </div>
      ),
      amount: (
        <div className="text-right">
          <div className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{formatCents(r.total_net_minor)}</div>
          <div className="text-[9px] text-zinc-400">{formatCents(r.total_gross_minor)} gross</div>
        </div>
      ),
      actions: (
        <div className="flex flex-col gap-1">
          {r.status === "draft" && (
            <button
              onClick={() => approveMutation.mutate(r.id)}
              className="text-[9px] text-indigo-500 font-medium"
            >
              Approve
            </button>
          )}
          {r.status === "approved" && (
            <button
              onClick={() => {
                const account_id = prompt("Enter account ID for payment:");
                if (account_id) markPaidMutation.mutate({ runId: r.id, account_id });
              }}
              className="text-[9px] text-emerald-500 font-medium"
            >
              Mark Paid
            </button>
          )}
        </div>
      ),
    },
  }));

  return (
    <CompactList
      title=""
      columns={columns}
      rows={rows}
      searchable
      searchValue={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search pay runs..."
      actionLabel="New Pay Run"
      onAction={onShowCreate}
    />
  );
}

/* ── Create Group Sheet ── */

function CreateGroupSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: (args: Record<string, unknown>) => apiFetch("/api/payroll/groups", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payroll-groups"] }); onClose(); setName(""); setDescription(""); },
  });

  function handleSubmit() {
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), description: description.trim() || undefined });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Payroll Group">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Group Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Farm Workers"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional"
            className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={handleSubmit} disabled={!name.trim() || createMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {createMutation.isPending ? "Creating..." : "Create Group"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ── Create Employee Sheet ── */

function CreateEmployeeSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [group_id, setGroupId] = useState("");
  const [employee_code, setEmployeeCode] = useState("");
  const [employee_name, setEmployeeName] = useState("");
  const [designation, setDesignation] = useState("");
  const [basic_pay_minor, setBasicPayMinor] = useState("");
  const [allowances_minor, setAllowancesMinor] = useState("");
  const [deductions_minor, setDeductionsMinor] = useState("");
  const [bank_account, setBankAccount] = useState("");
  const [pan_no, setPanNo] = useState("");

  const netPay = (parseInt(basic_pay_minor) || 0) + (parseInt(allowances_minor) || 0) - (parseInt(deductions_minor) || 0);

  const { data: groupsData } = useQuery({
    queryKey: ["payroll-groups"],
    queryFn: () => apiFetch<{ groups: PayrollGroup[] }>("/api/payroll/groups"),
  });
  const groups = groupsData?.groups ?? [];

  const createMutation = useMutation({
    mutationFn: (args: Record<string, unknown>) => apiFetch("/api/payroll/employees", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-employees"] });
      onClose();
      setGroupId(""); setEmployeeCode(""); setEmployeeName(""); setDesignation("");
      setBasicPayMinor(""); setAllowancesMinor(""); setDeductionsMinor("");
      setBankAccount(""); setPanNo("");
    },
  });

  function handleSubmit() {
    if (!employee_name.trim() || !employee_code.trim() || !group_id) return;
    createMutation.mutate({
      group_id,
      employee_code: employee_code.trim(),
      employee_name: employee_name.trim(),
      designation: designation.trim() || undefined,
      basic_pay_minor: parseInt(basic_pay_minor) || 0,
      allowances_minor: parseInt(allowances_minor) || 0,
      deductions_minor: parseInt(deductions_minor) || 0,
      net_pay_minor: netPay,
      bank_account: bank_account.trim() || undefined,
      pan_no: pan_no.trim() || undefined,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Employee">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Group</label>
          <select value={group_id} onChange={(e) => setGroupId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Employee Code</label>
            <input value={employee_code} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="EMP001"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Employee Name</label>
            <input value={employee_name} onChange={(e) => setEmployeeName(e.target.value)} placeholder="John Smith"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Designation</label>
          <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Farm Hand"
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Basic Pay (cents)</label>
            <input type="number" value={basic_pay_minor} onChange={(e) => setBasicPayMinor(e.target.value)} placeholder="500000"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Allowances (cents)</label>
            <input type="number" value={allowances_minor} onChange={(e) => setAllowancesMinor(e.target.value)} placeholder="100000"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Deductions (cents)</label>
            <input type="number" value={deductions_minor} onChange={(e) => setDeductionsMinor(e.target.value)} placeholder="50000"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 flex flex-col justify-end">
            <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Net Pay</div>
            <div className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">{formatCents(netPay)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Bank Account</label>
            <input value={bank_account} onChange={(e) => setBankAccount(e.target.value)} placeholder="Account no."
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">PAN No.</label>
            <input value={pan_no} onChange={(e) => setPanNo(e.target.value)} placeholder="ABCDE1234F"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={!employee_name.trim() || !employee_code.trim() || !group_id || createMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {createMutation.isPending ? "Creating..." : "Create Employee"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ── Create Pay Run Sheet ── */

function CreatePayRunSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [group_id, setGroupId] = useState("");
  const [period_start, setPeriodStart] = useState("");
  const [period_end, setPeriodEnd] = useState("");

  const { data: groupsData } = useQuery({
    queryKey: ["payroll-groups"],
    queryFn: () => apiFetch<{ groups: PayrollGroup[] }>("/api/payroll/groups"),
  });
  const groups = groupsData?.groups ?? [];

  const createMutation = useMutation({
    mutationFn: (args: Record<string, unknown>) => apiFetch("/api/payroll/runs", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      onClose();
      setGroupId(""); setPeriodStart(""); setPeriodEnd("");
    },
  });

  function handleSubmit() {
    if (!group_id || !period_start || !period_end) return;
    createMutation.mutate({ group_id, period_start, period_end });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="New Pay Run">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Group</label>
          <select value={group_id} onChange={(e) => setGroupId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Period Start</label>
            <input type="date" value={period_start} onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Period End</label>
            <input type="date" value={period_end} onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={!group_id || !period_start || !period_end || createMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {createMutation.isPending ? "Creating..." : "Create Pay Run"}
        </button>
      </div>
    </BottomSheet>
  );
}
