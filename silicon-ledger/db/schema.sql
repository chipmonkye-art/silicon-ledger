-- Silicon Accounting App - PostgreSQL Schema
-- All amounts stored as integers (cents). No floating-point math.
-- Architecture aligned with: "Beyond the Spreadsheet" principles

-- 0. Wipe legacy schema (safe — no production data)
drop schema public cascade;
create schema public;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

create extension if not exists "uuid-ossp";

-- 1. Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  base_currency text not null default 'BDT',
  created_at timestamptz not null default now()
);

-- 2. Accounts
-- Types: cash, bank, credit_card, ewallet, custom
-- credit_card is a liability: expenses increase balance (negative), payments are transfers from bank
create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'credit_card', 'ewallet', 'custom')),
  currency text not null default 'BDT',
  icon text not null default 'wallet',
  color text not null default '#1a1a1a',
  opening_balance integer not null default 0,
  include_in_assets boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3. Categories (hierarchical tree)
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  parent_id uuid references categories(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique(user_id, parent_id, name)
);

-- 4. Transactions (core ledger)
-- txn_type: income → adds to balance, expense → subtracts, transfer → neutral (no category)
-- amount_minor is always positive; direction determined by txn_type
-- Transfers: to_account_id required, category_id must be null
-- Non-transfers: category_id required, to_account_id must be null
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete restrict,
  to_account_id uuid references accounts(id) on delete restrict,
  category_id uuid references categories(id) on delete restrict,
  txn_type text not null check (txn_type in ('income', 'expense', 'transfer')),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'BDT',
  occurred_on date not null,
  description text not null default '',
  note text not null default '',
  is_staged boolean not null default true,
  is_rejected boolean not null default false,
  rejection_note text,
  recurring_id uuid references recurring_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transfer_requires_to_account check (
    (txn_type = 'transfer' and to_account_id is not null and category_id is null)
    or (txn_type != 'transfer' and to_account_id is null and category_id is not null)
  ),
  constraint valid_transfer_accounts check (
    to_account_id is null or to_account_id != account_id
  )
);

-- 5. Recurring Transactions (multi-year bulk planning)
-- Supports: daily, weekly, monthly, yearly, custom intervals
-- "Beginning of Year (3 years)" — generate N occurrences ahead, each creates a staged transaction
create table if not exists recurring_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete restrict,
  to_account_id uuid references accounts(id) on delete restrict,
  category_id uuid references categories(id) on delete restrict,
  txn_type text not null check (txn_type in ('income', 'expense', 'transfer')),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'BDT',
  description text not null default '',
  note text not null default '',
  interval_type text not null check (interval_type in ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  interval_days integer check (interval_days > 0),  -- for 'custom' intervals, e.g. 28 for every-4-weeks
  start_date date not null,
  end_date date,                                      -- null = indefinite
  occurrences_remaining integer,                      -- null = infinite
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6. Transaction Audit Trail (insert-only)
create table if not exists transaction_audit (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'REJECT')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- 7. FX Rates (shared cache, nightly refresh)
create table if not exists fx_rates (
  quote_currency text not null,
  base_currency text not null,
  rate numeric not null,
  updated_at timestamptz not null default now(),
  primary key (quote_currency, base_currency)
);

-- 8. Workspaces (multi-user collaborative org units)
create table if not exists workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  logo_url text,
  branding_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 9. Workspace Membership (role: owner | manager | staff)
create table if not exists user_workspaces (
  user_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff', 'auditor')),
  invited_by uuid references profiles(id),
  joined_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

-- Add workspace_id to all data tables
alter table accounts add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table categories add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table transactions add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table recurring_transactions add column if not exists workspace_id uuid references workspaces(id) on delete cascade;

-- Indexes
create index if not exists idx_accounts_user on accounts(user_id);
create index if not exists idx_categories_user on categories(user_id);
create index if not exists idx_categories_parent on categories(parent_id);
create index if not exists idx_transactions_user on transactions(user_id);
create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_transactions_occurred on transactions(occurred_on);
create index if not exists idx_transactions_type on transactions(txn_type);
create index if not exists idx_transactions_staged on transactions(is_staged) where is_staged = true;
create index if not exists idx_transactions_rejected on transactions(workspace_id, is_rejected) where is_rejected = true;
create index if not exists idx_transactions_user_date on transactions(user_id, occurred_on desc);
create index if not exists idx_transactions_recurring on transactions(recurring_id);
create index if not exists idx_recurring_user on recurring_transactions(user_id);
create index if not exists idx_recurring_active on recurring_transactions(is_active) where is_active = true;
create index if not exists idx_audit_transaction on transaction_audit(transaction_id);
create index if not exists idx_audit_user on transaction_audit(user_id);
create index if not exists idx_accounts_workspace on accounts(workspace_id);
create index if not exists idx_categories_workspace on categories(workspace_id);
create index if not exists idx_transactions_workspace on transactions(workspace_id);
create index if not exists idx_recurring_workspace on recurring_transactions(workspace_id);
create index if not exists idx_user_workspaces_user on user_workspaces(user_id);
create index if not exists idx_user_workspaces_ws on user_workspaces(workspace_id);

-- Live Balance View (not materialized — always real-time, no refresh needed)
drop view if exists account_balances cascade;
create view account_balances as
select
  a.id as account_id,
  a.user_id,
  a.workspace_id,
  a.type as account_type,
  a.currency,
  a.include_in_assets,
  a.opening_balance + coalesce((
    select sum(
      case
        when t.txn_type = 'income' then t.amount_minor
        when t.txn_type = 'expense' then -t.amount_minor
        when t.txn_type = 'transfer' and t.account_id = a.id then -t.amount_minor
        when t.txn_type = 'transfer' and t.to_account_id = a.id then t.amount_minor
        else 0
      end
    )     from transactions t
    where (t.account_id = a.id or t.to_account_id = a.id)
    and t.is_staged = false
    and t.is_rejected = false
  ), 0) as current_balance
from accounts a;

-- Audit trigger (insert-only, full history)
create or replace function audit_transaction()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into transaction_audit(transaction_id, user_id, action, after)
    values (new.id, new.user_id, 'INSERT', row_to_json(new)::jsonb);
  elsif tg_op = 'UPDATE' then
    if new.is_rejected = true and (old.is_rejected is null or old.is_rejected = false) then
      insert into transaction_audit(transaction_id, user_id, action, before, after)
      values (new.id, new.user_id, 'REJECT', row_to_json(old)::jsonb, row_to_json(new)::jsonb);
    else
      insert into transaction_audit(transaction_id, user_id, action, before, after)
      values (new.id, new.user_id, 'UPDATE', row_to_json(old)::jsonb, row_to_json(new)::jsonb);
    end if;
  elsif tg_op = 'DELETE' then
    insert into transaction_audit(transaction_id, user_id, action, before)
    values (old.id, old.user_id, 'DELETE', row_to_json(old)::jsonb);
  end if;
  return null;
end;
$$ language plpgsql;

create trigger trg_transaction_audit
  after insert or update or delete on transactions
  for each row execute function audit_transaction();

-- RLS
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table recurring_transactions enable row level security;
alter table transaction_audit enable row level security;
alter table workspaces enable row level security;
alter table user_workspaces enable row level security;

create policy "Users own their profile"
  on profiles for all using (auth.uid() = id);

create policy "Users own their accounts"
  on accounts for all using (auth.uid() = user_id);

create policy "Users own their categories"
  on categories for all using (auth.uid() = user_id);

create policy "Users own their transactions"
  on transactions for all using (auth.uid() = user_id);

create policy "Users own their recurring"
  on recurring_transactions for all using (auth.uid() = user_id);

create policy "Users own their audit trail"
  on transaction_audit for all using (auth.uid() = user_id);

create policy "Users can view workspaces they belong to"
  on workspaces for select using (
    auth.uid() in (select user_id from user_workspaces where workspace_id = id)
    or auth.uid() = created_by
  );

create policy "Owners and managers can update workspace"
  on workspaces for update using (
    auth.uid() in (select user_id from user_workspaces where workspace_id = id and role in ('owner', 'manager'))
  );

create policy "Users can view their workspace memberships"
  on user_workspaces for select using (auth.uid() = user_id);

create policy "Owners can manage workspace members"
  on user_workspaces for all using (
    auth.uid() in (select user_id from user_workspaces where workspace_id = workspace_id and role = 'owner')
  );

-- Seed function: initializes profile, default categories, and a main account
-- Called from client after first signup
create or replace function seed_user_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (id, base_currency)
  values (uid, 'BDT')
  on conflict (id) do nothing;

  insert into public.categories (user_id, parent_id, name, kind)
  select uid, null, name, kind
  from (values
    ('Housing', 'expense'),
    ('Food & Dining', 'expense'),
    ('Transportation', 'expense'),
    ('Utilities', 'expense'),
    ('Insurance', 'expense'),
    ('Healthcare', 'expense'),
    ('Entertainment', 'expense'),
    ('Shopping', 'expense'),
    ('Education', 'expense'),
    ('Personal Care', 'expense'),
    ('Travel', 'expense'),
    ('Debt Payments', 'expense'),
    ('Income', 'income'),
    ('Salary', 'income'),
    ('Freelance', 'income'),
    ('Investments', 'income'),
    ('Gifts', 'income')
  ) as t(name, kind)
  on conflict (user_id, parent_id, name) do nothing;

  insert into public.categories (user_id, parent_id, name, kind)
  select uid, p.id, sub.name, 'expense'
  from (values
    ('Housing', 'Rent'),
    ('Housing', 'Mortgage'),
    ('Housing', 'Property Tax'),
    ('Housing', 'Home Maintenance'),
    ('Food & Dining', 'Groceries'),
    ('Food & Dining', 'Restaurants'),
    ('Food & Dining', 'Coffee Shops'),
    ('Food & Dining', 'Takeout'),
    ('Transportation', 'Fuel'),
    ('Transportation', 'Public Transit'),
    ('Transportation', 'Parking'),
    ('Transportation', 'Ride Share'),
    ('Transportation', 'Vehicle Maintenance'),
    ('Utilities', 'Electricity'),
    ('Utilities', 'Water'),
    ('Utilities', 'Gas'),
    ('Utilities', 'Internet'),
    ('Utilities', 'Phone'),
    ('Insurance', 'Health Insurance'),
    ('Insurance', 'Life Insurance'),
    ('Insurance', 'Auto Insurance'),
    ('Entertainment', 'Streaming Services'),
    ('Entertainment', 'Movies'),
    ('Entertainment', 'Games'),
    ('Entertainment', 'Events'),
    ('Shopping', 'Clothing'),
    ('Shopping', 'Electronics'),
    ('Shopping', 'Home Goods'),
    ('Education', 'Tuition'),
    ('Education', 'Books'),
    ('Education', 'Courses'),
    ('Personal Care', 'Haircuts'),
    ('Personal Care', 'Gym'),
    ('Personal Care', 'Wellness'),
    ('Travel', 'Flights'),
    ('Travel', 'Hotels'),
    ('Travel', 'Car Rental'),
    ('Debt Payments', 'Credit Card'),
    ('Debt Payments', 'Loan Payment')
  ) as sub(parent_name, name)
  join public.categories p on p.user_id = uid and p.parent_id is null and p.name = sub.parent_name
  on conflict (user_id, parent_id, name) do nothing;

  if not exists (select 1 from public.accounts where user_id = uid) then
    insert into public.accounts (user_id, name, type, currency, opening_balance, icon, color)
    values (uid, 'Main Account', 'bank', 'BDT', 0, 'bank', '#1a1a1a');
  end if;
end;
$$;

-- Generate due staged transactions from active recurring schedules
-- Called on app launch; creates one transaction per overdue interval per recurring schedule
create or replace function generate_recurring_transactions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  last_date date;
  next_date date;
  generated integer := 0;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  for r in
    select * from recurring_transactions
    where user_id = uid and is_active = true
    and (end_date is null or end_date >= current_date)
    and (occurrences_remaining is null or occurrences_remaining > 0)
  loop
    select max(occurred_on) into last_date
    from transactions
    where user_id = uid and recurring_id = r.id;

    if last_date is null then
      next_date := r.start_date;
    else
      if r.interval_type = 'daily' then next_date := last_date + 1;
      elsif r.interval_type = 'weekly' then next_date := last_date + 7;
      elsif r.interval_type = 'monthly' then next_date := last_date + interval '1 month';
      elsif r.interval_type = 'yearly' then next_date := last_date + interval '1 year';
      elsif r.interval_type = 'custom' and r.interval_days is not null then next_date := last_date + r.interval_days;
      else next_date := last_date + 1;
      end if;
    end if;

    continue when next_date > current_date;
    continue when r.end_date is not null and next_date > r.end_date;
    continue when r.occurrences_remaining is not null and r.occurrences_remaining <= 0;

    insert into transactions (user_id, workspace_id, account_id, to_account_id, category_id, txn_type, amount_minor, currency, occurred_on, description, note, is_staged, recurring_id)
    values (uid, r.workspace_id, r.account_id, r.to_account_id, r.category_id, r.txn_type, r.amount_minor, r.currency, next_date, r.description, r.note, true, r.id);

    if r.occurrences_remaining is not null then
      update recurring_transactions set occurrences_remaining = occurrences_remaining - 1 where id = r.id;
    end if;

    generated := generated + 1;
  end loop;

  return generated;
end;
$$;
