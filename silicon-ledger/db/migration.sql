-- Targeted cleanup (safe — no production data)
-- Drop triggers first
drop trigger if exists trg_transaction_audit on transactions;
drop trigger if exists trg_refresh_balances on transactions;

-- Drop functions
drop function if exists refresh_account_balances();
drop function if exists audit_transaction();

-- Drop materialized view first (if old format), then regular view
drop materialized view if exists account_balances;
drop view if exists account_balances;

-- Drop indexes on tables we're altering (will be recreated)
drop index if exists idx_transactions_type;
drop index if exists idx_transactions_staged;
drop index if exists idx_transactions_user_date;
drop index if exists idx_account_balances_id;

-- Drop tables we're replacing
drop table if exists recurring_transactions;

-- ALTER existing tables instead of dropping them

-- Accounts: add currency, widen type check
alter table accounts add column if not exists currency text not null default 'BDT';
alter table accounts drop constraint if exists accounts_type_check;
alter table accounts add constraint accounts_type_check
  check (type in ('cash', 'bank', 'credit_card', 'ewallet', 'custom'));

-- Transactions: add txn_type, currency, note columns
alter table transactions add column if not exists txn_type text;
alter table transactions add column if not exists currency text not null default 'BDT';
alter table transactions add column if not exists note text not null default '';

-- Set txn_type based on existing data (legacy migration)
-- category_id != null → income/expense (requires category join to distinguish — default to expense)
-- to_account_id != null → transfer
-- For safety, we derive: if to_account_id is set AND category_id is null → transfer
-- otherwise → expense (conservative default)
update transactions
  set txn_type = case
    when to_account_id is not null and category_id is null then 'transfer'
    else 'expense'
  end
  where txn_type is null;

-- Now make txn_type NOT NULL
alter table transactions alter column txn_type set not null;

-- Drop old constraints, add new ones
alter table transactions drop constraint if exists transfers_no_category;
alter table transactions drop constraint if exists valid_transfer_accounts;

alter table transactions add constraint transfer_requires_to_account check (
  (txn_type = 'transfer' and to_account_id is not null and category_id is null)
  or (txn_type != 'transfer' and to_account_id is null and category_id is not null)
);

alter table transactions add constraint valid_transfer_accounts check (
  to_account_id is null or to_account_id != account_id
);

alter table transactions add constraint transactions_txn_type_check
  check (txn_type in ('income', 'expense', 'transfer'));

-- Recreate indexes
create index if not exists idx_transactions_type on transactions(txn_type);
create index if not exists idx_transactions_staged on transactions(is_staged) where is_staged = true;
create index if not exists idx_transactions_user_date on transactions(user_id, occurred_on desc);

-- Create recurring_transactions table
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
  interval_days integer check (interval_days > 0),
  start_date date not null,
  end_date date,
  occurrences_remaining integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_recurring_user on recurring_transactions(user_id);
create index if not exists idx_recurring_active on recurring_transactions(is_active) where is_active = true;

-- Replace materialized view with live view
create or replace view account_balances as
select
  a.id as account_id,
  a.user_id,
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
    ) from transactions t
    where (t.account_id = a.id or t.to_account_id = a.id)
    and t.is_staged = false
  ), 0) as current_balance
from accounts a;

-- Recreate audit trigger
create or replace function audit_transaction()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into transaction_audit(transaction_id, user_id, action, after)
    values (new.id, new.user_id, 'INSERT', row_to_json(new)::jsonb);
  elsif tg_op = 'UPDATE' then
    insert into transaction_audit(transaction_id, user_id, action, before, after)
    values (new.id, new.user_id, 'UPDATE', row_to_json(old)::jsonb, row_to_json(new)::jsonb);
  elsif tg_op = 'DELETE' then
    insert into transaction_audit(transaction_id, user_id, action, before)
    values (old.id, old.user_id, 'DELETE', row_to_json(old)::jsonb);
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_transaction_audit on transactions;
create trigger trg_transaction_audit
  after insert or update or delete on transactions
  for each row execute function audit_transaction();

-- Enable RLS on new table
alter table recurring_transactions enable row level security;

drop policy if exists "Users own their recurring" on recurring_transactions;
create policy "Users own their recurring"
  on recurring_transactions for all using (auth.uid() = user_id);

-- Ensure RLS is enabled on existing tables
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table transaction_audit enable row level security;

-- Add recurring_id FK to transactions for tracking generated entries
alter table transactions add column if not exists recurring_id uuid references recurring_transactions(id) on delete set null;
create index if not exists idx_transactions_recurring on transactions(recurring_id);

-- Generate due staged transactions from active recurring schedules
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

    insert into transactions (user_id, account_id, to_account_id, category_id, txn_type, amount_minor, currency, occurred_on, description, note, is_staged, recurring_id)
    values (uid, r.account_id, r.to_account_id, r.category_id, r.txn_type, r.amount_minor, r.currency, next_date, r.description, r.note, true, r.id);

    if r.occurrences_remaining is not null then
      update recurring_transactions set occurrences_remaining = occurrences_remaining - 1 where id = r.id;
    end if;

    generated := generated + 1;
  end loop;

  return generated;
end;
$$;

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

  -- Create profile if not exists
  insert into public.profiles (id, base_currency)
  values (uid, 'BDT')
  on conflict (id) do nothing;

  -- Seed default categories (parent-level)
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

  -- Seed subcategories
  insert into public.categories (user_id, parent_id, name, kind)
  select uid, p.id, sub.name, 'expense'
  from (values
    ('Housing', 'Rent'),
    ('Housing', 'Mortgage'),
    ('Housing', 'Property Tax'),
    ('Housing', 'Home Maintenance'),
    ('Housing', 'Home Insurance'),
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
    ('Shopping', 'Gifts'),
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

  -- Create default account if none exists
  if not exists (select 1 from public.accounts where user_id = uid) then
    insert into public.accounts (user_id, name, type, currency, opening_balance, icon, color)
    values (uid, 'Main Account', 'bank', 'BDT', 0, 'bank', '#1a1a1a');
  end if;
end;
$$;

-- === Migration v2: Workspaces ===
-- Applied 2026-07-14

create table if not exists workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists user_workspaces (
  user_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  invited_by uuid references profiles(id),
  joined_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

alter table accounts add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table categories add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table transactions add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table recurring_transactions add column if not exists workspace_id uuid references workspaces(id) on delete cascade;

create index if not exists idx_accounts_workspace on accounts(workspace_id);
create index if not exists idx_categories_workspace on categories(workspace_id);
create index if not exists idx_transactions_workspace on transactions(workspace_id);
create index if not exists idx_recurring_workspace on recurring_transactions(workspace_id);
create index if not exists idx_user_workspaces_user on user_workspaces(user_id);
create index if not exists idx_user_workspaces_ws on user_workspaces(workspace_id);

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
    ) from transactions t
    where (t.account_id = a.id or t.to_account_id = a.id)
    and t.is_staged = false
  ), 0) as current_balance
from accounts a;

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
    from transactions where user_id = uid and recurring_id = r.id;
    if last_date is null then next_date := r.start_date;
    else
      if r.interval_type = 'daily' then next_date := last_date + 1;
      elsif r.interval_type = 'weekly' then next_date := last_date + 7;
      elsif r.interval_type = 'monthly' then next_date := last_date + interval '1 month';
      elsif r.interval_type = 'yearly' then next_date := last_date + interval '1 year';
      elsif r.interval_type = 'custom' and r.interval_days is not null then next_date := last_date + r.interval_days;
      else next_date := last_date + 1; end if;
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

alter table workspaces enable row level security;
alter table user_workspaces enable row level security;

create policy "Users can view workspaces they belong to"
  on workspaces for select using (
    auth.uid() in (select user_id from user_workspaces where workspace_id = id) or auth.uid() = created_by
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
