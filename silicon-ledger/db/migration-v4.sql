-- === Migration v4: Inventory & Manufacturing ===
-- Applied 2026-07-15
-- Covers: items, UOMs, godowns, batches, stock ledger, BOMs, manufacturing, job work

-- 0. Extend account types for party/supplier/customer
alter table accounts drop constraint if exists accounts_type_check;
alter table accounts add constraint accounts_type_check
  check (type in ('cash', 'bank', 'credit_card', 'ewallet', 'custom', 'supplier', 'customer'));

-- 1. Units of Measure
create table if not exists item_uoms (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  short_name text not null,
  uom_category text not null check (uom_category in ('count', 'weight', 'volume', 'length', 'area', 'time')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id, short_name)
);

-- 2. UOM conversions (floating — e.g., 1 ton = 1000 kg)
create table if not exists item_uom_conversions (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  from_uom_id uuid not null references item_uoms(id) on delete restrict,
  to_uom_id uuid not null references item_uoms(id) on delete restrict,
  conversion_factor numeric not null check (conversion_factor > 0),
  created_at timestamptz not null default now(),
  unique(workspace_id, from_uom_id, to_uom_id)
);

-- 3. Items (Item Master)
create table if not exists items (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  sku text,
  item_type text not null check (item_type in ('good', 'service')) default 'good',
  category_id uuid references categories(id) on delete set null,
  base_uom_id uuid references item_uoms(id) on delete restrict,
  purchase_uom_id uuid references item_uoms(id) on delete set null,
  selling_uom_id uuid references item_uoms(id) on delete set null,
  valuation_method text not null check (valuation_method in ('fifo', 'average', 'lifo', 'standard', 'last_purchase')) default 'average',
  standard_cost integer,
  gst_hsn_code text,
  is_active boolean not null default true,
  opening_stock numeric not null default 0,
  opening_stock_rate integer,
  reorder_level numeric,
  reorder_qty numeric,
  min_stock_qty numeric,
  max_stock_qty numeric,
  description text,
  created_at timestamptz not null default now(),
  unique(workspace_id, name)
);

-- 4. Godowns (hierarchical storage locations)
create table if not exists godowns (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  parent_id uuid references godowns(id) on delete set null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id, name)
);

-- 5. Item Batches (lot/batch tracking with mfg & expiry dates)
create table if not exists item_batches (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  batch_no text not null,
  mfg_date date,
  expiry_date date,
  opening_qty numeric not null default 0,
  purchase_rate integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id, item_id, batch_no)
);

-- 6. Stock Ledger (every movement — perpetual audit trail)
create table if not exists stock_ledger (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  godown_id uuid references godowns(id) on delete restrict,
  batch_id uuid references item_batches(id) on delete set null,
  transaction_id uuid references transactions(id) on delete set null,
  movement_type text not null check (movement_type in (
    'opening', 'purchase_receipt', 'sales_delivery',
    'stock_transfer_out', 'stock_transfer_in',
    'manufacturing_consumption', 'manufacturing_output',
    'job_work_issue', 'job_work_receipt',
    'stock_addition', 'stock_reduction'
  )),
  quantity_in numeric not null default 0,
  quantity_out numeric not null default 0,
  rate integer,
  amount integer,
  ref_id uuid,
  ref_type text,
  narration text,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 7. Stock View (current balance per item + godown + batch)
drop view if exists stock;
create view stock as
select
  s.workspace_id,
  s.item_id,
  i.name as item_name,
  i.sku,
  s.godown_id,
  g.name as godown_name,
  s.batch_id,
  b.batch_no,
  b.mfg_date,
  b.expiry_date,
  coalesce(sum(s.quantity_in), 0) - coalesce(sum(s.quantity_out), 0) as current_qty,
  case
    when coalesce(sum(s.quantity_in), 0) > 0
    then round((coalesce(sum(s.amount), 0) / nullif(coalesce(sum(s.quantity_in), 0), 0))::numeric)
    else 0
  end as avg_rate
from stock_ledger s
left join items i on i.id = s.item_id
left join godowns g on g.id = s.godown_id
left join item_batches b on b.id = s.batch_id
group by s.workspace_id, s.item_id, i.name, i.sku, s.godown_id, g.name, s.batch_id, b.batch_no, b.mfg_date, b.expiry_date
having coalesce(sum(s.quantity_in), 0) - coalesce(sum(s.quantity_out), 0) != 0;

-- 8. Bill of Materials (BOM) — how finished goods are made
create table if not exists boms (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  finished_item_id uuid not null references items(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  wastage_pct numeric not null default 0 check (wastage_pct >= 0),
  is_active boolean not null default true,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now()
);

-- 9. BOM Items (raw materials / scrap / by-products per BOM)
create table if not exists bom_items (
  id uuid primary key default uuid_generate_v4(),
  bom_id uuid not null references boms(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  uom_id uuid references item_uoms(id) on delete set null,
  wastage_pct numeric not null default 0 check (wastage_pct >= 0),
  is_scrap boolean not null default false,
  created_at timestamptz not null default now()
);

-- 10. Manufacturing Orders
create table if not exists manufacturing_orders (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  order_no text,
  bom_id uuid references boms(id) on delete restrict,
  item_id uuid not null references items(id) on delete restrict,
  planned_qty numeric not null check (planned_qty > 0),
  produced_qty numeric not null default 0,
  scrapped_qty numeric not null default 0,
  start_date date,
  end_date date,
  status text not null check (status in ('planned', 'in_progress', 'completed', 'cancelled')) default 'planned',
  output_godown_id uuid references godowns(id) on delete restrict,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 11. Manufacturing Consumption (raw materials issued)
create table if not exists manufacturing_consumption (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  manufacturing_order_id uuid not null references manufacturing_orders(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  batch_id uuid references item_batches(id) on delete set null,
  godown_id uuid references godowns(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  rate integer,
  amount integer,
  created_at timestamptz not null default now()
);

-- 12. Manufacturing Output (finished goods produced)
create table if not exists manufacturing_output (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  manufacturing_order_id uuid not null references manufacturing_orders(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  batch_id uuid references item_batches(id) on delete set null,
  godown_id uuid references godowns(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  rate integer,
  amount integer,
  created_at timestamptz not null default now()
);

-- 13. Job Work (principal or job worker)
create table if not exists job_work (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  job_type text not null check (job_type in ('principal', 'job_worker')),
  party_account_id uuid not null references accounts(id) on delete restrict,
  item_id uuid not null references items(id) on delete restrict,
  quantity_sent numeric not null default 0,
  quantity_received numeric not null default 0,
  rate integer,
  amount integer,
  challan_no text,
  status text not null check (status in ('sent', 'partially_received', 'completed', 'cancelled')) default 'sent',
  date_sent date,
  date_received date,
  godown_id uuid references godowns(id) on delete restrict,
  narration text,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── Indexes ──
create index if not exists idx_items_workspace on items(workspace_id);
create index if not exists idx_items_sku on items(workspace_id, sku);
create index if not exists idx_items_category on items(category_id);
create index if not exists idx_godowns_workspace on godowns(workspace_id);
create index if not exists idx_godowns_parent on godowns(parent_id);
create index if not exists idx_item_batches_workspace on item_batches(workspace_id);
create index if not exists idx_item_batches_item on item_batches(item_id);
create index if not exists idx_item_batches_expiry on item_batches(expiry_date) where expiry_date is not null;
create index if not exists idx_stock_ledger_workspace on stock_ledger(workspace_id);
create index if not exists idx_stock_ledger_item on stock_ledger(item_id);
create index if not exists idx_stock_ledger_godown on stock_ledger(godown_id);
create index if not exists idx_stock_ledger_batch on stock_ledger(batch_id);
create index if not exists idx_stock_ledger_transaction on stock_ledger(transaction_id);
create index if not exists idx_stock_ledger_created on stock_ledger(created_at);
create index if not exists idx_boms_workspace on boms(workspace_id);
create index if not exists idx_boms_finished on boms(finished_item_id);
create index if not exists idx_bom_items_bom on bom_items(bom_id);
create index if not exists idx_manufacturing_orders_workspace on manufacturing_orders(workspace_id);
create index if not exists idx_manufacturing_orders_status on manufacturing_orders(status);
create index if not exists idx_manufacturing_consumption_order on manufacturing_consumption(manufacturing_order_id);
create index if not exists idx_manufacturing_output_order on manufacturing_output(manufacturing_order_id);
create index if not exists idx_job_work_workspace on job_work(workspace_id);
create index if not exists idx_job_work_party on job_work(party_account_id);
create index if not exists idx_job_work_status on job_work(status);
create index if not exists idx_uoms_workspace on item_uoms(workspace_id);
create index if not exists idx_uom_conversions_workspace on item_uom_conversions(workspace_id);

-- ── RLS ──
alter table item_uoms enable row level security;
alter table item_uom_conversions enable row level security;
alter table items enable row level security;
alter table godowns enable row level security;
alter table item_batches enable row level security;
alter table stock_ledger enable row level security;
alter table boms enable row level security;
alter table bom_items enable row level security;
alter table manufacturing_orders enable row level security;
alter table manufacturing_consumption enable row level security;
alter table manufacturing_output enable row level security;
alter table job_work enable row level security;

-- Workspace-scoped RLS for all inventory tables
do $$
declare
  tbl text;
begin
  for tbl in array[
    'item_uoms', 'item_uom_conversions', 'items', 'godowns',
    'item_batches', 'stock_ledger', 'boms', 'bom_items',
    'manufacturing_orders', 'manufacturing_consumption', 'manufacturing_output',
    'job_work'
  ]
  loop
    execute format(
      'drop policy if exists "Users can manage their workspace %1$s" on %1$s;
       create policy "Users can manage their workspace %1$s"
         on %1$s for all using (
           workspace_id in (
             select workspace_id from user_workspaces
             where user_id = auth.uid() and role in (''owner'', ''manager'', ''staff'')
           )
         );
       drop policy if exists "Auditor read-only on %1$s" on %1$s;
       create policy "Auditor read-only on %1$s"
         on %1$s for select using (
           workspace_id in (
             select workspace_id from user_workspaces
             where user_id = auth.uid() and role = ''auditor''
           )
         );',
      tbl
    );
  end loop;
end;
$$;

-- ── Function: Record stock movement + optionally create financial transaction ──
create or replace function record_stock_movement(
  p_workspace_id uuid,
  p_item_id uuid,
  p_godown_id uuid,
  p_batch_id uuid,
  p_movement_type text,
  p_quantity_in numeric,
  p_quantity_out numeric,
  p_rate integer,
  p_narration text,
  p_create_txn boolean default false,
  p_txn_account_id uuid default null,
  p_txn_type text default null,
  p_txn_amount_minor integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_txn_id uuid;
  v_amount integer;
  v_ledger_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  v_amount := p_rate * (p_quantity_in - p_quantity_out);

  insert into stock_ledger (
    workspace_id, item_id, godown_id, batch_id, movement_type,
    quantity_in, quantity_out, rate, amount, narration, created_by
  ) values (
    p_workspace_id, p_item_id, p_godown_id, p_batch_id, p_movement_type,
    p_quantity_in, p_quantity_out, p_rate, v_amount, p_narration, uid
  ) returning id into v_ledger_id;

  if p_create_txn and p_txn_account_id is not null and p_txn_type is not null and p_txn_amount_minor is not null then
    insert into transactions (
      user_id, workspace_id, account_id, txn_type, amount_minor,
      currency, occurred_on, description, is_staged, note
    ) values (
      uid, p_workspace_id, p_txn_account_id, p_txn_type, p_txn_amount_minor,
      (select base_currency from profiles where id = uid),
      current_date, p_narration, false, 'Auto-generated from stock movement'
    ) returning id into v_txn_id;

    update stock_ledger set transaction_id = v_txn_id where id = v_ledger_id;
  end if;

  return v_ledger_id;
end;
$$;

-- ── Function: Complete manufacturing (consumption + output in one call) ──
create or replace function complete_manufacturing(
  p_order_id uuid,
  p_consumption_data jsonb,
  p_output_quantity numeric,
  p_output_godown_id uuid,
  p_output_batch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_workspace_id uuid;
  v_item_id uuid;
  v_item record;
  v_total_cost integer := 0;
  v_rate integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select workspace_id, item_id into v_workspace_id, v_item_id
  from manufacturing_orders where id = p_order_id;

  -- Process consumption lines
  for v_item in select * from jsonb_to_recordset(p_consumption_data) as x(
    item_id uuid, quantity numeric, rate integer, godown_id uuid, batch_id uuid
  )
  loop
    insert into manufacturing_consumption (
      workspace_id, manufacturing_order_id, item_id, batch_id, godown_id, quantity, rate, amount
    ) values (
      v_workspace_id, p_order_id, v_item.item_id, v_item.batch_id, v_item.godown_id,
      v_item.quantity, v_item.rate, v_item.rate * v_item.quantity
    );

    perform record_stock_movement(
      v_workspace_id, v_item.item_id, v_item.godown_id, v_item.batch_id,
      'manufacturing_consumption', 0, v_item.quantity, v_item.rate,
      'Consumed in manufacturing order ' || p_order_id
    );

    v_total_cost := v_total_cost + (v_item.rate * v_item.quantity);
  end loop;

  -- Record output
  v_rate := case when p_output_quantity > 0 then v_total_cost / p_output_quantity else 0 end;

  insert into manufacturing_output (
    workspace_id, manufacturing_order_id, item_id, batch_id, godown_id, quantity, rate, amount
  ) values (
    v_workspace_id, p_order_id, v_item_id, p_output_batch_id, p_output_godown_id,
    p_output_quantity, v_rate, v_total_cost
  );

  perform record_stock_movement(
    v_workspace_id, v_item_id, p_output_godown_id, p_output_batch_id,
    'manufacturing_output', p_output_quantity, 0, v_rate,
    'Produced from manufacturing order ' || p_order_id
  );

  update manufacturing_orders
  set produced_qty = produced_qty + p_output_quantity, status = 'completed', end_date = current_date
  where id = p_order_id;
end;
$$;
