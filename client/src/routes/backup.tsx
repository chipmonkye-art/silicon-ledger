import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { backupApi } from "@/lib/api";

export default function BackupPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const exportMutation = useMutation({
    mutationFn: () => backupApi.export(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `silicon-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: "success", message: "Backup downloaded successfully" });
    },
    onError: () => setStatus({ type: "error", message: "Export failed" }),
  });

  const importMutation = useMutation({
    mutationFn: (data: unknown) => backupApi.import(data),
    onSuccess: (res) => setStatus({ type: "success", message: `Imported ${res.imported} records` }),
    onError: (err: Error) => setStatus({ type: "error", message: err.message }),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        importMutation.mutate(data);
      } catch {
        setStatus({ type: "error", message: "Invalid JSON file" });
      }
    };
    reader.readAsText(f);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <h1 className="text-2xl font-bold">Backup & Restore</h1>

      <Card className="border-neutral-100">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-neutral-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Export Data</h3>
              <p className="text-xs text-neutral-500 mt-1">Download all your accounts, transactions, projects, and settings as a JSON file.</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-8 text-xs rounded-lg border-neutral-200"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? "Exporting…" : "Download Backup"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-neutral-100">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5 text-neutral-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Import Data</h3>
              <p className="text-xs text-neutral-500 mt-1">Restore from a previous backup file. Existing records with the same ID will be skipped.</p>
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-8 text-xs rounded-lg border-neutral-200"
                onClick={() => fileRef.current?.click()}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? "Importing…" : "Select Backup File"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {status && (
        <div className={`flex items-center gap-2 text-xs p-3 rounded-xl ${status.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-expense"}`}>
          {status.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {status.message}
        </div>
      )}
    </div>
  );
}
