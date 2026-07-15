-- Migration v2: Construction & Landowner Management Module
-- Adds tables for landowners, attendance tracking, cheque register, auto bank reconciliation, payroll

-- 1. Landowners
create table if not exists landowners (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  contact_person text,
  email text,
  phone text,
  address text,
  parcel_details jsonb default '{}'::jsonb,
  contract_type text check (contract_type in ('lease', 'revenue_share', 'outright', 'easement', 'other')),
  contract_start date,
  contract_end date,
  payment_frequency text check (payment_frequency in ('monthly', 'quarterly', 'yearly', 'lumpsum', 'custom')),
  payment_amount_minor integer default 0,
  account_id uuid references accounts(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- 2. Landowner payment schedules (generated from contract terms)
create table if not exists landowner_schedules (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  landowner_id uuid not null references landowners(id) on delete cascade,
  due_date date not null,
  amount_minor integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  transaction_id uuid references transactions(id) on delete set null,
  paid_date date,
  notes text,
  created_at timestamptz not null default now()
);

-- 3. Attendance tracking (daily site labor)
create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  employee_name text not null,
  employee_code text,
  attendance_date date not null,
  status text not null check (status in ('present', 'absent', 'half_day', 'overtime', 'holiday', 'leave')),
  work_type text check (work_type in ('regular', 'piece_work', 'contract', 'supervisor', 'other')),
  hours_worked numeric(5,2),
  hourly_rate_minor integer,
  piece_rate_minor integer,
  piece_quantity numeric(10,2),
  wages_minor integer not null default 0,
  notes text,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- 4. Cheque register
create table if not exists cheque_register (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  cheque_book_name text not null default 'Default',
  cheque_number text not null,
  cheque_date date not null,
  payee text not null,
  amount_minor integer not null,
  status text not null default 'issued' check (status in ('issued', 'cleared', 'bounced', 'cancelled', 'stopped', 'post_dated')),
  transaction_id uuid references transactions(id) on delete set null,
  bank_clearance_date date,
  bounce_reason text,
  notes text,
  issued_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique(workspace_id, account_id, cheque_number)
);

-- 5. Auto bank reconciliation statements
create table if not exists bank_statements (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  statement_date date not null,
  closing_balance integer not null,
  currency text not null default 'BDT',
  imported_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists bank_statement_lines (
  id uuid primary key default uuid_generate_v4(),
  bank_statement_id uuid not null references bank_statements(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  debit_minor integer default 0,
  credit_minor integer default 0,
  balance integer,
  ref_number text,
  our_ref_number text default '',
  matched_transaction_id uuid references transactions(id) on delete set null,
  match_confidence numeric(5,2) default 0,
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'auto_matched', 'manual_matched', 'ignored')),
  created_at timestamptz not null default now()
);

-- 6. Payroll groups and structures
create table if not exists payroll_groups (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists payroll_employees (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  group_id uuid references payroll_groups(id) on delete set null,
  employee_code text not null,
  employee_name text not null,
  designation text,
  bank_account text,
  pan_no text,
  basic_pay_minor integer default 0,
  allowances_minor integer default 0,
  deductions_minor integer default 0,
  net_pay_minor integer default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id, employee_code)
);

create table if not exists payroll_runs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  group_id uuid references payroll_groups(id) on delete set null,
  period_start date not null,
  period_end date not null,
  total_employees integer not null default 0,
  total_gross_minor integer not null default 0,
  total_deductions_minor integer not null default 0,
  total_net_minor integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'cancelled')),
  transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- RLS
alter table landowners enable row level security;
alter table landowner_schedules enable row level security;
alter table attendance enable row level security;
alter table cheque_register enable row level security;
alter table bank_statements enable row level security;
alter table bank_statement_lines enable row level security;
alter table payroll_groups enable row level security;
alter table payroll_employees enable row level security;
alter table payroll_runs enable row level security;

-- Workspace-based RLS policies
create policy "Workspace access landowners"
  on landowners for all using (
    workspace_id in (select workspace_id from user_workspaces where user_id = auth.uid())
  );

create policy "Workspace access landowner_schedules"
  on landowner_schedules for all using (
    workspace_id in (select workspace_id from user_workspaces where user_id = auth.uid())
  );

create policy "Workspace access attendance"
  on attendance for all using (
    workspace_id in (select workspace_id from user_workspaces where user_id = auth.uid())
  );

create policy "Workspace access cheque_register"
  on cheque_register for all using (
    workspace_id in (select workspace_id from user_workspaces where user_id = auth.uid())
  );

create policy "Workspace access bank_statements"
  on bank_statements for all using (
    workspace_id in (select workspace_id from user_workspaces where user_id = auth.uid())
  );

create policy "Workspace access bank_statement_lines"
  on bank_statement_lines for all using (
    bank_statement_id in (
      select id from bank_statements where workspace_id in (
        select workspace_id from user_workspaces where user_id = auth.uid()
      )
    )
  );

create policy "Workspace access payroll_groups"
  on payroll_groups for all using (
    workspace_id in (select workspace_id from user_workspaces where user_id = auth.uid())
  );

create policy "Workspace access payroll_employees"
  on payroll_employees for all using (
    workspace_id in (select workspace_id from user_workspaces where user_id = auth.uid())
  );

create policy "Workspace access payroll_runs"
  on payroll_runs for all using (
    workspace_id in (select workspace_id from user_workspaces where user_id = auth.uid())
  );
