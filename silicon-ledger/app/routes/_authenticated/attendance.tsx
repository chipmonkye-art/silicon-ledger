import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CompactList } from "~/components/CompactList";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { apiFetch } from "~/lib/client";
import { formatCents, cn } from "~/lib/utils";

interface AttendanceRecord {
  id: string;
  employee_name: string;
  employee_code: string;
  attendance_date: string;
  status: "present" | "absent" | "half_day" | "overtime" | "holiday" | "leave";
  work_type: "regular" | "piece_work" | "contract" | "supervisor" | "other";
  hours_worked: number;
  piece_rate_minor: number;
  piece_quantity: number;
  wages_minor: number;
  notes?: string;
  hourly_rate_minor?: number;
}

interface AttendanceSummary {
  total_present: number;
  total_absent: number;
  total_wages_minor: number;
  total_records: number;
}

interface Project {
  id: string;
  name: string;
}

const statusColors: Record<string, string> = {
  present: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  absent: "text-red-500 bg-red-50 dark:bg-red-900/20",
  half_day: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  overtime: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  holiday: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
  leave: "text-zinc-400 bg-zinc-100 dark:bg-zinc-800",
};

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [error, setError] = useState("");

  const params = new URLSearchParams();
  if (dateFrom) params.set("from", dateFrom);
  if (dateTo) params.set("to", dateTo);
  if (projectId) params.set("project_id", projectId);
  const qs = params.toString();

  const { data: attendanceData } = useQuery({
    queryKey: ["attendance", { dateFrom, dateTo, projectId }],
    queryFn: () => apiFetch<{ attendance: AttendanceRecord[]; summary: AttendanceSummary }>(
      `/api/attendance${qs ? `?${qs}` : ""}`,
    ),
  });

  const { data: projectsData } = useQuery({
    queryKey: ["attendance-projects"],
    queryFn: () => apiFetch<{ projects: Project[] }>("/api/budgets/projects"),
  });

  const attendance = attendanceData?.attendance ?? [];
  const summary = attendanceData?.summary;
  const projects = projectsData?.projects ?? [];

  const filtered = search
    ? attendance.filter((a) =>
        a.employee_name.toLowerCase().includes(search.toLowerCase()) ||
        a.employee_code.toLowerCase().includes(search.toLowerCase()),
      )
    : attendance;

  const columns = [
    { key: "employee", label: "Employee", grow: true },
    { key: "status", label: "Status", width: "70px" },
    { key: "wages", label: "Wages", align: "right" as const, width: "80px" },
  ];

  const rows = filtered.map((a) => ({
    id: a.id,
    cells: {
      employee: (
        <div>
          <div className="font-medium text-zinc-700 dark:text-zinc-300">{a.employee_name}</div>
          <div className="text-[10px] text-zinc-400 font-mono">{a.employee_code} &middot; {a.attendance_date}</div>
        </div>
      ),
      status: (
        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block", statusColors[a.status])}>
          {a.status.replace(/_/g, " ")}
        </span>
      ),
      wages: (
        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{formatCents(a.wages_minor)}</span>
      ),
    },
  }));

  return (
    <>
      {/* Filters */}
      <div className="px-4 pt-4 pb-2 space-y-2">
        <h1 className="text-base font-bold text-zinc-800 dark:text-zinc-100">Attendance</h1>

        {summary && (
          <div className="grid grid-cols-3 gap-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
            <div className="text-center">
              <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Present</div>
              <div className="text-sm font-bold text-emerald-600">{summary.total_present}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Absent</div>
              <div className="text-sm font-bold text-red-500">{summary.total_absent}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Total Wages</div>
              <div className="text-sm font-bold font-mono text-zinc-700 dark:text-zinc-300">{formatCents(summary.total_wages_minor)}</div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 h-8 px-2 rounded-lg border border-hairline bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 h-8 px-2 rounded-lg border border-hairline bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            className="flex-1 h-8 px-2 rounded-lg border border-hairline bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <CompactList
        title=""
        columns={columns}
        rows={rows}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employee..."
        actionLabel="Record Attendance"
        onAction={() => setShowCreate(true)}
      />

      {/* Bulk Entry Button */}
      <div className="px-3 pb-3 -mt-2">
        <button
          onClick={() => setShowBulk(true)}
          className="w-full border border-hairline text-zinc-500 py-2 rounded-lg text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Bulk Entry
        </button>
      </div>

      <CreateAttendanceSheet
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setError(""); }}
        isPending={false}
        error={error}
      />

      <BulkAttendanceSheet
        isOpen={showBulk}
        onClose={() => { setShowBulk(false); setError(""); }}
      />
    </>
  );
}

function CreateAttendanceSheet({ isOpen, onClose, isPending, error }: {
  isOpen: boolean;
  onClose: () => void;
  isPending: boolean;
  error?: string;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [employee_name, setEmployeeName] = useState("");
  const [employee_code, setEmployeeCode] = useState("");
  const [attendance_date, setAttendanceDate] = useState(today);
  const [status, setStatus] = useState<string>("present");
  const [work_type, setWorkType] = useState<string>("regular");
  const [hours_worked, setHoursWorked] = useState("8");
  const [hourly_rate_minor, setHourlyRateMinor] = useState("");
  const [piece_rate_minor, setPieceRateMinor] = useState("");
  const [piece_quantity, setPieceQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const wageCalc = work_type === "piece_work"
    ? (parseInt(piece_rate_minor) || 0) * (parseInt(piece_quantity) || 0)
    : (parseInt(hourly_rate_minor) || 0) * (parseFloat(hours_worked) || 0);

  const createMutation = useMutation({
    mutationFn: (args: Record<string, unknown>) => apiFetch("/api/attendance", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      onClose();
      setEmployeeName(""); setEmployeeCode(""); setHoursWorked("8"); setHourlyRateMinor(""); setPieceRateMinor(""); setPieceQuantity(""); setNotes("");
    },
  });

  function handleSubmit() {
    if (!employee_name.trim() || !employee_code.trim()) return;
    createMutation.mutate({
      employee_name: employee_name.trim(),
      employee_code: employee_code.trim(),
      attendance_date,
      status,
      work_type,
      hours_worked: parseFloat(hours_worked) || 0,
      hourly_rate_minor: parseInt(hourly_rate_minor) || 0,
      piece_rate_minor: parseInt(piece_rate_minor) || 0,
      piece_quantity: parseInt(piece_quantity) || 0,
      wages_minor: wageCalc,
      notes: notes || undefined,
    });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Record Attendance">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Employee Name</label>
            <input value={employee_name} onChange={(e) => setEmployeeName(e.target.value)} placeholder="John Smith"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Code</label>
            <input value={employee_code} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="EMP001"
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Date</label>
          <input type="date" value={attendance_date} onChange={(e) => setAttendanceDate(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="half_day">Half Day</option>
              <option value="overtime">Overtime</option>
              <option value="holiday">Holiday</option>
              <option value="leave">Leave</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Work Type</label>
            <select value={work_type} onChange={(e) => setWorkType(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="regular">Regular</option>
              <option value="piece_work">Piece Work</option>
              <option value="contract">Contract</option>
              <option value="supervisor">Supervisor</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Hours Worked</label>
            <input type="number" step="0.5" value={hours_worked} onChange={(e) => setHoursWorked(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {work_type !== "piece_work" && (
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Hourly Rate (cents)</label>
              <input type="number" value={hourly_rate_minor} onChange={(e) => setHourlyRateMinor(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
        </div>
        {work_type === "piece_work" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Piece Rate (cents)</label>
              <input type="number" value={piece_rate_minor} onChange={(e) => setPieceRateMinor(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Quantity</label>
              <input type="number" value={piece_quantity} onChange={(e) => setPieceQuantity(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        )}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 flex justify-between">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Calculated Wages</span>
          <span className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">{formatCents(wageCalc)}</span>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={handleSubmit} disabled={!employee_name.trim() || !employee_code.trim() || createMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {createMutation.isPending ? "Saving..." : "Record Attendance"}
        </button>
      </div>
    </BottomSheet>
  );
}

function BulkAttendanceSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");

  const bulkMutation = useMutation({
    mutationFn: (args: { entries: string; format: string }) => apiFetch("/api/attendance/bulk", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["attendance"] }); setCsv(""); setError(""); onClose(); },
    onError: (e) => setError(e.message),
  });

  function handleSubmit() {
    if (!csv.trim()) return;
    bulkMutation.mutate({ entries: csv.trim(), format: "csv" });
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Bulk Attendance Entry">
      <div className="space-y-3">
        <p className="text-[11px] text-zinc-400">Enter one entry per line: <span className="font-mono">employee_name, employee_code, status, date</span></p>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} placeholder={`John Smith,EMP001,present,${new Date().toISOString().slice(0, 10)}\nJane Doe,EMP002,absent,${new Date().toISOString().slice(0, 10)}`}
          className="w-full p-3 rounded-lg border border-hairline bg-transparent text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={handleSubmit} disabled={!csv.trim() || bulkMutation.isPending}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] transition-all">
          {bulkMutation.isPending ? "Uploading..." : "Submit Bulk Entry"}
        </button>
      </div>
    </BottomSheet>
  );
}
