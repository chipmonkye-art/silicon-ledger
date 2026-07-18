export type UserRole = "site_manager" | "procurement" | "finance" | "md";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url?: string;
}

export interface Project {
  id: string;
  name: string;
  location?: string;
  description?: string;
  budget: number;
  spent: number;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date?: string;
  end_date?: string;
  created_by: string;
}

export interface Transaction {
  id: string;
  project_id?: string;
  account_id: string;
  to_account_id?: string;
  account_name?: string;
  to_account_name?: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  description: string;
  category?: string;
  vendor_id?: string;
  receipt_url?: string;
  date: string;
  is_staged: boolean;
  approved_by?: string;
  created_by: string;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: "cash" | "bank" | "credit_card" | "e_wallet";
  currency: string;
  color: string;
  icon: string;
  opening_balance: number;
  include_in_assets: boolean;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface AccountSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
  icon?: string;
  color?: string;
}

export interface Invoice {
  id: string;
  project_id: string;
  project_name?: string;
  vendor_id: string;
  vendor_name?: string;
  invoice_number: string;
  amount: number;
  due_date: string;
  description?: string;
  status: "pending" | "approved" | "paid" | "overdue";
  paid_at?: string;
  created_by: string;
}

export interface RecurringTemplate {
  id: string;
  user_id: string;
  name: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  account_id: string;
  to_account_id?: string;
  account_name?: string;
  to_account_name?: string;
  category?: string;
  description?: string;
  interval_type: "daily" | "weekly" | "monthly" | "yearly" | "custom_weeks";
  interval_value: number;
  next_occurrence: string;
  end_date?: string;
  is_active: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: string;
}

export interface Expense {
  id: string;
  project_id: string;
  project_name?: string;
  vendor_id?: string;
  amount: number;
  category: string;
  description: string;
  receipt_url?: string;
  status: "draft" | "pending" | "approved" | "rejected" | "paid";
  approved_by?: string;
  created_by: string;
  created_at: string;
}
