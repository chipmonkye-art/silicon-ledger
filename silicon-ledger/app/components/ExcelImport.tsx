import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importExcel, fetchAccounts } from "~/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { t } from "~/lib/i18n";
import { Upload, FileSpreadsheet, AlertCircle, Check, ArrowRight, Table } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const COLUMN_KEYS = [
  { key: "account_column", label: "Account ID" },
  { key: "amount_column", label: "Amount (cents)" },
  { key: "type_column", label: "Type (income/expense/transfer)" },
  { key: "date_column", label: "Date (YYYY-MM-DD)" },
  { key: "description_column", label: "Description" },
  { key: "bill_reference_column", label: "Bill Reference (optional)" },
  { key: "category_column", label: "Category ID (optional)" },
] as const;

export function ExcelImport({ isOpen, onClose }: Props) {
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

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setStep("upload");
      setMapping({});
      setPreview([]);
      setResult(null);
    }
  }, [isOpen]);

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
      const hl = h.toLowerCase();
      if (hl.includes("account") || hl.includes("acct")) detected.account_column = h;
      else if (hl.includes("amount") || hl.includes("amt") || hl.includes("cents")) detected.amount_column = h;
      else if (hl.includes("type") || hl.includes("kind") || hl.includes("txn")) detected.type_column = h;
      else if (hl.includes("date") || hl.includes("occurred")) detected.date_column = h;
      else if (hl.includes("desc") || hl.includes("note") || hl.includes("memo")) detected.description_column = h;
      else if (hl.includes("bill") || hl.includes("ref") || hl.includes("invoice")) detected.bill_reference_column = h;
      else if (hl.includes("category") || hl.includes("cat")) detected.category_column = h;
    }
    setMapping(detected);
  }

  useEffect(() => {
    if (preview.length > 0) {
      const headers = preview[0]!.split(",").map((h) => h.trim().replace(/^"/, "").replace(/"$/, ""));
      autoDetect(headers);
    }
  }, [preview]);

  const importMutation = useMutation({
    mutationFn: () => importExcel(file!, mapping),
    onSuccess: (data) => {
      setResult({ imported: data.imported, errors: data.errors ?? [] });
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const validMapping = COLUMN_KEYS.filter((c) => !c.key.includes("optional"))
    .every((c) => mapping[c.key]?.trim());

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t("import.excel")}>
      <div className="space-y-4">
        {step === "upload" && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-hairline rounded-xl p-8 text-center cursor-pointer hover:border-expense transition-colors"
            >
              <Upload size={32} className="mx-auto mb-2 text-zinc-400" />
              <p className="text-sm font-medium">{t("import.excel")}</p>
              <p className="text-xs text-zinc-400 mt-1">CSV or XLSX with transaction data</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">CSV Format Example</p>
              <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 font-mono text-[10px] leading-relaxed">
                <p>account_id,amount_minor,type,occurred_on,description,bill_reference</p>
                <p className="text-zinc-500">abc123,5000,expense,2026-01-15,Office Supplies,INV-001</p>
                <p className="text-zinc-500">def456,15000,income,2026-01-16,Consulting Fee,INV-002</p>
              </div>
            </div>
          </div>
        )}

        {step === "mapping" && file && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-expense" />
              <span className="text-sm font-medium truncate flex-1">{file.name}</span>
              <span className="text-[10px] text-zinc-400 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
            </div>

            {/* Preview */}
            {preview.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <Table size={10} /> Preview
                </p>
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2 font-mono text-[9px] leading-relaxed overflow-x-auto">
                  {preview.map((line, i) => (
                    <p key={i} className={i === 0 ? "font-bold text-expense" : "text-zinc-500"}>
                      {line.slice(0, 200)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Column Mapping */}
            <p className="text-xs font-medium">{t("import.mapping")}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {COLUMN_KEYS.map((col) => (
                <div key={col.key} className="flex items-center gap-2">
                  <span className="text-xs font-mono w-36 text-zinc-500 shrink-0">{col.label}</span>
                  <ArrowRight size={12} className="text-zinc-300 shrink-0" />
                  <input
                    value={mapping[col.key] ?? ""}
                    onChange={(e) => updateMapping(col.key, e.target.value)}
                    placeholder={col.key.includes("optional") ? "Optional" : "Column header"}
                    className="flex-1 h-8 px-2 rounded border border-hairline bg-transparent text-xs font-mono focus:outline-none focus:ring-1 focus:ring-expense"
                  />
                </div>
              ))}
            </div>

            <Button
              className="w-full"
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={!validMapping || importMutation.isPending}
            >
              {importMutation.isPending ? "Importing..." : `Import ${file.name}`}
            </Button>

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
            <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-center">
              <Check size={32} className="mx-auto mb-2 text-green-500" />
              <p className="text-lg font-mono font-bold">{result.imported} rows imported</p>
              <p className="text-xs text-zinc-400 mt-1">Transactions created as staged entries</p>
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

            <Button className="w-full" variant="outline" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
