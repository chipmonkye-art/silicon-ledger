-- === Migration v3: Auditor RBAC, Aging Views, Credit Limits, Multi-language Aliases, Excel Import Log ===
-- Applied 2026-07-15

-- 1. Accounts: add credit_limit columns and language aliases
alter table accounts add column if not exists credit_limit integer;
alter table accounts add column if not exists credit_limit_type text check (credit_limit_type in ('soft', 'hard'));
alter table accounts add column if not exists name_bn text;
alter table accounts add column if not exists name_alias text;

-- 2. Categories: add language aliases
alter table categories add column if not exists name_bn text;
alter table categories add column if not exists name_alias text;

-- 3. Transactions: add payment tracking columns
alter table transactions add column if not exists bill_reference text;
alter table transactions add column if not exists paid_amount_minor integer;
alter table transactions add column if not exists payment_status text check (payment_status in ('unpaid', 'partial', 'paid', 'overpaid'));
alter table transactions add column if not exists payment_matched_transaction_id uuid references transactions(id) on delete set null;
alter table transactions add column if not exists due_date date;
alter table transactions add column if not exists is_msme_record boolean not null default false;
alter table transactions add column if not exists msme_credit_days integer;
alter table transactions add column if not exists rejected_by uuid references profiles(id);
alter table transactions add column if not exists approved_by uuid references profiles(id);

-- 4. Workspaces: add language config
alter table workspaces add column if not exists default_language text not null default 'en';
alter table workspaces add column if not exists supported_languages jsonb not null default '["en"]'::jsonb;

-- 5. Excel Import Log
create table if not exists import_log (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  file_name text not null,
  file_type text not null default 'xlsx',
  mapping jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for new columns
create index if not exists idx_transactions_payment_status on transactions(workspace_id, payment_status);
create index if not exists idx_transactions_due_date on transactions(due_date) where due_date is not null;
create index if not exists idx_transactions_rejected_by on transactions(rejected_by);
create index if not exists idx_transactions_approved_by on transactions(approved_by);
create index if not exists idx_import_log_workspace on import_log(workspace_id);

-- 6. Aging view: buckets overdue invoices by days
drop view if exists aging_analysis;
create view aging_analysis as
select
  t.workspace_id,
  t.user_id,
  t.account_id,
  a.name as account_name,
  t.id as transaction_id,
  t.bill_reference,
  t.description,
  t.amount_minor,
  t.paid_amount_minor,
  t.due_date,
  t.payment_status,
  case
    when t.payment_status = 'paid' then 'Paid'
    when t.due_date is null then 'No Due Date'
    when (current_date - t.due_date) <= 0 then 'Current'
    when (current_date - t.due_date) between 1 and 30 then '1-30 Days'
    when (current_date - t.due_date) between 31 and 60 then '31-60 Days'
    when (current_date - t.due_date) between 61 and 90 then '61-90 Days'
    else '90+ Days'
  end as aging_bucket,
  case
    when t.due_date is not null and t.payment_status != 'paid'
    then greatest(0, current_date - t.due_date)
    else 0
  end as days_overdue,
  t.amount_minor - coalesce(t.paid_amount_minor, 0) as remaining_due
from transactions t
join accounts a on a.id = t.account_id
where t.is_staged = false
  and t.is_rejected = false;

-- 7. Payment performance view: avg approval time per workspace
drop view if exists payment_performance;
create view payment_performance as
select
  t.workspace_id,
  count(*) filter (where t.is_staged = false and t.is_rejected = false) as approved_count,
  count(*) filter (where t.is_rejected = true) as rejected_count,
  round(
    avg(
      extract(epoch from (coalesce(
        (select min(audit.created_at) from transaction_audit audit
         where audit.transaction_id = t.id and audit.action = 'UPDATE' and (audit.after->>'is_staged')::text = 'false'),
        t.created_at
      ) - t.created_at)) / 3600
    )::numeric, 1
  ) as avg_approval_hours,
  count(*) filter (
    where t.due_date is not null
      and t.payment_status is not null
      and t.payment_status != 'paid'
      and t.due_date < current_date
  ) as overdue_count
from transactions t
group by t.workspace_id;

-- 8. Credit card utilization view
drop view if exists credit_utilization;
create view credit_utilization as
select
  a.id as account_id,
  a.name,
  a.workspace_id,
  a.credit_limit,
  a.credit_limit_type,
  coalesce(ab.current_balance, 0) as current_balance,
  case
    when a.credit_limit > 0
    then round((abs(coalesce(ab.current_balance, 0))::numeric / a.credit_limit::numeric) * 100, 1)
    else 0
  end as usage_pct,
  case
    when a.credit_limit > 0
    then a.credit_limit - abs(coalesce(ab.current_balance, 0))
    else 0
  end as credit_remaining,
  case
    when a.credit_limit > 0 and a.credit_limit_type = 'hard'
      and abs(coalesce(ab.current_balance, 0)) > a.credit_limit
    then true
    else false
  end as is_over_limit
from accounts a
left join account_balances ab on ab.account_id = a.id
where a.credit_limit is not null;

-- 9. Auditor RLS: read-only policies
-- Drop existing workspace policies first
drop policy if exists "Auditor read-only on accounts" on accounts;
drop policy if exists "Auditor read-only on transactions" on transactions;
drop policy if exists "Auditor read-only on categories" on categories;
drop policy if exists "Auditor read-only on recurring" on recurring_transactions;
drop policy if exists "Auditor read-only on audit" on transaction_audit;

-- Accounts: auditors can only SELECT
create policy "Auditor read-only on accounts"
  on accounts for select
  using (
    auth.uid() = user_id
    or workspace_id in (
      select workspace_id from user_workspaces
      where user_id = auth.uid() and role = 'auditor'
    )
  );

-- Transactions: auditors can only SELECT
create policy "Auditor read-only on transactions"
  on transactions for select
  using (
    auth.uid() = user_id
    or workspace_id in (
      select workspace_id from user_workspaces
      where user_id = auth.uid() and role = 'auditor'
    )
  );

-- Categories: auditors can only SELECT
create policy "Auditor read-only on categories"
  on categories for select
  using (
    auth.uid() = user_id
    or workspace_id in (
      select workspace_id from user_workspaces
      where user_id = auth.uid() and role = 'auditor'
    )
  );

-- Recurring: auditors can only SELECT
create policy "Auditor read-only on recurring"
  on recurring_transactions for select
  using (
    auth.uid() = user_id
    or workspace_id in (
      select workspace_id from user_workspaces
      where user_id = auth.uid() and role = 'auditor'
    )
  );

-- Audit trail: auditors can only SELECT
create policy "Auditor read-only on audit"
  on transaction_audit for select
  using (
    auth.uid() = user_id
    or transaction_id in (
      select id from transactions where workspace_id in (
        select workspace_id from user_workspaces
        where user_id = auth.uid() and role = 'auditor'
      )
    )
  );

-- Import log: workspace members can view
alter table import_log enable row level security;

create policy "Users can view import logs in their workspace"
  on import_log for select
  using (
    auth.uid() = user_id
    or workspace_id in (
      select workspace_id from user_workspaces
      where user_id = auth.uid()
    )
  );

create policy "Users can create import logs"
  on import_log for insert
  with check (
    auth.uid() = user_id
  );

-- 10. Update audit trigger to capture REJECT with rejected_by
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

-- 11. Function: import transactions from mapped data
create or replace function import_transactions_batch(
  p_workspace_id uuid,
  p_data jsonb,
  p_mapping jsonb
)
returns table(imported integer, errors jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  imported_count integer := 0;
  error_items jsonb := '[]'::jsonb;
  v_account_id uuid;
  v_category_id uuid;
  v_amount_minor integer;
  v_txn_type text;
  v_occurred_on date;
  v_description text;
  v_bill_reference text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  for item in select * from jsonb_array_elements(p_data)
  loop
    begin
      v_account_id := (item->>(p_mapping->>'account_column'))::uuid;
      v_amount_minor := (item->>(p_mapping->>'amount_column'))::integer;
      v_txn_type := item->>(p_mapping->>'type_column');
      v_occurred_on := (item->>(p_mapping->>'date_column'))::date;
      v_description := item->>(p_mapping->>'description_column');
      v_bill_reference := item->>(p_mapping->>'bill_reference_column');

      insert into transactions (
        user_id, workspace_id, account_id, txn_type, amount_minor,
        currency, occurred_on, description, is_staged, bill_reference
      ) values (
        uid, p_workspace_id, v_account_id, v_txn_type, v_amount_minor,
        'USD', v_occurred_on, v_description, true, v_bill_reference
      );
      imported_count := imported_count + 1;
    exception when others then
      error_items := error_items || jsonb_build_object(
        'row', item,
        'error', SQLERRM
      );
    end;
  end loop;

  return query select imported_count, error_items;
end;
$$;
