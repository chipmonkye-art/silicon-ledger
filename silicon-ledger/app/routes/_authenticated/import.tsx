import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { importExcel, fetchImportLogs, fetchAccounts } from "~/lib/api";
import { Button } from "~/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, Check, ArrowRight, Table, Clock, Download } from "lucide-react";
import type { ImportLog } from "~/lib/types";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

const COLUMN_KEYS = [
  { key: "account_column", label: "Account column", optional: false },
  { key: "amount_column", label: "Amount column", optional: false },
  { key: "type_column", label: "Type column (income/expense)", optional: true },
  { key: "date_column", label: "Date column", optional: true },
  { key: "description_column", label: "Description column", optional: true },
  { key: "bill_reference_column", label: "Bill Reference column", optional: true },
  { key: "category_column", label: "Category column", optional: true },
] as const;

function ImportPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "result">("upload");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string[]>([]);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  const { data: accData } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const { data: logData } = useQuery({
    queryKey: ["import-logs"],
    queryFn: () => fetchImportLogs(),
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStep("mapping");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").slice(0, 3);
      setPreview(lines);
    };
    reader.readAsText(f.slice(0, 4096));
  }

  function updateMapping(colKey: string, value: string) {
    setMapping((prev) => ({ ...prev, [colKey]: value }));
  }

  function autoDetect(headers: string[]) {
    const detected: Record<string, string> = {};
    for (const h of headers) {
      const hl = h.toLowerCase().replace(/^"/, "").replace(/"$/, "");
      if (hl.includes("account") || hl.includes("acct")) detected.account_column = h;
      else if (hl.includes("amount") || hl.includes("amt")) detected.amount_column = h;
      else if (hl.includes("type") || hl.includes("kind") || hl.includes("txn")) detected.type_column = h;
      else if (hl.includes("date") || hl.includes("occurred") || hl.includes("day")) detected.date_column = h;
      else if (hl.includes("desc") || hl.includes("note") || hl.includes("memo")) detected.description_column = h;
      else if (hl.includes("bill") || hl.includes("ref") || hl.includes("invoice")) detected.bill_reference_column = h;
      else if (hl.includes("category") || hl.includes("cat")) detected.category_column = h;
    }
    setMapping(detected);
  }

  useEffect(() => {
    if (preview.length > 0) {
      const headers = preview[0].split(",").map((h) => h.trim().replace(/^"/, "").replace(/"$/, ""));
      autoDetect(headers);
    }
  }, [preview]);

  const importMutation = useMutation({
    mutationFn: () => importExcel(file!, mapping),
    onSuccess: (data) => {
      setResult({ imported: data.imported, errors: data.errors ?? [] });
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["import-logs"] });
    },
  });

  const validMapping = COLUMN_KEYS.filter((c) => !c.optional).every((c) => mapping[c.key]?.trim());

  function reset() {
    setFile(null);
    setStep("upload");
    setMapping({});
    setPreview([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-xl font-bold">Import Data</h1>
        <p className="text-xs text-zinc-400 mt-1">Upload Excel or CSV files to bulk-create staged transactions</p>
      </div>

      {/* Upload / Mapping / Result */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-hairline rounded-xl p-12 text-center cursor-pointer hover:border-expense transition-colors"
          >
            <Upload size={40} className="mx-auto mb-3 text-zinc-400" />
            <p className="text-sm font-medium">Choose a file to import</p>
            <p className="text-xs text-zinc-400 mt-1">CSV or XLSX with transaction data</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Format Example</p>
            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 font-mono text-[10px] leading-relaxed">
              <p>account_id,amount_minor,type,occurred_on,description,bill_reference</p>
              <p className="text-zinc-500">abc123,5000,expense,2026-01-15,Office Supplies,INV-001</p>
              <p className="text-zinc-500">def456,15000,income,2026-01-16,Consulting Fee,INV-002</p>
            </div>
          </div>

          {/* Import History */}
          {logData?.logs && logData.logs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Recent Imports
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {logData.logs.slice(0, 10).map((log: ImportLog) => (
                  <div key={log.id} className="flex items-center gap-2 text-[11px] p-2 rounded bg-zinc-50 dark:bg-zinc-800">
                    <FileSpreadsheet size={12} className="text-zinc-400 shrink-0" />
                    <span className="truncate flex-1">{log.file_name}</span>
                    <span className="text-zinc-500">{log.imported_count}/{log.row_count} rows</span>
                    {log.error_count > 0 && <span className="text-red-500">{log.error_count} err</span>}
                    <span className="text-zinc-400">{new Date(log.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === "mapping" && file && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800">
            <FileSpreadsheet size={16} className="text-expense shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{file.name}</span>
            <span className="text-[10px] text-zinc-400 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
          </div>

          {preview.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Table size={10} /> Preview
              </p>
              <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2 font-mono text-[9px] leading-relaxed overflow-x-auto">
                {preview.map((line, i) => (
                  <p key={i} className={i === 0 ? "font-bold text-expense" : "text-zinc-500"}>
                    {line.slice(0, 300)}
                  </p>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs font-medium">Column Mapping</p>
          <div className="space-y-2">
            {COLUMN_KEYS.map((col) => (
              <div key={col.key} className="flex items-center gap-2">
                <span className="text-xs font-mono w-32 text-zinc-500 shrink-0">{col.label}</span>
                <ArrowRight size={12} className="text-zinc-300 shrink-0" />
                <input
                  value={mapping[col.key] ?? ""}
                  onChange={(e) => updateMapping(col.key, e.target.value)}
                  placeholder={col.optional ? "Optional" : "Required"}
                  className="flex-1 h-8 px-2 rounded border border-hairline bg-transparent text-xs font-mono focus:outline-none focus:ring-1 focus:ring-expense"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={reset}>Cancel</Button>
            <Button
              className="flex-1"
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={!validMapping || importMutation.isPending}
            >
              {importMutation.isPending ? "Importing..." : `Import ${file.name}`}
            </Button>
          </div>

          {importMutation.isError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{importMutation.error instanceof Error ? importMutation.error.message : "Import failed"}</span>
            </div>
          )}
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4">
          <div className="p-8 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-center">
            <Check size={36} className="mx-auto mb-2 text-green-500" />
            <p className="text-xl font-mono font-bold">{result.imported} rows imported</p>
            <p className="text-xs text-zinc-400 mt-1">All transactions created as staged entries — review and approve in Transactions</p>
          </div>

          {result.errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-red-500 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle size={10} /> {result.errors.length} errors
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-[10px] font-mono text-red-500 bg-red-50 dark:bg-red-900/20 rounded p-1">
                    {err}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Button className="w-full" onClick={reset}>Import Another File</Button>
          <Link to="/transactions" className="block">
            <Button variant="outline" className="w-full">Review Transactions</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
