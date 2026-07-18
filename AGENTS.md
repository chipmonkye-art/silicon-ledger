# Silicon Accounting App

Personal finance/accounting engine — mobile-first PWA, precision integer math, red minimalist design.

## Tech Stack
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **Routing:** TanStack Router (file-based, type-safe)
- **State:** TanStack Query (server cache), Zustand (local UI state)
- **Database:** Supabase (PostgreSQL + RLS + Auth)
- **Currency:** Integer cents (`amount_minor`), no floating-point math
- **Design:** Red accent `oklch(0.58 0.22 25)`, 1px hairline borders, JetBrains Mono for numbers

## Database Tables
| Table | Purpose |
|---|---|
| `profiles` | User preferences, base_currency |
| `accounts` | Cash/Bank/CC/Ewallet/Custom with currency, opening_balance & archived_at |
| `categories` | Hierarchical tree, kind (income/expense) |
| `transactions` | Core ledger: amount_minor, currency, txn_type (income/expense/transfer), is_staged |
| `recurring_transactions` | Multi-year bulk planning (daily/weekly/monthly/yearly/custom intervals) |
| `transaction_audit` | Insert-only audit log (action, before/after JSONB) |
| `fx_rates` | Shared FX cache (quote/base pairs) |

## Financial Rules
- Balance = Opening Balance + Σ(income) − Σ(expense) ± transfers
- Credit Cards = liability: expenses increase liability (negative), payments are transfers from bank
- Transfers must NOT affect Net Worth (txn_type = 'transfer', null category_id)
- All amounts in cents (integers), formatted as dollars with 2 decimals
- All mutations logged to `transaction_audit` via DB trigger
- Staging gate: transactions enter as `is_staged = true`, approve to move to ledger
- Multi-currency: `currency` on accounts + transactions, `fx_rates` for conversion
- Recurring: `recurring_transactions` for multi-year bulk planning

## Project Structure
```
opencode/
  AGENTS.md               — This file (project summary + state)
  session.md              — Anchored session summary (work state, next steps)

  silicon-ledger/         — App project root
    AGENTS.md             — Full project blueprint + detailed architecture
    db/
      schema.sql          — Full PostgreSQL schema
      migration.sql       — Incremental migration (v0→v1: txn_type, currency, recurring)
    app/                  — React frontend
      client.tsx          — Entry point
      lib/
        supabase.ts       — Supabase client
        api.ts            — Data layer (Supabase queries)
        types.ts          — TypeScript types
        utils.ts          — cn(), formatCents(), date helpers
        stores.ts         — Zustand stores
      components/         — UI components (TabBar, AddTransaction, AccountCard, ui/*)
      routes/             — TanStack Router routes (dashboard, transactions, calendar, accounts, reports, settings, login)
```

## Supabase
- Project: `vbnifgchhlltdgdpinom` (ca-central-1, PostgreSQL 17, status ACTIVE_HEALTHY)
- Management API: OAuth token at `~/.local/share/opencode/mcp-auth.json`
- Anon key + service role key in `silicon-ledger/.env`
