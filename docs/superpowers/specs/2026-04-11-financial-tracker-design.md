# Financial Tracker — Design Spec
**Date:** 2026-04-11  
**Status:** Approved

---

## Overview

A multi-user SaaS web app that lets users upload credit card statement PDFs from any bank, auto-parses transactions, and displays them in a clean dashboard with spending analytics. Monetised via a free/pro subscription model.

---

## Users & Access

- Multi-user with individual accounts — each user sees only their own data
- Auth via Supabase Auth (email + Google OAuth)
- No admin panel in v1

---

## Subscription Tiers

| Feature | Free | Pro |
|---|---|---|
| Cards | 1 | Unlimited |
| Uploads | Unlimited | Unlimited |
| Dashboard & analytics | Full | Full |
| Price | ₹0 | ₹199/month or ₹1,499/year |

- Free → Pro upgrade triggered by attempting to add a 2nd card
- Stripe Checkout for payment; Stripe Customer Portal for management/cancellation
- On cancellation: plan downgrades at period end; extra cards become read-only (not deleted)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js (App Router) |
| Hosting | Vercel |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| File Storage | Supabase Storage |
| Payments | Stripe |
| PDF Parsing | `pdf-parse` (Node.js, server-side) |
| Charts | Recharts |

---

## Database Schema

### `users`
Extends `auth.users`. Stores plan and Stripe identifiers.

| Column | Type | Notes |
|---|---|---|
| id | uuid | FK → auth.users |
| plan | text | 'free' \| 'pro' |
| stripe_customer_id | text | |
| stripe_subscription_id | text | |
| created_at | timestamptz | |

### `cards`
One row per card the user has registered.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | FK → users |
| bank_name | text | e.g. "HDFC", "Axis" — user-entered |
| card_name | text | e.g. "Regalia" — user-entered |
| last4 | text | Last 4 digits if found in PDF |
| created_at | timestamptz | |

Free plan: max 1 row per user. Enforced server-side.

### `statements`
One row per uploaded PDF.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| card_id | uuid | FK → cards |
| user_id | uuid | |
| month | date | First day of statement month |
| file_path | text | Supabase Storage path |
| parsed_at | timestamptz | |
| status | text | 'pending' \| 'parsed' \| 'failed' |

### `transactions`
One row per line item extracted from a statement.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| statement_id | uuid | FK → statements |
| user_id | uuid | |
| date | date | |
| merchant | text | |
| amount | numeric(12,2) | |
| type | text | 'debit' \| 'credit' |
| category | text | Auto-assigned, user-editable |
| notes | text | Optional user note |

All tables have row-level security (RLS) policies scoped to `auth.uid()`.

---

## Application Pages

### Layout
Sidebar navigation (Option A) with links: Dashboard, Transactions, Cards, Settings/Billing. Plan badge shown in sidebar footer.

### Dashboard (`/dashboard`)
- Summary cards: Total spend (all time), This month's spend, Top category this month
- Monthly trend bar chart (last 6 months) — built with Recharts
- Spend by category donut chart

### Transactions (`/transactions`)
- Full paginated transaction list
- Filter by: card, date range, category, type (debit/credit)
- Search by merchant name
- Inline category edit — click category chip to change

### Cards (`/cards`)
- List of registered cards
- Add new card (gated: free plan shows upgrade modal at 2nd card)
- Per-card: upload new statement PDF

### Upload Flow
1. Select card → upload PDF
2. Statement status shows as `pending`
3. `/api/parse-pdf` runs server-side: extract text → regex parse → auto-categorise → save transactions
4. Status updates to `parsed` (or `failed` with retry option)
5. User redirected to Transactions filtered to new statement

### Settings / Billing (`/settings`)
- Account details
- Subscription status + link to Stripe Customer Portal
- Danger zone: delete account

---

## PDF Parsing

- Library: `pdf-parse` (server-side, Next.js API route)
- Strategy: bank-agnostic generic regex
  - Date patterns: `DD/MM/YYYY`, `DD MMM YYYY`, `DD-MM-YY`
  - Amount patterns: `₹1,234.56`, `1234.56 Dr/Cr`, `(1,234.56)`
  - Transaction line: date + merchant string + amount on same or adjacent line
- Auto-categorisation: merchant keyword ruleset (e.g. `swiggy|zomato` → Food, `uber|ola` → Transport)
- Password-protected PDFs: fail gracefully with user-facing message to unlock first
- Duplicate detection: skip transactions where (card_id + date + merchant + amount) already exists — prevents duplicates across re-uploads of the same statement

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/parse-pdf` | POST | Receive PDF, parse, save transactions |
| `/api/webhook/stripe` | POST | Handle Stripe events (subscription updates) |
| `/api/create-checkout` | POST | Create Stripe Checkout session |
| `/api/create-portal` | POST | Create Stripe Customer Portal session |

---

## Error Handling

- PDF parse failure: statement status set to `failed`; user sees "Parsing failed — try unlocking your PDF and re-uploading"
- Stripe webhook failures: logged; Stripe retries automatically
- Supabase RLS violation: returns 403; never exposes other users' data
- Duplicate upload: detected and skipped silently; user informed via toast

---

## Out of Scope (v1)

- CSV/Excel import
- Email forwarding of statements
- Budget goals or alerts
- Mobile app
- Admin dashboard
- Data export
