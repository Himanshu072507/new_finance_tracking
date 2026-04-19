# Financial Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user SaaS that parses credit card statement PDFs and displays spending analytics on a dashboard, with Stripe-gated free/pro tiers.

**Architecture:** Next.js App Router on Vercel, Supabase for auth + Postgres + file storage, Stripe for subscription billing. PDF parsing runs server-side in an API route using `pdf-parse`. All DB access is row-level secured per user.

**Tech Stack:** Next.js 14, TypeScript, Supabase, Stripe, pdf-parse, Recharts, Tailwind CSS, Vitest

---

## File Map

```
financial-tracker/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Sidebar shell
│   │   ├── dashboard/page.tsx
│   │   ├── transactions/page.tsx
│   │   ├── cards/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── parse-pdf/route.ts
│   │   ├── webhook/stripe/route.ts
│   │   ├── create-checkout/route.ts
│   │   └── create-portal/route.ts
│   └── layout.tsx
├── components/
│   ├── sidebar.tsx
│   ├── dashboard/
│   │   ├── summary-cards.tsx
│   │   ├── monthly-trend-chart.tsx
│   │   └── category-donut-chart.tsx
│   ├── transactions/
│   │   ├── transaction-list.tsx
│   │   ├── transaction-filters.tsx
│   │   └── category-edit.tsx
│   ├── cards/
│   │   ├── card-list.tsx
│   │   ├── add-card-modal.tsx
│   │   └── upload-statement.tsx
│   └── ui/
│       └── upgrade-modal.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client
│   │   ├── server.ts               # Server Supabase client
│   │   └── middleware.ts           # Session refresh helper
│   ├── pdf/
│   │   ├── parser.ts               # PDF text → transactions[]
│   │   └── categories.ts           # Merchant keyword → category map
│   ├── stripe.ts                   # Stripe singleton
│   └── db/
│       ├── cards.ts
│       ├── statements.ts
│       └── transactions.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── middleware.ts
├── vitest.config.ts
└── .env.local.example
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json` (via CLI)
- Create: `.env.local.example`
- Create: `vitest.config.ts`
- Create: `next.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd ~/financial-tracker
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

Expected: project files created, `npm run dev` starts on port 3000.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr stripe pdf-parse recharts
npm install -D vitest @vitejs/plugin-react jsdom @vitest/coverage-v8 @types/pdf-parse
```

- [ ] **Step 3: Create `.env.local.example`**

```bash
# .env.local.example
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_...

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Copy to `.env.local` and fill in real values.

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 5: Add `.gitignore` entries**

Append to `.gitignore`:
```
.env.local
.superpowers/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

## Task 2: Supabase Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Users profile (extends auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

-- Cards
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bank_name text not null,
  card_name text not null,
  last4 text,
  created_at timestamptz not null default now()
);

-- Statements
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  month date not null,
  file_path text not null,
  parsed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'parsed', 'failed')),
  created_at timestamptz not null default now()
);

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.statements(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  merchant text not null,
  amount numeric(12,2) not null,
  type text not null check (type in ('debit', 'credit')),
  category text not null default 'Other',
  notes text,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.users enable row level security;
alter table public.cards enable row level security;
alter table public.statements enable row level security;
alter table public.transactions enable row level security;

create policy "users: own row" on public.users
  for all using (auth.uid() = id);

create policy "cards: own rows" on public.cards
  for all using (auth.uid() = user_id);

create policy "statements: own rows" on public.statements
  for all using (auth.uid() = user_id);

create policy "transactions: own rows" on public.transactions
  for all using (auth.uid() = user_id);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Supabase Storage bucket for PDFs
insert into storage.buckets (id, name, public) values ('statements', 'statements', false);

create policy "statements storage: own files" on storage.objects
  for all using (auth.uid()::text = (storage.foldername(name))[1]);
```

- [ ] **Step 2: Apply the migration**

In Supabase dashboard → SQL Editor, paste and run the migration. Or if using Supabase CLI:
```bash
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema with RLS"
```

---

## Task 3: Supabase Client Helpers

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Create browser client**

Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create server client**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Create auth middleware**

Create `middleware.ts` at project root:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup')

  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhook).*)'],
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/ middleware.ts
git commit -m "feat: add Supabase client helpers and auth middleware"
```

---

## Task 4: Auth Pages (Login + Signup)

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update root layout**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BillWise',
  description: 'Credit card spend tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-gray-950 text-gray-100 antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Create login page**

Create `app/(auth)/login/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-8 text-center">BillWise</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          No account?{' '}
          <Link href="/signup" className="text-blue-400 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create signup page**

Create `app/(auth)/signup/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-8 text-center">BillWise</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Have an account?{' '}
          <Link href="/login" className="text-blue-400 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify auth works**

```bash
npm run dev
```

Open http://localhost:3000 — should redirect to /login. Create an account, verify redirect to /dashboard (404 is fine, page not built yet).

- [ ] **Step 5: Commit**

```bash
git add app/
git commit -m "feat: add login and signup pages"
```

---

## Task 5: Dashboard Layout (Sidebar)

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `components/sidebar.tsx`

- [ ] **Step 1: Create sidebar component**

Create `components/sidebar.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/cards', label: 'Cards' },
  { href: '/settings', label: 'Settings' },
]

export default function Sidebar({ plan }: { plan: 'free' | 'pro' }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="font-bold text-lg tracking-tight">BillWise</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === href
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-gray-800 space-y-3">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          plan === 'pro' ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'
        }`}>
          {plan === 'pro' ? 'Pro' : 'Free'}
        </span>
        <button
          onClick={handleSignOut}
          className="block text-sm text-gray-500 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create dashboard layout**

Create `app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('plan')
    .eq('id', user.id)
    .single()

  const plan = (profile?.plan ?? 'free') as 'free' | 'pro'

  return (
    <div className="flex min-h-screen">
      <Sidebar plan={plan} />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Create placeholder pages**

Create `app/(dashboard)/dashboard/page.tsx`:
```tsx
export default function DashboardPage() {
  return <h1 className="text-2xl font-bold">Dashboard</h1>
}
```

Create `app/(dashboard)/transactions/page.tsx`:
```tsx
export default function TransactionsPage() {
  return <h1 className="text-2xl font-bold">Transactions</h1>
}
```

Create `app/(dashboard)/cards/page.tsx`:
```tsx
export default function CardsPage() {
  return <h1 className="text-2xl font-bold">Cards</h1>
}
```

Create `app/(dashboard)/settings/page.tsx`:
```tsx
export default function SettingsPage() {
  return <h1 className="text-2xl font-bold">Settings</h1>
}
```

- [ ] **Step 4: Verify layout**

```bash
npm run dev
```

Sign in → should see sidebar with nav links. Clicking each link should show the heading.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/ components/sidebar.tsx
git commit -m "feat: add dashboard layout with sidebar"
```

---

## Task 6: DB Query Helpers

**Files:**
- Create: `lib/db/cards.ts`
- Create: `lib/db/statements.ts`
- Create: `lib/db/transactions.ts`

- [ ] **Step 1: Create cards DB helpers**

Create `lib/db/cards.ts`:

```ts
import { SupabaseClient } from '@supabase/supabase-js'

export type Card = {
  id: string
  user_id: string
  bank_name: string
  card_name: string
  last4: string | null
  created_at: string
}

export async function getCards(supabase: SupabaseClient, userId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function countCards(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw error
  return count ?? 0
}

export async function createCard(
  supabase: SupabaseClient,
  card: Omit<Card, 'id' | 'created_at'>
): Promise<Card> {
  const { data, error } = await supabase
    .from('cards')
    .insert(card)
    .select()
    .single()
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Create statements DB helpers**

Create `lib/db/statements.ts`:

```ts
import { SupabaseClient } from '@supabase/supabase-js'

export type Statement = {
  id: string
  card_id: string
  user_id: string
  month: string
  file_path: string
  parsed_at: string | null
  status: 'pending' | 'parsed' | 'failed'
  created_at: string
}

export async function createStatement(
  supabase: SupabaseClient,
  statement: Omit<Statement, 'id' | 'created_at' | 'parsed_at'>
): Promise<Statement> {
  const { data, error } = await supabase
    .from('statements')
    .insert(statement)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateStatementStatus(
  supabase: SupabaseClient,
  id: string,
  status: 'parsed' | 'failed'
): Promise<void> {
  const { error } = await supabase
    .from('statements')
    .update({ status, parsed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getStatementsByCard(
  supabase: SupabaseClient,
  cardId: string
): Promise<Statement[]> {
  const { data, error } = await supabase
    .from('statements')
    .select('*')
    .eq('card_id', cardId)
    .order('month', { ascending: false })
  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 3: Create transactions DB helpers**

Create `lib/db/transactions.ts`:

```ts
import { SupabaseClient } from '@supabase/supabase-js'

export type Transaction = {
  id: string
  statement_id: string
  user_id: string
  date: string
  merchant: string
  amount: number
  type: 'debit' | 'credit'
  category: string
  notes: string | null
  created_at: string
}

export type TransactionFilters = {
  cardId?: string
  dateFrom?: string
  dateTo?: string
  category?: string
  type?: 'debit' | 'credit'
  search?: string
}

export async function insertTransactions(
  supabase: SupabaseClient,
  transactions: Omit<Transaction, 'id' | 'created_at' | 'notes'>[]
): Promise<void> {
  const { error } = await supabase.from('transactions').insert(transactions)
  if (error) throw error
}

export async function getTransactions(
  supabase: SupabaseClient,
  userId: string,
  filters: TransactionFilters = {},
  page = 0,
  pageSize = 50
): Promise<{ data: Transaction[]; count: number }> {
  let query = supabase
    .from('transactions')
    .select('*, statements!inner(card_id)', { count: 'exact' })
    .eq('user_id', userId)

  if (filters.cardId) query = query.eq('statements.card_id', filters.cardId)
  if (filters.dateFrom) query = query.gte('date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('date', filters.dateTo)
  if (filters.category) query = query.eq('category', filters.category)
  if (filters.type) query = query.eq('type', filters.type)
  if (filters.search) query = query.ilike('merchant', `%${filters.search}%`)

  const { data, count, error } = await query
    .order('date', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)

  if (error) throw error
  return { data: data ?? [], count: count ?? 0 }
}

export async function updateTransactionCategory(
  supabase: SupabaseClient,
  id: string,
  category: string
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ category })
    .eq('id', id)
  if (error) throw error
}

export async function getSpendByCategory(
  supabase: SupabaseClient,
  userId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ category: string; total: number }[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('category, amount')
    .eq('user_id', userId)
    .eq('type', 'debit')
    .gte('date', dateFrom)
    .lte('date', dateTo)
  if (error) throw error

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    map[row.category] = (map[row.category] ?? 0) + Number(row.amount)
  }
  return Object.entries(map)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

export async function getMonthlySpend(
  supabase: SupabaseClient,
  userId: string,
  months = 6
): Promise<{ month: string; total: number }[]> {
  const from = new Date()
  from.setMonth(from.getMonth() - months + 1)
  from.setDate(1)

  const { data, error } = await supabase
    .from('transactions')
    .select('date, amount')
    .eq('user_id', userId)
    .eq('type', 'debit')
    .gte('date', from.toISOString().slice(0, 10))
  if (error) throw error

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    const month = row.date.slice(0, 7) // "2026-04"
    map[month] = (map[month] ?? 0) + Number(row.amount)
  }
  return Object.entries(map)
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/
git commit -m "feat: add DB query helpers for cards, statements, transactions"
```

---

## Task 7: PDF Parser

**Files:**
- Create: `lib/pdf/categories.ts`
- Create: `lib/pdf/parser.ts`
- Create: `lib/pdf/parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/pdf/parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTransactions } from './parser'
import { assignCategory } from './categories'

describe('parseTransactions', () => {
  it('parses DD/MM/YYYY date format', () => {
    const text = '15/03/2026  SWIGGY TECHNOLOGIES     450.00 Dr'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results).toHaveLength(1)
    expect(results[0].date).toBe('2026-03-15')
    expect(results[0].merchant).toBe('SWIGGY TECHNOLOGIES')
    expect(results[0].amount).toBe(450.00)
    expect(results[0].type).toBe('debit')
  })

  it('parses DD MMM YYYY date format', () => {
    const text = '02 Apr 2026  UBER INDIA  350.00 Dr'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results).toHaveLength(1)
    expect(results[0].date).toBe('2026-04-02')
  })

  it('parses credit transactions', () => {
    const text = '10/03/2026  PAYMENT RECEIVED  5000.00 Cr'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results[0].type).toBe('credit')
  })

  it('parses amount with rupee symbol', () => {
    const text = '01/04/2026  AMAZON  ₹1,299.00'
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results[0].amount).toBe(1299.00)
  })

  it('returns empty array for unparseable text', () => {
    const results = parseTransactions('no transactions here', 'stmt-1', 'user-1')
    expect(results).toHaveLength(0)
  })

  it('deduplicates identical transactions', () => {
    const line = '15/03/2026  SWIGGY  450.00 Dr'
    const text = `${line}\n${line}`
    const results = parseTransactions(text, 'stmt-1', 'user-1')
    expect(results).toHaveLength(1)
  })
})

describe('assignCategory', () => {
  it('assigns Food for swiggy', () => {
    expect(assignCategory('SWIGGY TECHNOLOGIES')).toBe('Food & Dining')
  })

  it('assigns Transport for uber', () => {
    expect(assignCategory('UBER INDIA BV')).toBe('Transport')
  })

  it('assigns Other for unknown merchant', () => {
    expect(assignCategory('RANDOM MERCHANT XYZ')).toBe('Other')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/pdf/parser.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create category ruleset**

Create `lib/pdf/categories.ts`:

```ts
const RULES: [RegExp, string][] = [
  [/swiggy|zomato|dominos|pizza|mcdonald|kfc|subway|dunkin|starbucks|cafe|restaurant|biryani|hotel.*food/i, 'Food & Dining'],
  [/uber|ola|rapido|metro|railway|irctc|bus|cab|auto|petrol|fuel|bpcl|hpcl|iocl/i, 'Transport'],
  [/amazon|flipkart|myntra|ajio|meesho|snapdeal|nykaa|shoppers/i, 'Shopping'],
  [/netflix|spotify|prime|hotstar|youtube|zee5|sony.*liv|jiocinema|disney/i, 'Entertainment'],
  [/airtel|jio|vodafone|bsnl|vi\.in|recharge|broadband|fiber/i, 'Bills & Utilities'],
  [/apollo|medplus|pharmeasy|1mg|netmeds|hospital|clinic|doctor|health|insurance/i, 'Health'],
  [/byju|unacademy|coursera|udemy|vedantu|school|college|tuition/i, 'Education'],
  [/makemytrip|cleartrip|goibibo|easemytrip|booking\.com|airbnb|oyo|hotel(?!.*food)/i, 'Travel'],
  [/payment|paid|refund|cashback|reward/i, 'Payment'],
]

export function assignCategory(merchant: string): string {
  for (const [pattern, category] of RULES) {
    if (pattern.test(merchant)) return category
  }
  return 'Other'
}
```

- [ ] **Step 4: Create parser**

Create `lib/pdf/parser.ts`:

```ts
import pdfParse from 'pdf-parse'
import { assignCategory } from './categories'

export type ParsedTransaction = {
  statement_id: string
  user_id: string
  date: string
  merchant: string
  amount: number
  type: 'debit' | 'credit'
  category: string
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function parseDate(raw: string): string | null {
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

  // DD MMM YYYY
  const dmmmY = raw.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (dmmmY) {
    const m = MONTHS[dmmmY[2].toLowerCase()]
    if (m) return `${dmmmY[3]}-${m}-${dmmmY[1]}`
  }

  // DD-MM-YY
  const dmyShort = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2})$/)
  if (dmyShort) return `20${dmyShort[3]}-${dmyShort[2]}-${dmyShort[1]}`

  return null
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[₹,\s]/g, ''))
}

// Matches: <date> <merchant text> <amount> [Dr|Cr]
const LINE_RE = /(\d{2}[\s\/\-][A-Za-z0-9]{2,4}[\s\/\-]\d{2,4})\s+(.+?)\s+([\d,₹]+\.\d{2})\s*(Dr|Cr)?/

export function parseTransactions(
  text: string,
  statementId: string,
  userId: string
): ParsedTransaction[] {
  const results: ParsedTransaction[] = []
  const seen = new Set<string>()

  for (const line of text.split('\n')) {
    const match = line.match(LINE_RE)
    if (!match) continue

    const [, rawDate, merchant, rawAmount, drCr] = match
    const date = parseDate(rawDate.trim())
    if (!date) continue

    const amount = parseAmount(rawAmount)
    if (isNaN(amount) || amount <= 0) continue

    const type: 'debit' | 'credit' =
      drCr?.toLowerCase() === 'cr' ? 'credit' : 'debit'

    const dedupKey = `${date}|${merchant.trim()}|${amount}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    results.push({
      statement_id: statementId,
      user_id: userId,
      date,
      merchant: merchant.trim(),
      amount,
      type,
      category: assignCategory(merchant.trim()),
    })
  }

  return results
}

export async function parsePdfBuffer(
  buffer: Buffer,
  statementId: string,
  userId: string
): Promise<ParsedTransaction[]> {
  const { text } = await pdfParse(buffer)
  return parseTransactions(text, statementId, userId)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run lib/pdf/parser.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/
git commit -m "feat: add bank-agnostic PDF parser with category auto-assignment"
```

---

## Task 8: Parse PDF API Route

**Files:**
- Create: `app/api/parse-pdf/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/parse-pdf/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePdfBuffer } from '@/lib/pdf/parser'
import { createStatement, updateStatementStatus } from '@/lib/db/statements'
import { insertTransactions } from '@/lib/db/transactions'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const cardId = formData.get('cardId') as string | null
  const month = formData.get('month') as string | null // "YYYY-MM"

  if (!file || !cardId || !month) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Check plan gate — verify card belongs to this user
  const { data: card } = await supabase
    .from('cards')
    .select('id')
    .eq('id', cardId)
    .eq('user_id', user.id)
    .single()

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  // Upload PDF to Supabase Storage
  const filePath = `${user.id}/${cardId}/${month}.pdf`
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  await supabase.storage.from('statements').upload(filePath, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

  // Create statement record
  const statement = await createStatement(supabase, {
    card_id: cardId,
    user_id: user.id,
    month: `${month}-01`,
    file_path: filePath,
    status: 'pending',
  })

  // Parse PDF
  try {
    const transactions = await parsePdfBuffer(buffer, statement.id, user.id)

    if (transactions.length === 0) {
      await updateStatementStatus(supabase, statement.id, 'failed')
      return NextResponse.json(
        { error: 'No transactions found. Try unlocking your PDF first.' },
        { status: 422 }
      )
    }

    await insertTransactions(supabase, transactions)
    await updateStatementStatus(supabase, statement.id, 'parsed')

    return NextResponse.json({ statementId: statement.id, count: transactions.length })
  } catch {
    await updateStatementStatus(supabase, statement.id, 'failed')
    return NextResponse.json(
      { error: 'Parsing failed. Try unlocking your PDF and re-uploading.' },
      { status: 422 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/parse-pdf/
git commit -m "feat: add parse-pdf API route"
```

---

## Task 9: Cards Page

**Files:**
- Create: `components/cards/card-list.tsx`
- Create: `components/cards/add-card-modal.tsx`
- Create: `components/cards/upload-statement.tsx`
- Create: `components/ui/upgrade-modal.tsx`
- Modify: `app/(dashboard)/cards/page.tsx`

- [ ] **Step 1: Create upgrade modal**

Create `components/ui/upgrade-modal.tsx`:

```tsx
'use client'
import { useState } from 'react'

export default function UpgradeModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const res = await fetch('/api/create-checkout', { method: 'POST' })
    const { url } = await res.json()
    window.location.href = url
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-sm w-full">
        <h2 className="text-xl font-bold mb-2">Upgrade to Pro</h2>
        <p className="text-gray-400 text-sm mb-6">
          Free plan supports 1 card. Upgrade to Pro for unlimited cards and banks.
        </p>
        <ul className="text-sm text-gray-300 space-y-2 mb-6">
          <li>✓ Unlimited cards</li>
          <li>✓ All banks supported</li>
          <li>✓ Full analytics</li>
        </ul>
        <div className="flex gap-3">
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? 'Redirecting...' : 'Upgrade — ₹199/mo'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create add card modal**

Create `components/cards/add-card-modal.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AddCardModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const [bankName, setBankName] = useState('')
  const [cardName, setCardName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('cards').insert({
      user_id: user.id,
      bank_name: bankName.trim(),
      card_name: cardName.trim(),
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      onAdded()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-sm w-full">
        <h2 className="text-xl font-bold mb-6">Add Card</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bank Name</label>
            <input
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              placeholder="e.g. HDFC"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Card Name</label>
            <input
              value={cardName}
              onChange={e => setCardName(e.target.value)}
              placeholder="e.g. Regalia"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg py-2.5 text-sm font-medium"
            >
              {loading ? 'Adding...' : 'Add Card'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create upload statement component**

Create `components/cards/upload-statement.tsx`:

```tsx
'use client'
import { useState } from 'react'

export default function UploadStatement({
  cardId,
  onUploaded,
}: {
  cardId: string
  onUploaded: (statementId: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('cardId', cardId)
    formData.append('month', month) // "YYYY-MM"

    const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Upload failed')
      setLoading(false)
    } else {
      onUploaded(json.statementId)
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-3 mt-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Statement Month</label>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          required
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">PDF File</label>
        <input
          type="file"
          accept=".pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          required
          className="text-sm text-gray-400"
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading || !file}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      >
        {loading ? 'Uploading & parsing...' : 'Upload Statement'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Create card list component**

Create `components/cards/card-list.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Card } from '@/lib/db/cards'
import AddCardModal from './add-card-modal'
import UploadStatement from './upload-statement'
import UpgradeModal from '@/components/ui/upgrade-modal'

export default function CardList({
  cards,
  plan,
}: {
  cards: Card[]
  plan: 'free' | 'pro'
}) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  function handleAddClick() {
    if (plan === 'free' && cards.length >= 1) {
      setShowUpgrade(true)
    } else {
      setShowAdd(true)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cards</h1>
        <button
          onClick={handleAddClick}
          className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          Add Card
        </button>
      </div>

      {cards.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          No cards yet. Add your first card to get started.
        </div>
      )}

      <div className="space-y-4">
        {cards.map(card => (
          <div key={card.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{card.bank_name}</div>
                <div className="text-sm text-gray-400">{card.card_name}{card.last4 ? ` •••• ${card.last4}` : ''}</div>
              </div>
              <button
                onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                className="text-sm text-blue-400 hover:underline"
              >
                {expandedCard === card.id ? 'Hide' : 'Upload Statement'}
              </button>
            </div>
            {expandedCard === card.id && (
              <UploadStatement
                cardId={card.id}
                onUploaded={() => {
                  setExpandedCard(null)
                  router.push('/transactions')
                }}
              />
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <AddCardModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); router.refresh() }}
        />
      )}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  )
}
```

- [ ] **Step 5: Wire up cards page**

Replace `app/(dashboard)/cards/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCards } from '@/lib/db/cards'
import CardList from '@/components/cards/card-list'

export default async function CardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('plan')
    .eq('id', user.id)
    .single()

  const cards = await getCards(supabase, user.id)
  const plan = (profile?.plan ?? 'free') as 'free' | 'pro'

  return <CardList cards={cards} plan={plan} />
}
```

- [ ] **Step 6: Verify cards page works**

Start dev server. Navigate to /cards. Add a card — it should appear. On free plan, adding a second card should show the upgrade modal.

- [ ] **Step 7: Commit**

```bash
git add app/(dashboard)/cards/ components/cards/ components/ui/
git commit -m "feat: add cards page with add card and upload statement"
```

---

## Task 10: Transactions Page

**Files:**
- Create: `components/transactions/transaction-list.tsx`
- Create: `components/transactions/transaction-filters.tsx`
- Create: `components/transactions/category-edit.tsx`
- Modify: `app/(dashboard)/transactions/page.tsx`

- [ ] **Step 1: Create category edit component**

Create `components/transactions/category-edit.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const CATEGORIES = [
  'Food & Dining', 'Transport', 'Shopping', 'Entertainment',
  'Bills & Utilities', 'Health', 'Education', 'Travel', 'Payment', 'Other',
]

export default function CategoryEdit({
  transactionId,
  current,
}: {
  transactionId: string
  current: string
}) {
  const [category, setCategory] = useState(current)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSelect(cat: string) {
    setSaving(true)
    setOpen(false)
    const supabase = createClient()
    await supabase.from('transactions').update({ category: cat }).eq('id', transactionId)
    setCategory(cat)
    setSaving(false)
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className="text-xs bg-gray-800 hover:bg-gray-700 rounded-full px-2.5 py-1 transition-colors"
      >
        {saving ? '...' : category}
      </button>
      {open && (
        <div className="absolute z-10 top-full mt-1 left-0 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-40">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => handleSelect(cat)}
              className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-gray-800 transition-colors ${cat === category ? 'text-blue-400' : 'text-gray-300'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create transaction filters**

Create `components/transactions/transaction-filters.tsx`:

```tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { Card } from '@/lib/db/cards'

const CATEGORIES = [
  'Food & Dining', 'Transport', 'Shopping', 'Entertainment',
  'Bills & Utilities', 'Health', 'Education', 'Travel', 'Payment', 'Other',
]

export default function TransactionFilters({ cards }: { cards: Card[] }) {
  const router = useRouter()
  const params = useSearchParams()

  const update = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.push(`/transactions?${next.toString()}`)
  }, [params, router])

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <input
        type="text"
        placeholder="Search merchant..."
        defaultValue={params.get('search') ?? ''}
        onChange={e => update('search', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-48"
      />
      <select
        value={params.get('cardId') ?? ''}
        onChange={e => update('cardId', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      >
        <option value="">All Cards</option>
        {cards.map(c => (
          <option key={c.id} value={c.id}>{c.bank_name} {c.card_name}</option>
        ))}
      </select>
      <select
        value={params.get('category') ?? ''}
        onChange={e => update('category', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      >
        <option value="">All Categories</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        value={params.get('type') ?? ''}
        onChange={e => update('type', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      >
        <option value="">Debit & Credit</option>
        <option value="debit">Debit</option>
        <option value="credit">Credit</option>
      </select>
      <input
        type="date"
        value={params.get('dateFrom') ?? ''}
        onChange={e => update('dateFrom', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      />
      <input
        type="date"
        value={params.get('dateTo') ?? ''}
        onChange={e => update('dateTo', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 3: Create transaction list**

Create `components/transactions/transaction-list.tsx`:

```tsx
import type { Transaction } from '@/lib/db/transactions'
import CategoryEdit from './category-edit'

export default function TransactionList({
  transactions,
  count,
  page,
  pageSize,
}: {
  transactions: Transaction[]
  count: number
  page: number
  pageSize: number
}) {
  const totalPages = Math.ceil(count / pageSize)

  if (transactions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        No transactions found. Upload a statement from the Cards page.
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="pb-3 pr-4 font-medium">Date</th>
              <th className="pb-3 pr-4 font-medium">Merchant</th>
              <th className="pb-3 pr-4 font-medium">Category</th>
              <th className="pb-3 pr-4 font-medium text-right">Amount</th>
              <th className="pb-3 font-medium">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-900">
            {transactions.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-900/50 transition-colors">
                <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{tx.date}</td>
                <td className="py-3 pr-4 max-w-xs truncate">{tx.merchant}</td>
                <td className="py-3 pr-4">
                  <CategoryEdit transactionId={tx.id} current={tx.category} />
                </td>
                <td className="py-3 pr-4 text-right font-mono">
                  ₹{Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    tx.type === 'debit'
                      ? 'bg-red-900/40 text-red-400'
                      : 'bg-green-900/40 text-green-400'
                  }`}>
                    {tx.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-500">
          <span>{count} transactions</span>
          <span>Page {page + 1} of {totalPages}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire up transactions page**

Replace `app/(dashboard)/transactions/page.tsx`:

```tsx
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTransactions } from '@/lib/db/transactions'
import { getCards } from '@/lib/db/cards'
import TransactionList from '@/components/transactions/transaction-list'
import TransactionFilters from '@/components/transactions/transaction-filters'

const PAGE_SIZE = 50

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const page = parseInt(sp.page ?? '0')

  const [cards, { data: transactions, count }] = await Promise.all([
    getCards(supabase, user.id),
    getTransactions(supabase, user.id, {
      cardId: sp.cardId,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      category: sp.category,
      type: sp.type as 'debit' | 'credit' | undefined,
      search: sp.search,
    }, page, PAGE_SIZE),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Transactions</h1>
      <Suspense>
        <TransactionFilters cards={cards} />
      </Suspense>
      <TransactionList
        transactions={transactions}
        count={count}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
```

- [ ] **Step 5: Verify transactions page**

Upload a test PDF from /cards, verify transactions appear at /transactions. Test search, category filter, and inline category edit.

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/transactions/ components/transactions/
git commit -m "feat: add transactions page with filters and category edit"
```

---

## Task 11: Dashboard Charts

**Files:**
- Create: `components/dashboard/summary-cards.tsx`
- Create: `components/dashboard/monthly-trend-chart.tsx`
- Create: `components/dashboard/category-donut-chart.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create summary cards**

Create `components/dashboard/summary-cards.tsx`:

```tsx
export default function SummaryCards({
  totalSpend,
  thisMonthSpend,
  topCategory,
}: {
  totalSpend: number
  thisMonthSpend: number
  topCategory: string
}) {
  const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {[
        { label: 'Total Spend', value: fmt(totalSpend) },
        { label: 'This Month', value: fmt(thisMonthSpend) },
        { label: 'Top Category', value: topCategory || '—' },
      ].map(({ label, value }) => (
        <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-500 mb-1">{label}</div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create monthly trend chart**

Create `components/dashboard/monthly-trend-chart.tsx`:

```tsx
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function MonthlyTrendChart({
  data,
}: {
  data: { month: string; total: number }[]
}) {
  const formatted = data.map(d => ({
    ...d,
    label: new Date(d.month + '-01').toLocaleString('default', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
      <h2 className="text-sm font-medium text-gray-400 mb-4">Monthly Spend (last 6 months)</h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={formatted} barSize={32}>
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 13 }}
            formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Spend']}
          />
          <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Create category donut chart**

Create `components/dashboard/category-donut-chart.tsx`:

```tsx
'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316','#84cc16','#6366f1','#94a3b8']

export default function CategoryDonutChart({
  data,
}: {
  data: { category: string; total: number }[]
}) {
  if (data.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-center h-64 text-gray-500 text-sm">
        No data yet
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-medium text-gray-400 mb-4">Spend by Category (this month)</h2>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="total" nameKey="category" cx="50%" cy="50%" innerRadius={60} outerRadius={90}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 13 }}
            formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, '']}
          />
          <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 12, color: '#9ca3af' }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Wire up dashboard page**

Replace `app/(dashboard)/dashboard/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSpendByCategory, getMonthlySpend } from '@/lib/db/transactions'
import SummaryCards from '@/components/dashboard/summary-cards'
import MonthlyTrendChart from '@/components/dashboard/monthly-trend-chart'
import CategoryDonutChart from '@/components/dashboard/category-donut-chart'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [categoryData, monthlyData] = await Promise.all([
    getSpendByCategory(supabase, user.id, monthStart, monthEnd),
    getMonthlySpend(supabase, user.id, 6),
  ])

  const thisMonthSpend = monthlyData.find(
    d => d.month === monthStart.slice(0, 7)
  )?.total ?? 0

  const totalSpend = monthlyData.reduce((sum, d) => sum + d.total, 0)
  const topCategory = categoryData[0]?.category ?? ''

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <SummaryCards
        totalSpend={totalSpend}
        thisMonthSpend={thisMonthSpend}
        topCategory={topCategory}
      />
      <div className="grid grid-cols-2 gap-6">
        <MonthlyTrendChart data={monthlyData} />
        <CategoryDonutChart data={categoryData} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify dashboard renders**

Upload at least one statement. Navigate to /dashboard. Confirm summary cards, bar chart, and donut chart all render with real data.

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/dashboard/ components/dashboard/
git commit -m "feat: add dashboard with summary cards and charts"
```

---

## Task 12: Stripe Integration

**Files:**
- Create: `lib/stripe.ts`
- Create: `app/api/create-checkout/route.ts`
- Create: `app/api/create-portal/route.ts`
- Create: `app/api/webhook/stripe/route.ts`

- [ ] **Step 1: Create Stripe singleton**

Create `lib/stripe.ts`:

```ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})
```

- [ ] **Step 2: Create checkout route**

Create `app/api/create-checkout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email })
    customerId = customer.id
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?upgraded=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cards`,
    metadata: { userId: user.id },
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 3: Create portal route**

Create `app/api/create-portal/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 4: Create Stripe webhook**

Create `app/api/webhook/stripe/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient as createServerClient } from '@supabase/supabase-js'

// Use service role key — this route is called by Stripe, not the user
function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getAdminClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { metadata?: { userId?: string }; subscription?: string }
    const userId = session.metadata?.userId
    if (userId) {
      await supabase.from('users').update({
        plan: 'pro',
        stripe_subscription_id: session.subscription,
      }).eq('id', userId)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as { id: string }
    await supabase.from('users').update({ plan: 'free', stripe_subscription_id: null })
      .eq('stripe_subscription_id', sub.id)
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as { id: string; status: string }
    if (sub.status === 'active') {
      await supabase.from('users').update({ plan: 'pro' }).eq('stripe_subscription_id', sub.id)
    } else if (['canceled', 'unpaid', 'past_due'].includes(sub.status)) {
      await supabase.from('users').update({ plan: 'free' }).eq('stripe_subscription_id', sub.id)
    }
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 5: Test Stripe webhook locally**

Install Stripe CLI and forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

Copy the webhook secret shown into `.env.local` as `STRIPE_WEBHOOK_SECRET`.

Create a test checkout session from the upgrade modal — complete with Stripe test card `4242 4242 4242 4242`. Verify plan updates to `pro` in Supabase.

- [ ] **Step 6: Commit**

```bash
git add lib/stripe.ts app/api/
git commit -m "feat: add Stripe checkout, portal, and webhook"
```

---

## Task 13: Settings Page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Build settings page**

Replace `app/(dashboard)/settings/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? '')
      supabase.from('users').select('plan').eq('id', user.id).single()
        .then(({ data }) => setPlan((data?.plan ?? 'free') as 'free' | 'pro'))
    })
  }, [])

  async function handlePortal() {
    setPortalLoading(true)
    const res = await fetch('/api/create-portal', { method: 'POST' })
    const { url } = await res.json()
    window.location.href = url
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {params.get('upgraded') && (
        <div className="bg-green-900/30 border border-green-800 rounded-xl p-4 mb-6 text-sm text-green-300">
          You're now on Pro. All banks and cards are unlocked.
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-500 mb-1">Account</div>
          <div className="font-medium">{email}</div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-500 mb-1">Plan</div>
          <div className="flex items-center justify-between">
            <span className="font-medium capitalize">{plan}</span>
            {plan === 'pro' ? (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="text-sm text-blue-400 hover:underline disabled:opacity-50"
              >
                {portalLoading ? 'Loading...' : 'Manage subscription'}
              </button>
            ) : (
              <button
                onClick={() => router.push('/cards')}
                className="text-sm bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-1.5 transition-colors"
              >
                Upgrade to Pro
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify settings page**

On free plan: shows "Upgrade to Pro" button. On pro plan: shows "Manage subscription" → redirects to Stripe portal.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/settings/
git commit -m "feat: add settings page with billing management"
```

---

## Task 14: Root Redirect + Final Wiring

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add root redirect**

Replace `app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all parser tests pass.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 4: End-to-end smoke test**

1. Sign up with a new account → lands on /dashboard (empty state)
2. Add a card at /cards
3. Upload a credit card PDF statement
4. Verify transactions appear at /transactions
5. Edit a category inline — verify it persists on page refresh
6. Check /dashboard shows charts with real data
7. Attempt to add a second card on free plan → upgrade modal appears
8. Complete Stripe test checkout → plan updates to Pro → second card can be added

- [ ] **Step 5: Final commit**

```bash
git add app/page.tsx
git commit -m "feat: add root redirect, complete financial tracker v1"
```

---

## Environment Setup Checklist

Before running locally:

1. Create Supabase project at supabase.com → copy URL and anon key
2. Run `supabase/migrations/001_initial_schema.sql` in SQL Editor
3. Create Stripe account → create a product "BillWise Pro" with price ₹199/month → copy price ID
4. Fill in `.env.local` from `.env.local.example`
5. Install Stripe CLI for webhook testing: `brew install stripe/stripe-cli/stripe`

## Deployment (Vercel)

1. Push repo to GitHub
2. Import to Vercel → add all env vars from `.env.local`
3. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL
4. In Stripe Dashboard → Webhooks → add endpoint `https://your-app.vercel.app/api/webhook/stripe` with events: `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`
