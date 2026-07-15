# Silicon Accounting App

Precision accounting engine. Mobile-first PWA. Red minimalist design.

## Status — Project Setup Complete ✅

| Milestone | Status |
|---|---|
| Project scaffolding | ✅ Vite + React 19 + TypeScript |
| Routing | ✅ TanStack Router (file-based, type-safe) |
| State management | ✅ TanStack Query + Zustand |
| Database | ✅ Supabase PostgreSQL (project: `vbnifgchhlltdgdpinom`) |
| Schema deployed | ✅ 6 tables, materialized view, RLS, audit triggers |
| PWA manifest | ✅ Configured |
| Dev server | ✅ Running at `localhost:5173` |

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind CSS v4
- **Routing:** TanStack Router (file-based with auto-generated route tree)
- **State:** TanStack Query (server cache), Zustand (UI state)
- **Database:** Supabase (PostgreSQL 17, RLS, Auth)
- **Design:** Red accent `oklch(0.58 0.22 25)`, 1px hairline borders, JetBrains Mono for numbers

## Project Structure

```
silicon-ledger/
├── AGENTS.md              — Full architecture docs for AI
├── db/
│   ├── schema.sql         — Deployed PostgreSQL schema
│   └── push.mjs           — Schema push script
├── app/
│   ├── client.tsx         — Entry point
│   ├── styles/globals.css — Tailwind CSS v4 theme
│   ├── public/
│   │   ├── manifest.json  — PWA manifest
│   │   └── icons/icon.svg — App icon
│   ├── lib/
│   │   ├── supabase.ts    — Supabase client
│   │   ├── api.ts         — Data layer (accounts, transactions, summary)
│   │   ├── types.ts       — TypeScript types
│   │   ├── utils.ts       — cn(), formatCents(), date helpers
│   │   └── stores.ts      — Zustand stores (auth, sheet)
│   ├── components/
│   │   ├── TabBar.tsx     — Bottom tab nav (5 tabs + FAB)
│   │   ├── AddTransaction.tsx — Slide-up transaction form
│   │   ├── AccountCard.tsx — Account balance row
│   │   └── ui/            — button, card, input, bottom-sheet
│   └── routes/
│       ├── __root.tsx     — Root layout
│       ├── index.tsx      — Redirects to /dashboard
│       ├── _authenticated.tsx — Auth guard + TabBar layout
│       ├── auth/login.tsx — Sign in / Sign up
│       └── _authenticated/
│           ├── dashboard.tsx    — Net worth + monthly rollup
│           ├── transactions.tsx  — Filterable ledger
│           ├── calendar.tsx      — Monthly grid
│           ├── accounts.tsx      — Account management
│           ├── reports.tsx       — Lifetime totals
│           └── settings.tsx      — Currency, categories, logout
├── .env                  — Supabase credentials (gitignored)
├── env.example           — Template for .env
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Database Schema

| Table | Purpose |
|---|---|
| `profiles` | User preferences, base currency |
| `accounts` | Cash / Bank / Credit Card / Custom |
| `categories` | Hierarchical income/expense tree |
| `transactions` | Core ledger with staging support |
| `transaction_audit` | Insert-only audit trail |
| `fx_rates` | Multi-currency rate cache |
| `account_balances` | Materialized view (auto-refreshed) |

## Routes

| Path | Page | Auth |
|---|---|---|
| `/` | Redirects → /dashboard | — |
| `/auth/login` | Sign in / Sign up | Public |
| `/dashboard` | Net worth, accounts, monthly rollup | Required |
| `/transactions` | Filterable ledger | Required |
| `/calendar` | Monthly calendar grid | Required |
| `/reports` | Lifetime totals + breakdown | Required |
| `/accounts` | Account list + summary | Required |
| `/settings` | Currency, theme, logout | Required |

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template and fill in credentials
cp env.example .env
# VITE_SUPABASE_URL=https://vbnifgchhlltdgdpinom.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...

# Start dev server
npm run dev

# Build for production
npm run build
```

## Supabase Project

- **Project ref:** `vbnifgchhlltdgdpinom`
- **Region:** ca-central-1
- **PostgreSQL:** 17.6.1
- **Status:** ACTIVE_HEALTHY
- **Schema:** Pushed and verified

## Design Conventions

- Expenses: Red `oklch(0.58 0.22 25)` — no green anywhere
- Numbers: JetBrains Mono, right-aligned
- Income: Foreground color (near-black/near-white)
- Borders: 1px hairline only — no shadows, no gradients
- Mobile-first: `max-w-lg` centered, bottom tab navigation
- All amounts: integers (cents), formatted as `$1,234.56`

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build |
| `npm run router:generate` | Regenerate TanStack Router tree |
