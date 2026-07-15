import { supabase } from "./supabase";
import { apiFetch } from "./client";
import type { Account, AccountSummary, Transaction, Category, Workspace, WorkspaceMember, ImportLog, Item, ItemUOM, ItemBatch, Godown, StockLedgerEntry, StockBalance, BOM, ManufacturingOrder, ManufacturingConsumption, ManufacturingOutput, JobWork, PurchaseOrder, POItem, GoodsReceipt, GRItem, Vendor, Budget, CostCenter, AlertRule, Alert, Project, MonthlySummary } from "./types";
import { useWorkspaceStore } from "./stores";

// ── Seed ──

export async function seedUserData(): Promise<void> {
  const { error } = await supabase.rpc("seed_user_data");
  if (error) throw error;
}

// ── Accounts ──

export async function createAccount(args: {
  name: string;
  name_bn?: string;
  name_alias?: string;
  type: "cash" | "bank" | "credit_card" | "ewallet" | "custom";
  currency: string;
  opening_balance: number;
  include_in_assets?: boolean;
  icon?: string;
  color?: string;
  credit_limit?: number;
  credit_limit_type?: "soft" | "hard";
}) {
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      name: args.name,
      name_bn: args.name_bn ?? null,
      name_alias: args.name_alias ?? null,
      type: args.type,
      currency: args.currency,
      opening_balance: args.opening_balance,
      include_in_assets: args.include_in_assets ?? true,
      icon: args.icon ?? "wallet",
      color: args.color ?? "#1a1a1a",
      credit_limit: args.credit_limit ?? null,
      credit_limit_type: args.credit_limit_type ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAccount(id: string, args: Partial<{
  name: string;
  type: string;
  currency: string;
  opening_balance: number;
  include_in_assets: boolean;
  icon: string;
  color: string;
  archived_at: string | null;
}>) {
  const { error } = await supabase
    .from("accounts")
    .update(args)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
}

export async function fetchAccounts(): Promise<{ accounts: Account[]; summary: AccountSummary }> {
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("*")
    .is("archived_at", null)
    .order("type")
    .order("name");

  if (error) throw error;

  const { data: balances } = await supabase
    .from("account_balances")
    .select("account_id, current_balance");

  const balanceMap: Record<string, number> = {};
  for (const b of balances ?? []) {
    balanceMap[b.account_id] = Number(b.current_balance);
  }

  const enriched = accounts.map((a) => ({
    ...a,
    current_balance: balanceMap[a.id] ?? a.opening_balance,
  }));

  const totalAssets = enriched
    .filter((a: Account) => a.include_in_assets && a.type !== "credit_card")
    .reduce((s: number, a: Account) => s + (a.current_balance ?? 0), 0);
  const totalLiabilities = enriched
    .filter((a: Account) => a.type === "credit_card")
    .reduce((s: number, a: Account) => s + Math.abs(a.current_balance ?? 0), 0);

  return { accounts: enriched, summary: { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities } };
}

// ── Categories ──

export async function createCategory(args: { name: string; kind: "income" | "expense"; parent_id?: string }) {
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: args.name, kind: args.kind, parent_id: args.parent_id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, args: { name?: string; kind?: string }) {
  const { error } = await supabase.from("categories").update(args).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

// ── Transactions ──

export interface TransactionFilter {
  account_id?: string;
  category_id?: string;
  txn_type?: string;
  is_staged?: boolean;
  is_rejected?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function fetchTransactions(filter: TransactionFilter = {}): Promise<{ transactions: Transaction[]; total: number }> {
  let query = supabase
    .from("transactions")
    .select("*, account:account_id(name), category:category_id(name), to_account:to_account_id(name)", { count: "exact" });

  if (filter.account_id) {
    query = query.or(`account_id.eq.${filter.account_id},to_account_id.eq.${filter.account_id}`);
  }
  if (filter.category_id) query = query.eq("category_id", filter.category_id);
  if (filter.txn_type) query = query.eq("txn_type", filter.txn_type);
  if (filter.is_staged !== undefined) query = query.eq("is_staged", filter.is_staged);
  if (filter.is_rejected !== undefined) query = query.eq("is_rejected", filter.is_rejected);
  if (filter.search) {
    query = query.or(`description.ilike.%${filter.search}%,note.ilike.%${filter.search}%`);
  }

  const { data, error, count } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50) - 1);

  if (error) throw error;
  return { transactions: data ?? [], total: count ?? 0 };
}

export async function createTransaction(args: {
  account_id: string;
  to_account_id?: string;
  category_id?: string;
  txn_type: "income" | "expense" | "transfer";
  amount_minor: number;
  currency?: string;
  occurred_on: string;
  description: string;
  note?: string;
  bill_reference?: string;
  due_date?: string;
  is_msme_record?: boolean;
  msme_credit_days?: number;
}) {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...args,
      to_account_id: args.txn_type === "transfer" ? args.to_account_id : null,
      category_id: args.txn_type !== "transfer" ? args.category_id : null,
      is_staged: true,
      currency: args.currency ?? "BDT",
      note: args.note ?? "",
      bill_reference: args.bill_reference ?? null,
      due_date: args.due_date ?? null,
      is_msme_record: args.is_msme_record ?? false,
      msme_credit_days: args.msme_credit_days ?? null,
      payment_status: args.due_date ? "unpaid" : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveTransaction(id: string) {
  const { error } = await supabase
    .from("transactions")
    .update({ is_staged: false })
    .eq("id", id)
    .eq("is_staged", true);
  if (error) throw error;
}

export async function rejectTransaction(id: string, note?: string) {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("transactions")
    .update({
      is_staged: false,
      is_rejected: true,
      rejection_note: note ?? "Sent back for correction",
      rejected_by: user.user?.id ?? null,
    })
    .eq("id", id)
    .eq("is_staged", true);
  if (error) throw error;
}

export async function approveTransactionFull(id: string) {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("transactions")
    .update({
      is_staged: false,
      approved_by: user.user?.id ?? null,
    })
    .eq("id", id)
    .eq("is_staged", true);
  if (error) throw error;
}

export async function rejectWithNote(id: string, note: string) {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("transactions")
    .update({
      is_staged: false,
      is_rejected: true,
      rejection_note: note,
      rejected_by: user.user?.id ?? null,
    })
    .eq("id", id)
    .eq("is_staged", true);
  if (error) throw error;
}

export async function resubmitTransaction(id: string, updates?: {
  amount_minor?: number;
  description?: string;
  category_id?: string;
  note?: string;
}) {
  const payload: Record<string, unknown> = {
    is_staged: true,
    is_rejected: false,
    rejection_note: null,
  };
  if (updates?.amount_minor !== undefined) payload.amount_minor = updates.amount_minor;
  if (updates?.description !== undefined) payload.description = updates.description;
  if (updates?.category_id !== undefined) payload.category_id = updates.category_id;
  if (updates?.note !== undefined) payload.note = updates.note;

  const { error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", id)
    .eq("is_rejected", true);
  if (error) throw error;
}

export async function bulkApproveTransactions(ids: string[]) {
  const { error } = await supabase
    .from("transactions")
    .update({ is_staged: false })
    .in("id", ids)
    .eq("is_staged", true);
  if (error) throw error;
}

export async function bulkRejectTransactions(ids: string[]) {
  const { error } = await supabase
    .from("transactions")
    .update({ is_staged: false, is_rejected: true, rejection_note: "Incomplete data — please review" })
    .in("id", ids)
    .eq("is_staged", true);
  if (error) throw error;
}

// ── Recurring ──

export async function fetchRecurring() {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("*, account:account_id(name), to_account:to_account_id(name), category:category_id(name)")
    .order("start_date");
  if (error) throw error;
  return data ?? [];
}

export async function createRecurring(args: {
  account_id: string;
  to_account_id?: string;
  category_id?: string;
  txn_type: string;
  amount_minor: number;
  currency?: string;
  description?: string;
  note?: string;
  interval_type: string;
  interval_days?: number;
  start_date: string;
  end_date?: string;
  occurrences_remaining?: number;
}) {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .insert(args)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function generateRecurring() {
  const { error } = await supabase.rpc("generate_recurring_transactions");
  if (error) throw error;
}

export async function toggleRecurring(id: string, is_active: boolean) {
  const { error } = await supabase
    .from("recurring_transactions")
    .update({ is_active })
    .eq("id", id);
  if (error) throw error;
}

export async function updateRecurring(id: string, args: Partial<{
  amount_minor: number;
  description: string;
  category_id: string;
  account_id: string;
  to_account_id: string;
  interval_type: string;
  interval_days: number;
  end_date: string;
  occurrences_remaining: number;
  is_active: boolean;
}>) {
  const { error } = await supabase.from("recurring_transactions").update(args).eq("id", id);
  if (error) throw error;
}

export async function deleteRecurring(id: string) {
  const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteRecurringWithStaged(id: string) {
  const { error: e1 } = await supabase
    .from("transactions")
    .delete()
    .eq("recurring_id", id)
    .eq("is_staged", true);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("recurring_transactions").delete().eq("id", id);
  if (e2) throw e2;
}

// ── Calendar ──

export async function fetchCalendarMonth(month: string) {
  const year = parseInt(month.slice(0, 4));
  const monthNum = parseInt(month.slice(5, 7));
  const startDate = `${month}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("transactions")
    .select("*, account:account_id(name), category:category_id(name), to_account:to_account_id(name)")
    .eq("is_staged", false)
    .gte("occurred_on", startDate)
    .lte("occurred_on", endDate)
    .order("occurred_on")
    .order("created_at");

  if (error) throw error;

  const dayMap: Record<string, { income: number; expense: number; transactions: Transaction[] }> = {};
  for (const t of data ?? []) {
    const d = t.occurred_on;
    if (!dayMap[d]) dayMap[d] = { income: 0, expense: 0, transactions: [] };
    if (t.txn_type === "income") dayMap[d].income += t.amount_minor;
    if (t.txn_type === "expense") dayMap[d].expense += t.amount_minor;
    dayMap[d].transactions.push(t as Transaction);
  }

  const days = Object.entries(dayMap).map(([date, vals]) => ({ date, ...vals }));
  const totalIncome = days.reduce((s, d) => s + d.income, 0);
  const totalExpense = days.reduce((s, d) => s + d.expense, 0);

  const { data: balances } = await supabase
    .from("account_balances")
    .select("current_balance")
    .eq("include_in_assets", true)
    .neq("account_type", "credit_card");

  const currentNetWorth = (balances ?? []).reduce((s, b) => s + Number(b.current_balance), 0);
  const carryover = currentNetWorth - totalIncome + totalExpense;

  return { days, carryover, income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense };
}

// ── Analytics ──

export async function fetchCategoryBreakdown(month?: string) {
  let query = supabase
    .from("transactions")
    .select("amount_minor, txn_type, category:category_id(name, id)")
    .eq("is_staged", false)
    .neq("txn_type", "transfer");

  if (month) {
    const year = parseInt(month.slice(0, 4));
    const monthNum = parseInt(month.slice(5, 7));
    query = query
      .gte("occurred_on", `${month}-01`)
      .lte("occurred_on", new Date(year, monthNum, 0).toISOString().slice(0, 10));
  }

  const { data, error } = await query;
  if (error) throw error;

  const map: Record<string, { name: string; amount: number }> = {};
  for (const row of data ?? []) {
    const cat = row.category as { name: string; id: string } | null;
    if (!cat) continue;
    if (!map[cat.id]) map[cat.id] = { name: cat.name, amount: 0 };
    map[cat.id].amount += row.amount_minor;
  }

  return Object.values(map).sort((a, b) => b.amount - a.amount);
}

export async function fetchSummary(): Promise<MonthlySummary[]> {
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const { data, error } = await supabase
    .from("transactions")
    .select("amount_minor, txn_type, occurred_on")
    .eq("is_staged", false)
    .neq("txn_type", "transfer")
    .gte("occurred_on", twelveMonthsAgo.toISOString().slice(0, 10));

  if (error) throw error;

  const monthMap: Record<string, { income: number; expense: number }> = {};
  for (const row of data ?? []) {
    const m = row.occurred_on.slice(0, 7);
    if (!monthMap[m]) monthMap[m] = { income: 0, expense: 0 };
    if (row.txn_type === "income") monthMap[m].income += row.amount_minor;
    if (row.txn_type === "expense") monthMap[m].expense += row.amount_minor;
  }

  return Object.entries(monthMap)
    .map(([month, vals]) => ({ month, ...vals, balance: vals.income - vals.expense }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ── CSV Export ──

export async function fetchAllTransactionsForExport(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, account:account_id(name), category:category_id(name), to_account:to_account_id(name)")
    .order("occurred_on", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function downloadCSV(transactions: Transaction[]) {
  const header = "Date,Description,Type,Category,Account,Amount,Currency,Staged,Note";
  const rows = transactions.map((t) =>
    [
      t.occurred_on,
      `"${t.description.replace(/"/g, '""')}"`,
      t.txn_type,
      (t.category as { name?: string })?.name ?? "",
      (t.account as { name?: string })?.name ?? "",
      t.txn_type === "expense" ? -t.amount_minor : t.amount_minor,
      t.currency,
      t.is_staged ? "Yes" : "No",
      `"${t.note.replace(/"/g, '""')}"`,
    ].join(","),
  ).join("\n");

  const bom = "\uFEFF";
  const blob = new Blob([bom + header + "\n" + rows], { type: "text/csv;charset=utf-8;", endings: "native" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `silicon-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── JSON Backup & Restore ──

export async function exportAllData() {
  const exportData: Record<string, unknown[]> = {};

  for (const table of ["profiles", "accounts", "categories", "transactions", "recurring_transactions"] as const) {
    const { data } = await supabase.from(table).select("*");
    exportData[table] = data ?? [];
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `silicon-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importAllData(file: File) {
  const text = await file.text();
  const data = JSON.parse(text);

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const counts: Record<string, number> = {};

  for (const table of ["categories", "accounts", "transactions", "recurring_transactions"] as const) {
    const rows = data[table];
    if (!rows?.length) continue;
    let inserted = 0;
    for (const row of rows) {
      row.user_id = userId;
      delete row.id;
      const { error } = await supabase.from(table).insert(row);
      if (!error) inserted++;
    }
    counts[table] = inserted;
  }

  return counts as unknown as { accounts: number; categories: number; transactions: number };
}

export async function deleteAccount() {
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error("Not authenticated");

  for (const table of ["transactions", "recurring_transactions", "accounts", "categories"] as const) {
    await supabase.from(table).delete().eq("user_id", uid);
  }
  await supabase.from("profiles").delete().eq("id", uid);
  await supabase.auth.admin.deleteUser(uid);
  await supabase.auth.signOut();
}

// ── FX Rates ──

export async function fetchFxRates(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("fx_rates").select("quote_currency, rate");
  if (error) throw error;
  const rates: Record<string, number> = { USD: 1 };
  for (const r of data ?? []) rates[r.quote_currency] = Number(r.rate);
  return rates;
}

export async function refreshFxRates(): Promise<number> {
  const resp = await fetch("https://api.frankfurter.dev/latest?base=USD");
  if (!resp.ok) throw new Error("FX API unavailable");
  const json = await resp.json();
  const rates = json.rates as Record<string, number>;

  let count = 0;
  for (const [quote, rate] of Object.entries(rates)) {
    const { error } = await supabase
      .from("fx_rates")
      .upsert({ quote_currency: quote, base_currency: "USD", rate, updated_at: new Date().toISOString() },
        { onConflict: "quote_currency, base_currency" });
    if (!error) count++;
  }
  return count;
}

// ── Workspaces (via server API) ──

export async function fetchWorkspaces(): Promise<Workspace[]> {
  return apiFetch("/api/workspaces");
}

export async function createWorkspace(name: string): Promise<Workspace> {
  return apiFetch("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function fetchWorkspace(id: string): Promise<Workspace> {
  return apiFetch(`/api/workspaces/${id}`);
}

export async function updateWorkspace(id: string, name: string): Promise<Workspace> {
  return apiFetch(`/api/workspaces/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function fetchWorkspaceMembers(id: string): Promise<{ members: WorkspaceMember[] }> {
  return apiFetch(`/api/workspaces/${id}/members`);
}

export async function generateInviteCode(workspaceId: string, role: "owner" | "manager" | "staff") {
  return apiFetch<{ code: string }>(`/api/workspaces/${workspaceId}/generate-invite`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export async function acceptInvite(code: string): Promise<{ workspace: Workspace }> {
  return apiFetch("/api/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

// ── Audit ──

export async function fetchAuditLog(params?: {
  action?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (params?.action) q.set("action", params.action);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const s = q.toString();
  return apiFetch(`/api/audit/transactions${s ? `?${s}` : ""}`);
}

export async function fetchTransactionAudit(id: string) {
  return apiFetch(`/api/audit/transactions/${id}`);
}

export async function fetchAuditSummary() {
  return apiFetch("/api/audit/summary");
}

// ── Aging & Performance ──

export async function fetchAging() {
  return apiFetch<{ aging: Array<{ bucket: string; count: number; total_remaining: number }> }>("/api/reports/aging");
}

export async function fetchPaymentPerformance() {
  return apiFetch<{ approved_count: number; rejected_count: number; avg_approval_hours: number; overdue_count: number }>("/api/reports/payment-performance");
}

export async function fetchCreditUtilization() {
  return apiFetch<{ accounts: Array<{ name: string; usage_pct: number; credit_remaining: number; is_over_limit: boolean; current_balance: number; credit_limit: number }> }>("/api/reports/credit-utilization");
}

export async function fetchAgingByAccount(accountId: string) {
  return apiFetch(`/api/reports/aging/${accountId}`);
}

// ── Invoice Export ──

export async function downloadInvoicePdf(month?: string) {
  const m = month || new Date().toISOString().slice(0, 7);
  const blob = await apiFetch<Blob>(`/api/invoices/export?month=${m}`, { raw: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${m}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadBrandedInvoicePdf(month?: string) {
  const m = month || new Date().toISOString().slice(0, 7);
  const wsId = useWorkspaceStore.getState().workspaceId;
  const blob = await apiFetch<Blob>(`/api/invoices/branded-export?month=${m}&workspace_id=${wsId}`, { raw: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `branded-invoice-${m}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Excel Import ──

export async function importExcel(file: File, mapping: Record<string, string>) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mapping", JSON.stringify(mapping));
  return apiFetch<{ imported: number; errors: string[]; import_id: string }>("/api/import/excel", {
    method: "POST",
    body: formData,
    headers: {}, // let browser set content-type for FormData
  });
}

export async function fetchImportLogs() {
  return apiFetch<{ logs: ImportLog[] }>("/api/import/logs");
}

// ── Multi-language ──

export async function updateAlias(table: "accounts" | "categories", id: string, alias: string, lang: "bn" | "alias") {
  const field = lang === "bn" ? "name_bn" : "name_alias";
  return apiFetch(`/api/${table}/${id}/alias`, {
    method: "PATCH",
    body: JSON.stringify({ field, value: alias }),
  });
}

export async function fetchWorkspaceLanguageConfig(workspaceId: string) {
  return apiFetch<{ default_language: string; supported_languages: string[] }>(`/api/workspaces/${workspaceId}/language`);
}

export async function updateWorkspaceLanguage(workspaceId: string, default_language: string, supported_languages: string[]) {
  return apiFetch(`/api/workspaces/${workspaceId}/language`, {
    method: "PATCH",
    body: JSON.stringify({ default_language, supported_languages }),
  });
}

// ── Inventory: UOMs ──

export async function fetchUOMs(): Promise<ItemUOM[]> {
  const { data, error } = await supabase.from("item_uoms").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createUOM(args: { name: string; short_name: string; uom_category: string }) {
  const { data, error } = await supabase.from("item_uoms").insert(args).select().single();
  if (error) throw error;
  return data;
}

export async function deleteUOM(id: string) {
  const { error } = await supabase.from("item_uoms").delete().eq("id", id);
  if (error) throw error;
}

// ── Inventory: Items ──

export async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("*, category:category_id(name), base_uom:base_uom_id(name, short_name)")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchItem(id: string): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .select("*, category:category_id(*), base_uom:base_uom_id(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createItem(args: Partial<Item> & { name: string }) {
  const { data, error } = await supabase.from("items").insert(args).select().single();
  if (error) throw error;
  return data;
}

export async function updateItem(id: string, args: Partial<Item>) {
  const { error } = await supabase.from("items").update(args).eq("id", id);
  if (error) throw error;
}

export async function deleteItem(id: string) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

// ── Inventory: Godowns ──

export async function fetchGodowns(): Promise<Godown[]> {
  const { data, error } = await supabase.from("godowns").select("*").order("name");
  if (error) throw error;
  const tree = buildGodownTree(data ?? []);
  return tree;
}

function buildGodownTree(godowns: Godown[]): Godown[] {
  const map = new Map<string, Godown>();
  const roots: Godown[] = [];
  for (const g of godowns) map.set(g.id, { ...g, children: [] });
  for (const g of godowns) {
    if (g.parent_id && map.has(g.parent_id)) {
      map.get(g.parent_id)!.children!.push(map.get(g.id)!);
    } else {
      roots.push(map.get(g.id)!);
    }
  }
  return roots;
}

export async function createGodown(args: { name: string; parent_id?: string; address?: string }) {
  const { data, error } = await supabase.from("godowns").insert(args).select().single();
  if (error) throw error;
  return data;
}

export async function updateGodown(id: string, args: Partial<Godown>) {
  const { error } = await supabase.from("godowns").update(args).eq("id", id);
  if (error) throw error;
}

export async function deleteGodown(id: string) {
  const { error } = await supabase.from("godowns").delete().eq("id", id);
  if (error) throw error;
}

// ── Inventory: Batches ──

export async function fetchBatches(itemId?: string): Promise<ItemBatch[]> {
  let q = supabase.from("item_batches").select("*").order("batch_no");
  if (itemId) q = q.eq("item_id", itemId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createBatch(args: {
  item_id: string;
  batch_no: string;
  mfg_date?: string;
  expiry_date?: string;
  opening_qty?: number;
  purchase_rate?: number;
}) {
  const { data, error } = await supabase.from("item_batches").insert(args).select().single();
  if (error) throw error;
  return data;
}

// ── Inventory: Stock Ledger & Balances ──

export async function fetchStockBalances(): Promise<StockBalance[]> {
  const { data, error } = await supabase.from("stock").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function fetchStockLedger(itemId?: string): Promise<StockLedgerEntry[]> {
  let q = supabase
    .from("stock_ledger")
    .select("*, item:item_id(name), godown:godown_id(name), batch:batch_id(batch_no)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (itemId) q = q.eq("item_id", itemId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function recordStockMovement(args: {
  item_id: string;
  godown_id?: string;
  batch_id?: string;
  movement_type: string;
  quantity_in: number;
  quantity_out: number;
  rate?: number;
  narration?: string;
  create_txn?: boolean;
  txn_account_id?: string;
  txn_type?: string;
  txn_amount_minor?: number;
}) {
  const { data, error } = await supabase.rpc("record_stock_movement", {
    p_workspace_id: useWorkspaceStore.getState().workspaceId,
    p_item_id: args.item_id,
    p_godown_id: args.godown_id ?? null,
    p_batch_id: args.batch_id ?? null,
    p_movement_type: args.movement_type,
    p_quantity_in: args.quantity_in,
    p_quantity_out: args.quantity_out,
    p_rate: args.rate ?? 0,
    p_narration: args.narration ?? "",
    p_create_txn: args.create_txn ?? false,
    p_txn_account_id: args.txn_account_id ?? null,
    p_txn_type: args.txn_type ?? null,
    p_txn_amount_minor: args.txn_amount_minor ?? null,
  });
  if (error) throw error;
  return data;
}

// ── Inventory: BOMs ──

export async function fetchBOMs(): Promise<BOM[]> {
  const { data, error } = await supabase
    .from("boms")
    .select("*, finished_item:finished_item_id(name), items:bom_items(*, item:item_id(name), uom:uom_id(name, short_name))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchBOM(id: string): Promise<BOM> {
  const { data, error } = await supabase
    .from("boms")
    .select("*, finished_item:finished_item_id(*), items:bom_items(*, item:item_id(*), uom:uom_id(*))")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createBOM(args: {
  finished_item_id: string;
  quantity: number;
  wastage_pct?: number;
  items: Array<{ item_id: string; quantity: number; uom_id?: string; wastage_pct?: number; is_scrap?: boolean }>;
}) {
  const { data: bom, error: bomErr } = await supabase
    .from("boms")
    .insert({
      finished_item_id: args.finished_item_id,
      quantity: args.quantity,
      wastage_pct: args.wastage_pct ?? 0,
      workspace_id: useWorkspaceStore.getState().workspaceId,
    })
    .select()
    .single();
  if (bomErr) throw bomErr;

  const lines = args.items.map((i) => ({
    bom_id: bom.id,
    item_id: i.item_id,
    quantity: i.quantity,
    uom_id: i.uom_id ?? null,
    wastage_pct: i.wastage_pct ?? 0,
    is_scrap: i.is_scrap ?? false,
  }));

  const { error: itemsErr } = await supabase.from("bom_items").insert(lines);
  if (itemsErr) throw itemsErr;

  return bom;
}

export async function deleteBOM(id: string) {
  const { error } = await supabase.from("boms").delete().eq("id", id);
  if (error) throw error;
}

// ── Manufacturing Orders ──

export async function fetchManufacturingOrders(): Promise<ManufacturingOrder[]> {
  const { data, error } = await supabase
    .from("manufacturing_orders")
    .select("*, item:item_id(name), bom:bom_id(id), godown:output_godown_id(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchManufacturingOrder(id: string): Promise<ManufacturingOrder> {
  const { data, error } = await supabase
    .from("manufacturing_orders")
    .select("*, item:item_id(*), bom:bom_id(*), godown:output_godown_id(*), consumption:manufacturing_consumption(*, item:item_id(name)), output:manufacturing_output(*, item:item_id(name))")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createManufacturingOrder(args: {
  item_id: string;
  planned_qty: number;
  bom_id?: string;
  start_date?: string;
  output_godown_id?: string;
}) {
  const wsId = useWorkspaceStore.getState().workspaceId;
  const orderNo = `MO-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabase
    .from("manufacturing_orders")
    .insert({
      workspace_id: wsId,
      order_no: orderNo,
      item_id: args.item_id,
      planned_qty: args.planned_qty,
      bom_id: args.bom_id ?? null,
      start_date: args.start_date ?? null,
      output_godown_id: args.output_godown_id ?? null,
      status: "planned",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateManufacturingOrderStatus(id: string, status: string) {
  const { error } = await supabase.from("manufacturing_orders").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function completeManufacturing(args: {
  order_id: string;
  consumption: Array<{ item_id: string; quantity: number; rate: number; godown_id?: string; batch_id?: string }>;
  output_quantity: number;
  output_godown_id: string;
  output_batch_id?: string;
}) {
  const { error } = await supabase.rpc("complete_manufacturing", {
    p_order_id: args.order_id,
    p_consumption_data: JSON.stringify(args.consumption),
    p_output_quantity: args.output_quantity,
    p_output_godown_id: args.output_godown_id,
    p_output_batch_id: args.output_batch_id ?? null,
  });
  if (error) throw error;
}

// ── Job Work ──

export async function fetchJobWork(): Promise<JobWork[]> {
  const { data, error } = await supabase
    .from("job_work")
    .select("*, item:item_id(name), party:party_account_id(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createJobWork(args: {
  job_type: string;
  party_account_id: string;
  item_id: string;
  quantity_sent: number;
  quantity_received?: number;
  rate?: number;
  challan_no?: string;
  date_sent?: string;
  godown_id?: string;
  narration?: string;
}) {
  const wsId = useWorkspaceStore.getState().workspaceId;
  const { data, error } = await supabase
    .from("job_work")
    .insert({ ...args, workspace_id: wsId, quantity_received: args.quantity_received ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateJobWork(id: string, args: Partial<JobWork>) {
  const { error } = await supabase.from("job_work").update(args).eq("id", id);
  if (error) throw error;
}

// ── Purchase Orders ──

export async function fetchPurchaseOrders(params?: { status?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const s = q.toString();
  return apiFetch<{ purchase_orders: PurchaseOrder[]; total: number }>(`/api/purchase-orders${s ? `?${s}` : ""}`);
}

export async function fetchPurchaseOrder(id: string) {
  return apiFetch<{ purchase_order: PurchaseOrder; items: POItem[]; goods_receipts: GoodsReceipt[] }>(`/api/purchase-orders/${id}`);
}

export async function createPurchaseOrder(args: {
  vendor_id?: string;
  project_id?: string;
  cost_center_id?: string;
  expected_delivery?: string;
  notes?: string;
  items: Array<{ item_id?: string; description: string; quantity: number; unit?: string; unit_price_minor: number }>;
}) {
  return apiFetch<{ purchase_order: PurchaseOrder }>("/api/purchase-orders", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function receivePurchaseOrder(poId: string, args: {
  items: Array<{ po_item_id: string; item_id?: string; quantity_received: number; quantity_accepted?: number; quantity_rejected?: number; rejection_reason?: string }>;
  notes?: string;
}) {
  return apiFetch<{ goods_receipt: GoodsReceipt; po_status: string }>(`/api/purchase-orders/${poId}/receive`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function updatePOStatus(poId: string, status: string) {
  return apiFetch<{ purchase_order: PurchaseOrder }>(`/api/purchase-orders/${poId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ── Vendors ──

export async function fetchVendors() {
  return apiFetch<{ vendors: Vendor[] }>("/api/budgets/vendors");
}

export async function createVendor(args: {
  name: string; contact_person?: string; email?: string; phone?: string;
  address?: string; gst?: string; payment_terms?: string; account_id?: string;
}) {
  return apiFetch<{ vendor: Vendor }>("/api/budgets/vendors", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function updateVendor(id: string, args: Partial<Vendor>) {
  return apiFetch<{ vendor: Vendor }>(`/api/budgets/vendors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(args),
  });
}

// ── Budgets & Cost Centers ──

export async function fetchBudgets(params?: { over_budget?: boolean; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.over_budget) q.set("over_budget", "true");
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const s = q.toString();
  return apiFetch<{ budgets: Budget[]; total: number }>(`/api/budgets${s ? `?${s}` : ""}`);
}

export async function createBudget(args: {
  cost_center_id?: string; project_id?: string; name: string;
  amount_minor: number; currency?: string; period_start: string; period_end: string;
}) {
  return apiFetch<{ budget: Budget }>("/api/budgets", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function fetchCostCenters() {
  return apiFetch<{ cost_centers: CostCenter[] }>("/api/budgets/cost-centers");
}

export async function createCostCenter(args: { name: string; code?: string; parent_id?: string }) {
  return apiFetch<{ cost_center: CostCenter }>("/api/budgets/cost-centers", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function fetchAlertRules() {
  return apiFetch<{ alert_rules: AlertRule[] }>("/api/budgets/alert-rules");
}

export async function createAlertRule(args: {
  name: string; entity_type: string; entity_id?: string; metric: string;
  operator: string; threshold: number; channel?: string; cooldown_minutes?: number;
}) {
  return apiFetch<{ alert_rule: AlertRule }>("/api/budgets/alert-rules", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function deleteAlertRule(id: string) {
  return apiFetch(`/api/budgets/alert-rules/${id}`, { method: "DELETE" });
}

export async function evaluateAlertRules() {
  return apiFetch<{ alerts_generated: number; alerts: Alert[] }>("/api/budgets/evaluate-alerts", {
    method: "POST",
  });
}

export async function fetchAlerts(params?: { unread?: boolean; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.unread) q.set("unread", "true");
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const s = q.toString();
  return apiFetch<{ alerts: Alert[]; total: number }>(`/api/budgets/alerts${s ? `?${s}` : ""}`);
}

export async function markAlertRead(id: string) {
  return apiFetch(`/api/budgets/alerts/${id}/read`, { method: "POST" });
}

export async function fetchProjects() {
  return apiFetch<{ projects: Project[] }>("/api/budgets/projects");
}

export async function createProject(args: { name: string; code?: string; budget_minor?: number; currency?: string; start_date?: string; target_end_date?: string }) {
  return apiFetch<{ project: Project }>("/api/budgets/projects", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

// fetchItems already exists above via Supabase for inventory
