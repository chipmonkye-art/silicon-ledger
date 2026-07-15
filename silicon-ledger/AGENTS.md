# Silicon Accounting App

Precision accounting engine. Mobile-first PWA. Red minimalist design.

## Tech Stack
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **Routing:** TanStack Router (file-based, type-safe)
- **State:** TanStack Query (server cache), Zustand (UI state)
- **Database:** Supabase (PostgreSQL + RLS + Auth)
- **Currency:** Integer cents (`amount_minor`), no floating-point math
- **Design:** Red accent `oklch(0.58 0.22 25)`, 1px hairline borders, JetBrains Mono for numbers

## Architecture

```
silicon-ledger/
  AGENTS.md               — This file
  db/
    schema.sql            — Full PostgreSQL schema (tables, indexes, RLS, views, triggers, audit)
    migration.sql         — Incremental migration from v0 to v1 (txn_type, currency, recurring)

  app/                    — React frontend
    client.tsx            — Entry point
    vite-env.d.ts         — Vite env type declarations
    styles/
      globals.css         — Tailwind CSS v4 with custom theme (expense red, hairline borders)
    public/
      manifest.json       — PWA manifest
      icons/              — App icons
    lib/
      supabase.ts         — Supabase client (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
      api.ts              — Data layer (supabase queries for accounts, transactions, categories, summary)
      types.ts            — TypeScript types (Profile, Account, Category, Transaction, MonthlySummary, etc.)
      utils.ts            — cn(), formatCents(), formatCentsCompact(), date helpers
      stores.ts           — Zustand stores (authStore: token/userId, sheetStore: FAB sheet)
    components/
      ui/
        button.tsx        — Button (default/ghost/outline/danger, sm/md/lg)
        card.tsx          — Card, CardHeader, CardTitle
        input.tsx         — Input with label
        bottom-sheet.tsx  — Slide-up modal with backdrop
      TabBar.tsx          — Bottom tab navigation (5 tabs + center FAB)
      AddTransaction.tsx  — Bottom sheet form (expense/income/transfer type toggle)
      AccountCard.tsx     — Account row (icon, name, type, balance)
    routes/
      __root.tsx          — Root layout (wraps all routes)
      index.tsx           — Redirects to /dashboard
      _authenticated.tsx  — Auth guard layout (redirects to login if no session)
      _authenticated/
        dashboard.tsx     — Net worth, account balances, monthly rollup
        transactions.tsx  — Filterable ledger (staged/cleared/all, search)
        calendar.tsx      — Monthly grid with day totals
        accounts.tsx      — Account list with summary card
        reports.tsx       — Lifetime totals + monthly breakdown bars
        settings.tsx      — Currency, categories, theme, sign out
      auth/
        login.tsx         — Email/password sign in
```

## Database Schema (db/schema.sql)

| Table | Purpose |
|---|---|
| `profiles` | User preferences, base_currency |
| `accounts` | Cash/Bank/CC/Ewallet/Custom with currency, opening_balance & archived_at |
| `categories` | Hierarchical tree, kind (income/expense) |
| `transactions` | Core ledger: amount_minor, currency, txn_type (income/expense/transfer), is_staged |
| `recurring_transactions` | Multi-year bulk planning (daily/weekly/monthly/yearly/custom intervals) |
| `transaction_audit` | Insert-only audit log (action, before/after JSONB) |
| `fx_rates` | Shared FX cache (quote/base pairs) |

### Key Constraints
- `txn_type = 'transfer'`: `to_account_id` required, `category_id` must be null
- `txn_type` is `income` or `expense`: `category_id` required, `to_account_id` must be null
- `amount_minor` > 0 (direction determined by txn_type)
- Self-transfers forbidden (`to_account_id != account_id`)

### Live View: `account_balances`
- Regular view (not materialized) — always real-time
- Formula: opening_balance + Σ(income) − Σ(expense) ± transfers
- No refresh trigger needed

### Row Level Security
All tables: `auth.uid() = user_id` (zero-trust multi-tenant isolation)

### Audit Trigger
`trg_transaction_audit` — logs every INSERT/UPDATE/DELETE to `transaction_audit`

## Routes

| Path | Page | Auth |
|---|---|---|
| `/` | Redirects to /dashboard | - |
| `/auth/login` | Email/password sign in | Public |
| `/dashboard` | Net worth, account balances, monthly rollup | Required |
| `/transactions` | Filterable transaction ledger | Required |
| `/calendar` | Monthly calendar grid | Required |
| `/reports` | Lifetime totals + monthly breakdown | Required |
| `/accounts` | Account list with summary | Required |
| `/settings` | Currency, categories, logout | Required |

## Financial Rules
- Balance = Opening Balance + Σ(income) − Σ(expense) ± transfers
- Credit Cards = liability: expenses increase liability (negative balance), payments are transfers from bank
- Transfers must NOT affect Net Worth (txn_type = 'transfer', no category)
- All amounts in cents (integers), formatted as dollars with 2 decimals
- Staging gate: transactions enter as `is_staged = true`, can be cleared to enter ledger
- Multi-currency: `currency` on accounts + transactions, `fx_rates` for conversion
- Recurring: `recurring_transactions` table for multi-year bulk planning (batch-create staged transactions)

## Design Conventions
- Expense amounts: `text-expense` (oklch(0.58 0.22 25))
- Income amounts: `text-income` (foreground color)
- Numbers: JetBrains Mono, right-aligned
- Borders: 1px hairline (`border-hairline`)
- No shadows, no gradients
- Mobile-first: max-w-lg centered, bottom tab bar

## Environment
```
VITE_SUPABASE_URL=https://vbnifgchhlltdgdpinom.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZibmlmZ2NoaGxsdGRnZHBpbm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDM3NDcsImV4cCI6MjA5OTU3OTc0N30.d-i1hAyaPyyiCwOcRTaJWF3mpcU4AyWQ-AqsNkizSo8
```

## Commands
- `npm run dev` — Start Vite dev server
- `npm run build` — TypeScript check + Vite production build
- `npm run preview` — Preview production build
- `npm run db:push` — Push schema to PostgreSQL
- `npm run router:generate` — Regenerate route tree

## Supabase
- Project ref: `vbnifgchhlltdgdpinom` (ca-central-1)
- Management API token: `sbp_oauth_cbe71e95cdf2d025de6179617d8c0c8c9d515776`
- OAuth stored at `~/.local/share/opencode/mcp-auth.json`
