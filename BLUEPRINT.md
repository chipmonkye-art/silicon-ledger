# Silicon Ledger — Blueprint

**App:** Project-focused petty cash & expense tracking system for real estate development management.

**Live reference:** https://silicon-cash-flow.base44.app

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | HTML/CSS/JS (server-rendered) |
| Backend | Python (FastAPI / Django) or Node.js |
| Database | PostgreSQL |
| Auth | Session or JWT-based |
| Hosting | Base44 platform (likely Railway/Render-style) |

---

## Entity Model

### Core Entities
- **Project** — name, location, budget, status, start/end dates
- **Transaction** — type (credit/debit), amount, description, project FK, date, category, status
- **Expense** — item, amount, project FK, vendor FK, date, receipt, approval status
- **Invoice** — vendor, amount, due date, project FK, status (pending/paid/overdue)
- **Vendor** — name, contact, address, tax info, payment terms
- **LandOwner** — name, parcel info, contact, payment history

### Financial Entities
- **Procurement** — purchase requests, items, quantities, budget codes, approval workflow
- **Payroll** — employee, salary, period, deductions, net pay, project allocation
- **SalaryDetail** — breakdown of earnings, deductions, taxes per pay period

### Control Entities
- **ApprovalInbox** — pending approvals with action buttons (approve/reject)
- **ApprovalReminder** — scheduled notifications for pending approvals
- **Reminder** — general purpose reminders with due dates
- **ControlRegister** — check/control numbers registry (sequential tracking)

### Reporting
- **Reconciliation** — daily balance matching (expected vs actual)
- **CashFlowForecast** — projected inflows/outflows over time
- **MonthlyReport** — aggregated financial summary per month
- **ReportsViewer** — custom report builder/viewer

### System
- **Settings** — org config, categories, approval rules, notification prefs
- **DatabaseBackup** — manual or scheduled backup with download/restore

---

## Pages & Features

### 1. Dashboard `/`
- Summary cards: total projects, pending approvals, month expenses, cash balance
- Recent transactions feed
- Quick action buttons (add expense, new project)
- Charts: expense by category, cash flow trend

### 2. Projects `/projects`
- List all projects with search/filter
- Each project shows: budget used %, status, recent activity
- CRUD for projects
- Drill-down: project detail with all related transactions/expenses

### 3. Transactions `/transactions`
- Full transaction ledger with date range filter
- Columns: date, description, project, category, debit/credit, balance
- Add transaction form
- Export to CSV/PDF
- Search by description, project, amount range

### 4. Expenses `/expenses`
- List expenses with status (draft, pending, approved, rejected, paid)
- Add expense with receipt upload
- Approval workflow integration
- Categorization (materials, labor, permits, utilities, etc.)

### 5. Procurement `/procurement`
- Purchase requests with line items
- Budget checking before submission
- Multi-level approval
- Order tracking (ordered, shipped, received)

### 6. Payroll `/payroll`
- Employee list with salary info
- Run payroll for a period
- Project cost allocation
- Payroll summary reports

### 7. Salary Detail `/SalaryDetail`
- Per-employee breakdown for a given period
- Base pay, overtime, bonuses, deductions, taxes
- Net pay calculation
- Print payslip

### 8. Invoices `/invoices`
- Vendor invoices with due dates
- Status tracking (pending, approved, paid, overdue)
- Payment scheduling
- Aging report

### 9. Vendors `/vendors`
- Vendor directory with contact info
- Payment terms & history
- Link invoices and expenses to vendor

### 10. Land Owners `/landowners`
- Property/land owner registry
- Parcel details, contact info
- Payment history per owner
- Lease/option agreement tracking

### 11. Cash Flow Forecast `/cash-flow`
- Projected inflows (receivables, investments)
- Projected outflows (payables, payroll, expenses)
- Net position over time (weekly/monthly)
- What-if scenario modeling

### 12. Daily Reconciliation `/reconciliation`
- End-of-day balance check
- Enter expected cash balance vs actual
- Flag discrepancies
- Audit trail

### 13. Approval Inbox `/approval-inbox`
- Aggregated view of all items needing approval
- Types: expenses, procurement, invoices, payroll
- Approve/reject with comment
- Batch actions

### 14. Approval Reminders `/approval-reminders`
- Schedule reminders for pending approvals
- Email/in-app notification preferences
- Escalation rules (if not approved in N days)

### 15. Control Register `/control-register`
- Sequential check number tracking
- Pre-numbered document registry
- Audit compliance

### 16. Reports Viewer `/reports`
- Pre-built report templates
- Custom report builder (select fields, filters, date range)
- Export (PDF, Excel, CSV)
- Scheduled report delivery

### 17. Monthly Report `/monthly-report`
- Auto-generated monthly summary
- Income vs expenses per project
- Budget variance analysis
- Executive summary with charts

### 18. Reminders `/reminders`
- General reminders (payment due, review date, meeting)
- Recurring reminder support
- Dismiss/snooze

### 19. Settings `/settings`
- Organization profile
- Category management
- Approval rule configuration
- User roles & permissions
- Notification preferences
- Currency & locale settings

### 20. Database Backup `/backup`
- Manual backup trigger
- Scheduled backup configuration
- Download backup file
- Restore from backup
- Backup history log

---

## RBAC Strategy

### Roles & Permissions

| Role | Scope | Permissions |
|---|---|---|
| **Site Manager** | Project-specific | Log cash payments, upload receipt photos, view own site data only |
| **Procurement Team** | Project-specific | Raise POs, log goods receipts, view vendor ledgers (no financial approval) |
| **Finance** (e.g., Ayana Kabir) | Global | Reconciliation, approval, match GR to PO, approve vendor payments, stage-to-ledger gate |
| **Managing Director (MD)** | Global (read-only) | Real-time budget-vs-spent across all projects, generate monthly PDF reports, funding alerts |

### Project-Level Scoping
- Site Managers at Project A **cannot** view Project B data
- Budget alerts notify only MD and Finance when a cost center approaches limit
- Data flows through a **staging state** → only Finance can promote to final ledger

### Audit Trail
- Every entry/approval logged with: user, action, before/after values, timestamp
- Insert-only transaction audit table for financial accountability

### Technical Implementation
- Row Level Security (RLS) in PostgreSQL for data isolation
- JWT with role + project_id claims
- Frontend routes gated by role; Finance sees "Approve" dashboard, Site Manager sees simplified "Log Expense"

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS + shadcn/ui |
| Routing | TanStack Router |
| Data Fetching | TanStack Query |
| State | Zustand |
| Backend | Node.js + Express (or Lovable Cloud serverless) |
| Database | PostgreSQL with Row Level Security |
| Auth | JWT / OAuth (email/password + Google sign-in) |
| Currency | Stored as integers (cents/minor units) |
| Fonts | Inter (UI), JetBrains Mono (numbers) |
| File store | Local or S3 for receipts |
| Deploy | Docker / Lovable Cloud |

---

## Implementation Roadmap

### Phase 1 — Foundation
- [ ] Project setup (repo, DB, auth)
- [ ] **Projects** CRUD
- [ ] **Transactions** ledger
- [ ] **Dashboard** with summary

### Phase 2 — Core Financial
- [ ] **Expenses** with receipt upload
- [ ] **Vendors** directory
- [ ] **Invoices** management
- [ ] **Land Owners** registry

### Phase 3 — Operations
- [ ] **Procurement** with approval flow
- [ ] **Payroll** + **Salary Detail**
- [ ] **Control Register**

### Phase 4 — Approvals & Control
- [ ] **Approval Inbox**
- [ ] **Approval Reminders**
- [ ] **Reminders**

### Phase 5 — Reporting
- [ ] **Cash Flow Forecast**
- [ ] **Daily Reconciliation**
- [ ] **Monthly Report**
- [ ] **Reports Viewer**

### Phase 6 — System & Admin
- [ ] **Settings** (roles, categories, rules)
- [ ] **Database Backup**
- [ ] Notifications (email/push)
- [ ] Audit logging
