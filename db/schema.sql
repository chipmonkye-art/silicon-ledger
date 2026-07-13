-- Silicon Ledger Database Schema
-- PostgreSQL with Row Level Security

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE user_role AS ENUM ('site_manager', 'procurement', 'finance', 'md');
CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer');
CREATE TYPE expense_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'paid');
CREATE TYPE invoice_status AS ENUM ('pending', 'approved', 'paid', 'overdue');
CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');

-- ============================================
-- USERS
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'site_manager',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_projects (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

-- ============================================
-- PROJECTS
-- ============================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  budget BIGINT NOT NULL DEFAULT 0,        -- in cents
  status project_status NOT NULL DEFAULT 'planning',
  start_date DATE,
  end_date DATE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- VENDORS
-- ============================================
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_id TEXT,
  payment_terms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- LAND OWNERS
-- ============================================
CREATE TABLE land_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parcel_info TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ACCOUNTS (containers: cash, bank, credit card, e-wallet)
-- ============================================
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'credit_card', 'e_wallet')),
  currency TEXT NOT NULL DEFAULT 'USD',
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT NOT NULL DEFAULT 'wallet',
  opening_balance BIGINT NOT NULL DEFAULT 0,
  include_in_assets BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CATEGORIES (for transaction classification)
-- ============================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type transaction_type NOT NULL,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TRANSACTIONS (ledger)
-- ============================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  to_account_id UUID REFERENCES accounts(id),
  type transaction_type NOT NULL,
  amount BIGINT NOT NULL,                   -- in cents, positive
  description TEXT NOT NULL,
  category TEXT,
  receipt_url TEXT,                         -- path to uploaded receipt image
  vendor_id UUID REFERENCES vendors(id),
  land_owner_id UUID REFERENCES land_owners(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_staged BOOLEAN NOT NULL DEFAULT true, -- staging gate
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT transfer_requires_dest CHECK (type != 'transfer' OR to_account_id IS NOT NULL),
  CONSTRAINT transfer_no_category CHECK (type != 'transfer' OR category IS NULL)
);

-- ============================================
-- EXPENSES
-- ============================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id),
  amount BIGINT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  receipt_url TEXT,
  status expense_status NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INVOICES
-- ============================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  invoice_number TEXT NOT NULL,
  amount BIGINT NOT NULL,
  due_date DATE NOT NULL,
  description TEXT,
  status invoice_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- AUDIT LOG (insert-only)
-- ============================================
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_transactions_project ON transactions(project_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_staged ON transactions(is_staged);
CREATE INDEX idx_expenses_project ON expenses(project_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_invoices_project ON invoices(project_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_user_projects_user ON user_projects(user_id);
CREATE INDEX idx_user_projects_project ON user_projects(project_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Site managers see only their projects
CREATE POLICY project_isolation ON projects
  FOR ALL
  USING (
    current_setting('app.role')::user_role = 'md'
    OR current_setting('app.role')::user_role = 'finance'
    OR id IN (
      SELECT project_id FROM user_projects
      WHERE user_id = current_setting('app.user_id')::UUID
    )
  );

-- Same isolation for transactions, expenses, invoices
CREATE POLICY transaction_isolation ON transactions
  FOR ALL
  USING (
    current_setting('app.role')::user_role IN ('md', 'finance')
    OR project_id IN (
      SELECT project_id FROM user_projects
      WHERE user_id = current_setting('app.user_id')::UUID
    )
  );

CREATE POLICY expense_isolation ON expenses
  FOR ALL
  USING (
    current_setting('app.role')::user_role IN ('md', 'finance')
    OR project_id IN (
      SELECT project_id FROM user_projects
      WHERE user_id = current_setting('app.user_id')::UUID
    )
  );

CREATE POLICY invoice_isolation ON invoices
  FOR ALL
  USING (
    current_setting('app.role')::user_role IN ('md', 'finance')
    OR project_id IN (
      SELECT project_id FROM user_projects
      WHERE user_id = current_setting('app.user_id')::UUID
    )
  );

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_owner_isolation ON accounts
  FOR ALL
  USING (user_id = current_setting('app.user_id')::UUID);

-- ============================================
-- ACCOUNT BALANCES VIEW (source of truth)
-- ============================================
CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.color,
  a.icon,
  a.opening_balance,
  a.include_in_assets,
  (
    a.opening_balance
    + COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'income' AND is_staged = false), 0)
    - COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'expense' AND is_staged = false), 0)
    + COALESCE((SELECT SUM(amount) FROM transactions WHERE to_account_id = a.id AND type = 'transfer' AND is_staged = false), 0)
    - COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'transfer' AND is_staged = false), 0)
  ) AS current_balance
FROM accounts a;

-- ============================================
-- AUDIT TRIGGER (insert-only, tamper-proof log)
-- ============================================
CREATE OR REPLACE FUNCTION log_entity_change()
RETURNS TRIGGER AS $$
DECLARE
  uid UUID;
BEGIN
  uid := current_setting('app.user_id', true)::UUID;

  IF uid IS NULL THEN
    IF TG_TABLE_NAME = 'transactions' THEN
      uid := (SELECT created_by FROM transactions WHERE id = COALESCE(NEW.id, OLD.id));
    ELSIF TG_TABLE_NAME = 'accounts' THEN
      uid := (SELECT user_id FROM accounts WHERE id = COALESCE(NEW.id, OLD.id));
    END IF;
  END IF;

  INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (
    uid,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_transactions
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION log_entity_change();

CREATE TRIGGER audit_accounts
AFTER INSERT OR UPDATE OR DELETE ON accounts
FOR EACH ROW EXECUTE FUNCTION log_entity_change();

-- ============================================
-- RECURRING TRANSACTIONS (Fixed Inputs)
-- ============================================
CREATE TABLE recurring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type transaction_type NOT NULL,
  amount BIGINT NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id),
  to_account_id UUID REFERENCES accounts(id),
  category TEXT,
  description TEXT,
  interval_type TEXT NOT NULL CHECK (interval_type IN ('daily', 'weekly', 'monthly', 'yearly', 'custom_weeks')),
  interval_value INT NOT NULL DEFAULT 1,
  next_occurrence DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rec_transfer_requires_dest CHECK (type != 'transfer' OR to_account_id IS NOT NULL),
  CONSTRAINT rec_transfer_no_category CHECK (type != 'transfer' OR category IS NULL)
);

CREATE TABLE bulk_generated_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  generated_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_template_owner ON recurring_templates
  FOR ALL
  USING (user_id = current_setting('app.user_id')::UUID);

-- ============================================
-- ADDITIONAL INDEXES
-- ============================================
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_to_account ON transactions(to_account_id);
CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_recurring_user ON recurring_templates(user_id);
CREATE INDEX idx_recurring_next ON recurring_templates(next_occurrence);
CREATE INDEX idx_bulk_template ON bulk_generated_transactions(template_id);
