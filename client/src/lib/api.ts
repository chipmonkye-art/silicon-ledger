type UploadResponse = { url: string; filename: string };

const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

export const uploadApi = {
  receipt: (file: File) => {
    const form = new FormData();
    form.append("receipt", file);
    const token = localStorage.getItem("token");
    return fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Upload failed");
      }
      return res.json() as Promise<UploadResponse>;
    });
  },
};

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

import type { Account, AccountSummary, Category, Transaction, Project, Expense, Invoice, Vendor, RecurringTemplate } from "@/types";

type AccountsResponse = { accounts: Account[]; summary: AccountSummary };
type AccountResponse = { account: Account };
type CategoriesResponse = { categories: Category[] };
type TransactionsResponse = { transactions: Transaction[] };
type TransactionResponse = { transaction: Transaction };
type ProjectsResponse = { projects: Project[] };
type ProjectResponse = { project: Project };
type MonthlySummaryResponse = { month: { income: number; expense: number; balance: number } };
type CalendarResponse = { transactions: Transaction[]; carryover: number; totals: { income: number; expense: number; balance: number } };
type ExpensesResponse = { expenses: Expense[]; summary: { approved: number; pending: number } };
type ExpenseResponse = { expense: Expense };

export const accountsApi = {
  list: () => api.get<AccountsResponse>("/accounts"),
  get: (id: string) => api.get<AccountResponse>(`/accounts/${id}`),
  create: (body: Partial<Account>) => api.post<AccountResponse>("/accounts", body),
  update: (id: string, body: Partial<Account>) => api.put<AccountResponse>(`/accounts/${id}`, body),
  remove: (id: string) => api.delete(`/accounts/${id}`),
};

export const projectsApi = {
  list: () => api.get<ProjectsResponse>("/projects"),
  get: (id: string) => api.get<ProjectResponse>(`/projects/${id}`),
  create: (body: Partial<Project>) => api.post<ProjectResponse>("/projects", body),
  update: (id: string, body: Partial<Project>) => api.put<ProjectResponse>(`/projects/${id}`, body),
};

export const categoriesApi = {
  list: () => api.get<CategoriesResponse>("/categories"),
  create: (body: Partial<Category>) => api.post<CategoriesResponse>("/categories", body),
};

type InvoicesResponse = { invoices: Invoice[] };
type InvoiceResponse = { invoice: Invoice };
type VendorsResponse = { vendors: Vendor[] };
type VendorResponse = { vendor: Vendor };

export const invoicesApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<InvoicesResponse>(`/invoices${qs}`);
  },
  get: (id: string) => api.get<InvoiceResponse>(`/invoices/${id}`),
  create: (body: Partial<Invoice>) => api.post<InvoiceResponse>("/invoices", body),
  pay: (id: string) => api.post<InvoiceResponse>(`/invoices/${id}/pay`),
};

export const vendorsApi = {
  list: () => api.get<VendorsResponse>("/vendors"),
  get: (id: string) => api.get<VendorResponse>(`/vendors/${id}`),
  create: (body: Partial<Vendor>) => api.post<VendorResponse>("/vendors", body),
  update: (id: string, body: Partial<Vendor>) => api.put<VendorResponse>(`/vendors/${id}`, body),
};

type CategoryBreakdownResponse = { categories: { name: string; amount: number; pct: number; color: string }[]; total: number };
type MonthlyTrendsResponse = { trends: { month: string; income: number; expense: number; balance: number }[] };
type RecurringListResponse = { templates: RecurringTemplate[]; grouped: Record<string, RecurringTemplate[]> };
type RecurringResponse = { template: RecurringTemplate };
type GenerateResponse = { generated: Transaction[]; count?: number; next_occurrence?: string };

type BackupResponse = { message: string; imported: number };

type NotificationItem = { id: string; type: string; message: string; link: string };
type NotificationsResponse = {
  stale_staged: NotificationItem[];
  budget_alerts: NotificationItem[];
  overdue_invoices: NotificationItem[];
  pending_review: number;
  total: number;
};

export const notificationsApi = {
  list: () => api.get<NotificationsResponse>("/notifications"),
};

export const backupApi = {
  export: () => api.get<Record<string, unknown>>("/backup/export"),
  import: (data: unknown) => api.post<BackupResponse>("/backup/import", data),
};

export const recurringApi = {
  list: () => api.get<RecurringListResponse>("/recurring"),
  create: (body: Partial<RecurringTemplate>) => api.post<RecurringResponse>("/recurring", body),
  update: (id: string, body: Partial<RecurringTemplate>) => api.put<RecurringResponse>(`/recurring/${id}`, body),
  remove: (id: string) => api.delete(`/recurring/${id}`),
  generate: (id: string, count = 12) => api.post<GenerateResponse>(`/recurring/${id}/generate`, { count }),
  bulkGenerate: (years = 1) => api.post<GenerateResponse>("/recurring/bulk-generate", { years }),
};

export const reportsApi = {
  categoryBreakdown: (month: string) => api.get<CategoryBreakdownResponse>(`/reports/category-breakdown?month=${month}`),
  monthlyTrends: (months = 12) => api.get<MonthlyTrendsResponse>(`/reports/monthly-trends?months=${months}`),
  exportUrl: (month: string) => `/api/reports/export?month=${month}`,
};

export const searchApi = {
  all: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<{ results: any[] }>(`/search${qs}`);
  },
};

export const expensesApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<ExpensesResponse>(`/expenses${qs}`);
  },
  get: (id: string) => api.get<ExpenseResponse>(`/expenses/${id}`),
  create: (body: Partial<Expense>) => api.post<ExpenseResponse>("/expenses", body),
  approve: (id: string) => api.post<ExpenseResponse>(`/expenses/${id}/approve`),
  reject: (id: string) => api.post<ExpenseResponse>(`/expenses/${id}/reject`),
};

type StagedResponse = { staged: Transaction[]; summary: { income: number; expense: number; transfers: number; count: number } };
type BulkResponse = { approved?: number; rejected?: number };

export const transactionsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<TransactionsResponse>(`/transactions${qs}`);
  },
  get: (id: string) => api.get<TransactionResponse>(`/transactions/${id}`),
  create: (body: Partial<Transaction>) => api.post<TransactionResponse>("/transactions", body),
  update: (id: string, body: Partial<Transaction>) => api.put<TransactionResponse>(`/transactions/${id}`, body),
  approve: (id: string) => api.post<TransactionResponse>(`/transactions/${id}/approve`),
  reject: (id: string) => api.post(`/transactions/${id}/reject`),
  summary: () => api.get<MonthlySummaryResponse>("/transactions/summary"),
  calendar: (month: string) => api.get<CalendarResponse>(`/transactions/calendar?month=${month}`),
  staged: () => api.get<StagedResponse>("/transactions/staged"),
  bulkApprove: (ids: string[]) => api.post<BulkResponse>("/transactions/bulk-approve", { ids }),
  bulkReject: (ids: string[]) => api.post<BulkResponse>("/transactions/bulk-reject", { ids }),
};
