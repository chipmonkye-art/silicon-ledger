import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useAuthStore, useSettingsStore, useWorkspaceStore, useI18nStore } from "~/lib/stores";
import { Button } from "~/components/ui/button";
import { Card, CardHeader, CardTitle } from "~/components/ui/card";
import { CategoryManager } from "~/components/CategoryManager";
import { RecurringManager } from "~/components/RecurringManager";
import { ExcelImport } from "~/components/ExcelImport";
import { refreshFxRates, exportAllData, importAllData, deleteAccount, fetchWorkspaceMembers, generateInviteCode, updateWorkspaceLanguage } from "~/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "~/lib/supabase";
import { t as i18n, SUPPORTED_LANGUAGES } from "~/lib/i18n";
import {
  LogOut, Tags, RotateCcw, RefreshCw, Sun, Moon, Monitor,
  Download, Upload, Trash2, Users, Copy, Check, UserPlus, Image, FileSpreadsheet, Languages,
} from "lucide-react";
import type { WorkspaceMember } from "~/lib/types";
import { apiFetch } from "~/lib/client";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const currencies = ["USD", "EUR", "GBP", "JPY", "NGN", "KES", "ZAR", "GHS"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((s) => s.clearSession);
  const { theme, firstDayOfWeek, setTheme, setFirstDayOfWeek } = useSettingsStore();
  const { workspaceId, workspaces, setWorkspace, setWorkspaces } = useWorkspaceStore();
  const [showCategories, setShowCategories] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [fxRefreshing, setFxRefreshing] = useState(false);
  const [fxResult, setFxResult] = useState("");
  const [importResult, setImportResult] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "staff">("staff");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  const { data: members } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => fetchWorkspaceMembers(workspaceId!).then((r) => r.members),
    enabled: !!workspaceId,
  });

  const themeOptions = [
    { value: "system" as const, label: "System", icon: Monitor },
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
  ];

  async function handleFxRefresh() {
    setFxRefreshing(true);
    setFxResult("");
    try {
      const count = await refreshFxRates();
      setFxResult(`${count} rates updated`);
    } catch (e) {
      setFxResult(e instanceof Error ? e.message : "Failed");
    } finally {
      setFxRefreshing(false);
    }
  }

  async function handleGenerateInvite() {
    if (!workspaceId) return;
    try {
      const { code } = await generateInviteCode(workspaceId, inviteRole);
      setInviteCode(code);
      setCopied(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate invite");
    }
  }

  async function copyInviteCode() {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `workspace-logos/${workspaceId}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      await apiFetch(`/api/workspaces/${workspaceId}/branding`, {
        method: "PATCH",
        body: JSON.stringify({ logo_url: urlData.publicUrl }),
      });
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Logo upload failed");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  }

  async function handleExport() {
    try {
      await exportAllData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult("");
    if (!window.confirm("Warning: This will replace ALL current data with the backup contents. Proceed?")) {
      e.target.value = "";
      return;
    }
    try {
      const result = await importAllData(file);
      setImportResult(`Imported: ${result.accounts} accounts, ${result.categories} categories, ${result.transactions} transactions`);
      queryClient.invalidateQueries();
    } catch (e) {
      setImportResult(e instanceof Error ? e.message : "Import failed");
    }
    e.target.value = "";
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await deleteAccount();
      clearSession();
      navigate({ to: "/auth/login" });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    clearSession();
    navigate({ to: "/auth/login" });
  }

  const currentWs = workspaces.find((w) => w.id === workspaceId);
  const isOwner = currentWs?.role === "owner";

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="pt-2 pb-1">
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Workspace Section */}
      <Card>
        <CardHeader>
          <CardTitle><Users size={14} className="inline mr-1.5" /> Workspace</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => setWorkspace(ws.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border border-hairline transition-colors ${
                  ws.id === workspaceId ? "bg-expense text-white border-expense" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                {ws.name}
                <span className="ml-1.5 text-[10px] opacity-70 capitalize">({ws.role})</span>
              </button>
            ))}
          </div>

          {members && members.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1.5">Members ({members.length})</p>
              <div className="space-y-1">
                {members.map((m: WorkspaceMember) => (
                  <div key={m.user_id} className="flex items-center justify-between px-2 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800">
                    <span className="text-xs font-mono truncate">{m.user_id.slice(0, 8)}...</span>
                    <span className="text-[10px] font-medium capitalize text-zinc-500">{m.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isOwner && (
            <div className="space-y-2 pt-1 border-t border-hairline">
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Invite Member</p>
              <div className="flex items-center gap-2">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "manager" | "staff")}
                  className="px-2 py-1.5 text-xs border border-hairline rounded-lg bg-transparent outline-none focus:border-expense"
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                </select>
                <Button variant="outline" size="sm" onClick={handleGenerateInvite}>
                  <UserPlus size={14} className="mr-1" />
                  Generate Code
                </Button>
              </div>
              {inviteCode && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1.5 text-xs font-mono bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-hairline select-all">
                    {inviteCode}
                  </code>
                  <button onClick={copyInviteCode} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors">
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle><Image size={14} className="inline mr-1.5" />Branding</CardTitle>
          </CardHeader>
          <div className="px-3 pb-3">
            <p className="text-xs text-zinc-400 mb-3">Upload a logo for branded invoice PDFs (PNG recommended).</p>
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoUpload} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
              <Upload size={14} className="mr-1.5" />
              {logoUploading ? "Uploading..." : "Upload Logo"}
            </Button>
          </div>
        </Card>
      )}

      {/* Language Switcher */}
      <Card>
        <CardHeader>
          <CardTitle><Languages size={14} className="inline mr-1.5" />Language / ভাষা</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border border-hairline transition-colors ${
                locale === lang.code
                  ? "bg-expense text-white border-expense"
                  : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              {lang.flag} {lang.native}
            </button>
          ))}
        </div>
        <div className="px-3 pb-3 mt-2">
          <p className="text-[10px] text-zinc-400">Interface language. Account/category aliases can be set per item.</p>
        </div>
      </Card>

      {/* Excel Import */}
      <Card>
        <CardHeader>
          <CardTitle><FileSpreadsheet size={14} className="inline mr-1.5" />{i18n("import.excel")}</CardTitle>
        </CardHeader>
        <div className="px-3 pb-3">
          <p className="text-xs text-zinc-400 mb-3">Bulk-import transactions from CSV with column mapping.</p>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload size={14} className="mr-1.5" />
            {i18n("import.excel")}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Base Currency</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {currencies.map((c) => (
            <button
              key={c}
              className="px-3 py-1.5 rounded-lg text-sm font-mono font-medium border border-hairline hover:border-expense transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exchange Rates</CardTitle>
        </CardHeader>
        <p className="text-sm text-zinc-400 mb-3">Fetch live rates from Frankfurter API (USD base).</p>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleFxRefresh} disabled={fxRefreshing}>
            <RefreshCw size={14} className={`mr-1.5 ${fxRefreshing ? "animate-spin" : ""}`} />
            {fxRefreshing ? "Refreshing..." : "Refresh Rates"}
          </Button>
          {fxResult && <span className="text-xs text-zinc-500">{fxResult}</span>}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <p className="text-sm text-zinc-400 mb-3">Manage your income and expense categories.</p>
        <Button variant="outline" size="sm" onClick={() => setShowCategories(true)}>
          <Tags size={14} className="mr-1.5" />
          Manage Categories
        </Button>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recurring</CardTitle>
        </CardHeader>
        <p className="text-sm text-zinc-400 mb-3">Schedule daily, weekly, monthly, or yearly transactions.</p>
        <Button variant="outline" size="sm" onClick={() => setShowRecurring(true)}>
          <RotateCcw size={14} className="mr-1.5" />
          Manage Recurring
        </Button>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <div className="flex gap-2">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-hairline transition-colors ${
                theme === opt.value ? "bg-expense text-white border-expense" : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              <opt.icon size={14} />
              {opt.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>First Day of Week</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-1">
          {DAY_NAMES.map((name, i) => (
            <button
              key={i}
              onClick={() => setFirstDayOfWeek(i)}
              className={`px-2 py-1 rounded text-xs font-medium border border-hairline transition-colors ${
                firstDayOfWeek === i ? "bg-expense text-white border-expense" : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup & Restore</CardTitle>
        </CardHeader>
        <p className="text-sm text-zinc-400 mb-3">Export all your data as JSON or restore from a backup.</p>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={14} className="mr-1.5" />
            Export All
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} className="mr-1.5" />
            Restore
          </Button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
        {importResult && <p className="text-xs text-zinc-500 mt-2">{importResult}</p>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
        </CardHeader>
        {!confirmDelete ? (
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} className="mr-1.5" />
            Delete Account
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-expense font-medium">This will permanently delete all your data and sign you out. This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleDeleteAccount} disabled={deleting}>
                {deleting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Button variant="ghost" className="w-full" onClick={handleLogout}>
        <LogOut size={16} className="mr-2" />
        Sign Out
      </Button>

      <CategoryManager isOpen={showCategories} onClose={() => setShowCategories(false)} />
      <RecurringManager isOpen={showRecurring} onClose={() => setShowRecurring(false)} />
      <ExcelImport isOpen={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
