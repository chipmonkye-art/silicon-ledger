export interface Profile {
  id: string;
  base_currency: string;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  name_bn?: string;
  name_alias?: string;
  type: "cash" | "bank" | "credit_card" | "ewallet" | "custom";
  currency: string;
  icon: string;
  color: string;
  opening_balance: number;
  include_in_assets: boolean;
  archived_at: string | null;
  created_at: string;
  current_balance?: number;
  credit_limit?: number;
  credit_limit_type?: "soft" | "hard" | null;
  credit_used_minor?: number;
  credit_remaining?: number;
  usage_pct?: number;
  is_over_limit?: boolean;
}

export interface Category {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  name_bn?: string;
  name_alias?: string;
  kind: "income" | "expense";
  created_at: string;
  children?: Category[];
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  txn_type: "income" | "expense" | "transfer";
  amount_minor: number;
  currency: string;
  occurred_on: string;
  description: string;
  note: string;
  is_staged: boolean;
  is_rejected: boolean;
  rejection_note: string | null;
  recurring_id: string | null;
  bill_reference?: string;
  paid_amount_minor?: number;
  payment_status?: "unpaid" | "partial" | "paid" | "overpaid" | null;
  payment_matched_transaction_id?: string | null;
  due_date?: string | null;
  is_msme_record?: boolean;
  msme_credit_days?: number;
  rejected_by?: string;
  approved_by?: string;
  created_at: string;
  account?: Account;
  category?: Category;
  to_account?: Account;
  aging_status?: string;
  days_overdue?: number;
  remaining_due?: number;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  txn_type: "income" | "expense" | "transfer";
  amount_minor: number;
  currency: string;
  description: string;
  note: string;
  interval_type: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval_days: number | null;
  start_date: string;
  end_date: string | null;
  occurrences_remaining: number | null;
  is_active: boolean;
  created_at: string;
}

export interface TransactionAudit {
  id: string;
  transaction_id: string;
  user_id: string;
  action: "INSERT" | "UPDATE" | "DELETE" | "REJECT";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface FxRate {
  quote_currency: string;
  base_currency: string;
  rate: number;
  updated_at: string;
}

export interface AccountSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface MonthlySummary {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

export interface CalendarDay {
  date: string;
  income: number;
  expense: number;
  transactions: Transaction[];
}

export interface CalendarMonth {
  days: CalendarDay[];
  carryover: number;
  income: number;
  expense: number;
  balance: number;
}

export interface CashFlowProjection {
  days: number;
  label: string;
  amount_cents: number;
}

export interface AgingBucket {
  bucket: string;
  count: number;
  total_remaining: number;
}

export interface CreditStatus {
  id: string;
  name: string;
  type: string;
  credit_limit: number | null;
  credit_limit_type: string | null;
  current_balance: number;
  credit_remaining: number;
  usage_pct: number;
  is_over_limit: boolean;
}

export interface OutstandingInvoice {
  id: string;
  bill_reference?: string;
  amount_minor: number;
  paid_amount_minor?: number;
  due_date?: string;
  payment_status?: string | null;
  account_name: string;
  aging_status: string;
  days_overdue: number | null;
}

export interface Workspace {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  role?: "owner" | "manager" | "staff" | "auditor";
  logo_url?: string;
  branding_config?: Record<string, unknown>;
  default_language?: string;
  supported_languages?: string[];
}

export interface PendingMutation {
  id: string;
  entity_type: string;
  entity_id: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  vector_clock: number;
  created_at: string;
}

export interface WorkspaceMember {
  user_id: string;
  role: "owner" | "manager" | "staff" | "auditor";
  joined_at: string;
}

export interface ImportLog {
  id: string;
  workspace_id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  mapping: Record<string, string>;
  row_count: number;
  imported_count: number;
  error_count: number;
  errors: unknown;
  created_at: string;
}

export interface ImportMapping {
  account_column: string;
  amount_column: string;
  type_column: string;
  date_column: string;
  description_column: string;
  bill_reference_column?: string;
  category_column?: string;
}

export interface AgingEntry {
  workspace_id: string;
  account_id: string;
  account_name: string;
  transaction_id: string;
  bill_reference: string | null;
  description: string;
  amount_minor: number;
  paid_amount_minor: number | null;
  due_date: string | null;
  payment_status: string | null;
  aging_bucket: string;
  days_overdue: number;
  remaining_due: number;
}

export interface PaymentPerformance {
  workspace_id: string;
  approved_count: number;
  rejected_count: number;
  avg_approval_hours: number;
  overdue_count: number;
}

export interface CreditUtilization {
  account_id: string;
  name: string;
  workspace_id: string;
  credit_limit: number | null;
  credit_limit_type: string | null;
  current_balance: number;
  usage_pct: number;
  credit_remaining: number;
  is_over_limit: boolean;
}

export interface LanguageConfig {
  code: string;
  name: string;
  native: string;
  flag: string;
}

export interface WorkbookConfig {
  i18n: Record<string, Record<string, string>>;
  languages: LanguageConfig[];
}

// ── Inventory & Manufacturing ──

export interface ItemUOM {
  id: string;
  workspace_id: string;
  name: string;
  short_name: string;
  uom_category: "count" | "weight" | "volume" | "length" | "area" | "time";
  is_active: boolean;
  created_at: string;
}

export interface ItemUOMConversion {
  id: string;
  workspace_id: string;
  from_uom_id: string;
  to_uom_id: string;
  conversion_factor: number;
  created_at: string;
}

export interface Item {
  id: string;
  workspace_id: string;
  name: string;
  sku?: string;
  item_type: "good" | "service";
  category_id?: string;
  base_uom_id?: string;
  purchase_uom_id?: string;
  selling_uom_id?: string;
  valuation_method: "fifo" | "average" | "lifo" | "standard" | "last_purchase";
  standard_cost?: number;
  gst_hsn_code?: string;
  is_active: boolean;
  opening_stock: number;
  opening_stock_rate?: number;
  reorder_level?: number;
  reorder_qty?: number;
  min_stock_qty?: number;
  max_stock_qty?: number;
  description?: string;
  created_at: string;
  category?: Category;
  base_uom?: ItemUOM;
}

export interface Godown {
  id: string;
  workspace_id: string;
  name: string;
  parent_id?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
  children?: Godown[];
}

export interface ItemBatch {
  id: string;
  workspace_id: string;
  item_id: string;
  batch_no: string;
  mfg_date?: string;
  expiry_date?: string;
  opening_qty: number;
  purchase_rate?: number;
  is_active: boolean;
  created_at: string;
}

export interface StockLedgerEntry {
  id: string;
  workspace_id: string;
  item_id: string;
  godown_id?: string;
  batch_id?: string;
  transaction_id?: string;
  movement_type:
    | "opening"
    | "purchase_receipt"
    | "sales_delivery"
    | "stock_transfer_out"
    | "stock_transfer_in"
    | "manufacturing_consumption"
    | "manufacturing_output"
    | "job_work_issue"
    | "job_work_receipt"
    | "stock_addition"
    | "stock_reduction";
  quantity_in: number;
  quantity_out: number;
  rate?: number;
  amount?: number;
  ref_id?: string;
  ref_type?: string;
  narration?: string;
  created_by: string;
  created_at: string;
}

export interface StockBalance {
  workspace_id: string;
  item_id: string;
  item_name: string;
  sku?: string;
  godown_id?: string;
  godown_name?: string;
  batch_id?: string;
  batch_no?: string;
  mfg_date?: string;
  expiry_date?: string;
  current_qty: number;
  avg_rate: number;
}

export interface BOM {
  id: string;
  workspace_id: string;
  finished_item_id: string;
  quantity: number;
  wastage_pct: number;
  is_active: boolean;
  valid_from: string;
  valid_to?: string;
  created_at: string;
  finished_item?: Item;
  items?: BOMItem[];
}

export interface BOMItem {
  id: string;
  bom_id: string;
  item_id: string;
  quantity: number;
  uom_id?: string;
  wastage_pct: number;
  is_scrap: boolean;
  created_at: string;
  item?: Item;
  uom?: ItemUOM;
}

export interface ManufacturingOrder {
  id: string;
  workspace_id: string;
  order_no?: string;
  bom_id?: string;
  item_id: string;
  planned_qty: number;
  produced_qty: number;
  scrapped_qty: number;
  start_date?: string;
  end_date?: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  output_godown_id?: string;
  created_by: string;
  created_at: string;
  item?: Item;
  bom?: BOM;
  godown?: Godown;
  consumption?: ManufacturingConsumption[];
  output?: ManufacturingOutput[];
}

export interface ManufacturingConsumption {
  id: string;
  workspace_id: string;
  manufacturing_order_id: string;
  item_id: string;
  batch_id?: string;
  godown_id?: string;
  quantity: number;
  rate?: number;
  amount?: number;
  created_at: string;
  item?: Item;
}

export interface ManufacturingOutput {
  id: string;
  workspace_id: string;
  manufacturing_order_id: string;
  item_id: string;
  batch_id?: string;
  godown_id?: string;
  quantity: number;
  rate?: number;
  amount?: number;
  created_at: string;
  item?: Item;
}

export interface JobWork {
  id: string;
  workspace_id: string;
  job_type: "principal" | "job_worker";
  party_account_id: string;
  item_id: string;
  quantity_sent: number;
  quantity_received: number;
  rate?: number;
  amount?: number;
  challan_no?: string;
  status: "sent" | "partially_received" | "completed" | "cancelled";
  date_sent?: string;
  date_received?: string;
  godown_id?: string;
  narration?: string;
  created_by: string;
  created_at: string;
  item?: Item;
  party?: Account;
}

// ── Purchase Orders & Goods Receipts ──

export type POStatus = 'draft' | 'pending_approval' | 'approved' | 'ordered' | 'partially_received' | 'fully_received' | 'cancelled';

export interface Vendor {
  id: string;
  workspace_id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  gst?: string;
  payment_terms?: string;
  account_id?: string;
  is_active: boolean;
  created_at: string;
}

export interface POItem {
  id: string;
  po_id: string;
  item_id?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_minor: number;
  total_minor: number;
  received_qty: number;
  created_at: string;
  item?: Item;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  workspace_id: string;
  vendor_id?: string;
  vendor_name?: string;
  vendor_phone?: string;
  contact_person?: string;
  project_id?: string;
  cost_center_id?: string;
  status: POStatus;
  order_date: string;
  expected_delivery?: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  notes?: string;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  line_count?: number;
  created_at: string;
  updated_at: string;
}

export interface GoodsReceipt {
  id: string;
  gr_number: string;
  po_id: string;
  workspace_id: string;
  received_by?: string;
  received_date: string;
  status: 'pending' | 'partial' | 'complete' | 'over_received';
  notes?: string;
  created_at: string;
}

export interface GRItem {
  id: string;
  gr_id: string;
  po_item_id?: string;
  item_id?: string;
  description: string;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number;
  rejection_reason?: string;
  created_at: string;
}

// ── Cost Centers & Budgets & Alerts ──

export interface CostCenter {
  id: string;
  workspace_id: string;
  name: string;
  code?: string;
  parent_id?: string;
  is_active: boolean;
  child_count?: number;
  created_at: string;
}

export interface Budget {
  id: string;
  workspace_id: string;
  cost_center_id?: string;
  cost_center_name?: string;
  project_id?: string;
  project_name?: string;
  budget_name: string;
  budget_amount: number;
  currency: string;
  period_start: string;
  period_end: string;
  spent_minor: number;
  remaining_minor: number;
  spend_pct: number;
  is_over_budget: boolean;
}

export interface AlertRule {
  id: string;
  workspace_id: string;
  name: string;
  entity_type: 'budget' | 'cost_center' | 'project' | 'cash_flow';
  entity_id?: string;
  metric: 'spend_pct' | 'spend_remaining' | 'cash_flow_gap' | 'days_overdue';
  operator: '>' | '>=' | '<' | '<=';
  threshold: number;
  channel: 'in_app' | 'push' | 'email' | 'all';
  is_active: boolean;
  cooldown_minutes: number;
  last_triggered_at?: string;
  created_at: string;
}

export interface Alert {
  id: string;
  workspace_id: string;
  rule_id?: string;
  rule_name?: string;
  entity_type: string;
  entity_id?: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  is_read: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  code?: string;
  description?: string;
  budget_minor: number;
  currency: string;
  start_date?: string;
  target_end_date?: string;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  is_active: boolean;
  created_at: string;
}
