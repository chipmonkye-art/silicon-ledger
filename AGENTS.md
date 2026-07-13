# Silicon Ledger

Project-focused petty cash and expense tracking system for real estate development management.

## Tech Stack
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express (REST API)
- **Database:** PostgreSQL with Row Level Security
- **Auth:** JWT (email/password)
- **Currency:** stored as integers (cents)
- **State:** TanStack Query (server cache), Zustand (local UI state)

## Roles & Permissions
- **Site Manager** — project-scoped, log expenses & upload receipts only
- **Procurement** — project-scoped, raise POs & log goods receipts
- **Finance** — global, reconciliation, approval, stage-to-ledger gate
- **MD** — global read-only, reports & alerts

## Financial Rules
- Balance = Opening Balance + Σ(income) − Σ(expense) ± transfers
- Credit Cards: expenses increase liability (negative balance), payments are transfers from bank
- Transfers must NOT affect Total Assets — enforced by `account_balances` SQL view
- All mutations logged to `audit_log` via DB trigger
- Staging gate: transactions enter as `is_staged = true`, Finance approves to move to ledger

## Project Structure
```
opencode/
  BLUEPRINT.md            — Full app blueprint (20 pages, RBAC, roadmap)
  AGENTS.md               — This file

  client/                 — React frontend
    src/
      main.tsx            — Entry point
      index.css           — Tailwind + CSS variables (red minimalist theme)
      types/index.ts      — TypeScript types (Account, Transaction, Project, Expense, Invoice, Vendor, Category)
      stores/authStore.ts — Zustand auth store
      stores/transactionStore.ts — Zustand sheet state
      hooks/useAuth.ts    — Auth hook
      lib/api.ts          — API client + typed endpoint helpers
      lib/utils.ts        — cn(), formatCents()
      routes/
        index.tsx         — TanStack Router (10 routes)
        login.tsx         — Login page
        dashboard.tsx     — Dashboard (net worth, monthly rollups, recent txns, FAB)
        calendar.tsx      — Monthly calendar view (grid, daily totals, carryover, I/E/B toggles, day list)
        accounts.tsx      — Accounts management (list, edit sheet, exclude toggle)
        projects.tsx      — Projects list (budget bars, spent %)
        projectDetail.tsx — Project-specific ledger (budget bar, staged badges, stats)
        transactions.tsx  — Transaction ledger (filters, summaries, live API)
        expenses.tsx      — Expense management (approve/reject workflow, status filters)
        search.tsx        — Global search (transactions, projects, type filters)
        invoices.tsx      — Invoice list (status filters, mark-as-paid)
        vendors.tsx       — Vendor list (contact info, cards)
      components/
        Layout.tsx        — App shell with sidebar nav + AddTransaction sheet
        AccountCard.tsx   — Account card (icon, color, name, timestamp, balance)
        AddTransaction.tsx — Bottom sheet form (expense/income/transfer with account selection)
        ui/
          button.tsx      — shadcn-style button
          card.tsx        — Card components
          input.tsx       — Input component
          badge.tsx       — Badge component
          bottom-sheet.tsx — Bottom sheet / slide-over

  server/                 — Express backend
    src/
      index.js            — Server entry (9 route groups registered)
      db/index.js         — PostgreSQL client (postgres library)
      middleware/
        auth.js           — JWT auth middleware + signToken()
        rbac.js           — Role-based access control middleware
      routes/
        auth.js           — Register, Login, Me endpoints
        projects.js       — Projects CRUD (with spent calculation)
        accounts.js       — Accounts CRUD (via account_balances view)
        transactions.js   — Transaction CRUD + summary/calendar
        categories.js     — Categories list/create
        expenses.js       — Expenses list/create/approve/reject
        search.js         — Full-text search across transactions + projects
        invoices.js       — Invoices list/create/pay
        vendors.js        — Vendors CRUD

  db/
    schema.sql            — Full PostgreSQL schema (tables, indexes, RLS, views, triggers)
```

## API Endpoints
### Accounts
- `GET /api/accounts` — accounts with current_balance + summary (totalAssets, totalLiabilities, netWorth)
- `PUT /api/accounts/:id` — update opening_balance, include_in_assets, name, color, icon

### Transactions
- `GET /api/transactions?project_id=&account_id=&type=&is_staged=&limit=&offset=` — list with joins
- `GET /api/transactions/summary` — monthly income/expense/balance (staged=false)
- `GET /api/transactions/calendar?month=2026-07` — month transactions + carryover + totals
- `POST /api/transactions` — create with validation (transfers require to_account_id, no category)
- `PUT /api/transactions/:id` — update (finance only)
- `POST /api/transactions/:id/approve` — finance, moves staged→ledger
- `POST /api/transactions/:id/reject` — finance, deletes staged

### Projects
- `GET /api/projects` — list with spent (from transactions) + RBAC scoping
- `POST /api/projects` — create (finance/MD)
- `GET /api/projects/:id` — single project with spent
- `PUT /api/projects/:id` — update (finance/MD)

### Expenses
- `GET /api/expenses?status=&project_id=` — list with project_name + summary (approved/pending totals)
- `POST /api/expenses` — create
- `POST /api/expenses/:id/approve` — finance
- `POST /api/expenses/:id/reject` — finance

### Search
- `GET /api/search?q=&type=&limit=` — searches transactions (ILIKE on description/category) + projects (ILIKE on name)

### Invoices
- `GET /api/invoices?status=` — list with project_name, vendor_name
- `POST /api/invoices` — create (finance/MD)
- `POST /api/invoices/:id/pay` — mark as paid (finance)

### Vendors
- `GET /api/vendors` — list all
- `POST /api/vendors` — create
- `PUT /api/vendors/:id` — update

## Conventions
- All currency amounts in cents (integers)
- All numbers in JetBrains Mono, right-aligned
- Liabilities/expenses in red `oklch(0.58 0.22 25)` using `text-expense`
- Insert-only audit tables for financial records
- RBAC enforced at both middleware (server) and RLS (database)
- Transactions pass through staging gate before hitting ledger
- All client pages use TanStack Query for data fetching (no sample data)
