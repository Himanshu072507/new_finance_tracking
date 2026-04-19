# Gmail Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gmail-source tracking to the data model, surface Gmail-imported data in the UI, and document the Claude Code sync procedure.

**Architecture:** Two new nullable/defaulted columns on `statements` (`source`, `gmail_message_id`) allow existing manual-upload flows to continue unchanged. The cards page gains a per-card Gmail badge; the transactions list gains a source tag. Claude Code performs the actual Gmail sync using MCP tools, guided by a procedure doc.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + JS client), TypeScript, Tailwind CSS, Vitest

---

### Task 1: DB Migration — add source and gmail_message_id to statements

**Files:**
- Create: `supabase/migrations/002_gmail_sync.sql`
- Apply via Supabase MCP

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/002_gmail_sync.sql`:

```sql
alter table public.statements
  add column source text not null default 'manual'
    check (source in ('manual', 'gmail_alert', 'gmail_statement')),
  add column gmail_message_id text;

create index idx_statements_gmail_message_id on public.statements(gmail_message_id)
  where gmail_message_id is not null;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool:
- `project_id`: `jdsfhgmsemoieujggilh`
- `name`: `gmail_sync`
- `query`: contents of the SQL above

- [ ] **Step 3: Verify columns exist**

Use `mcp__plugin_supabase_supabase__execute_sql`:
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'statements'
  and column_name in ('source', 'gmail_message_id');
```

Expected: 2 rows returned — `source` with default `'manual'`, `gmail_message_id` with no default.

- [ ] **Step 4: Commit**

```bash
cd /Users/himanshurawat/financial-tracker
git add supabase/migrations/002_gmail_sync.sql
git commit -m "feat: add source and gmail_message_id columns to statements"
```

---

### Task 2: Update Statement types and add Gmail helpers

**Files:**
- Modify: `lib/db/statements.ts`

- [ ] **Step 1: Update Statement type and createStatement input**

Replace the contents of `lib/db/statements.ts` with:

```ts
import { SupabaseClient } from '@supabase/supabase-js'

export type StatementSource = 'manual' | 'gmail_alert' | 'gmail_statement'

export type Statement = {
  id: string
  card_id: string
  user_id: string
  month: string
  file_path: string
  parsed_at: string | null
  status: 'pending' | 'parsed' | 'failed'
  source: StatementSource
  gmail_message_id: string | null
  created_at: string
}

type StatementCreateInput = {
  card_id: string
  user_id: string
  month: string
  file_path: string
  status: 'pending' | 'parsed' | 'failed'
  source?: StatementSource
  gmail_message_id?: string | null
}

export async function createStatement(
  supabase: SupabaseClient,
  statement: StatementCreateInput
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

// Returns per-card Gmail import stats: { [cardId]: { count, lastSyncedAt } }
export async function getGmailSyncByCard(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, { count: number; lastSyncedAt: string }>> {
  const { data, error } = await supabase
    .from('statements')
    .select('card_id, created_at')
    .eq('user_id', userId)
    .in('source', ['gmail_alert', 'gmail_statement'])
  if (error) throw error

  const result: Record<string, { count: number; lastSyncedAt: string }> = {}
  for (const row of data ?? []) {
    if (!result[row.card_id]) {
      result[row.card_id] = { count: 0, lastSyncedAt: row.created_at }
    }
    result[row.card_id].count++
    if (row.created_at > result[row.card_id].lastSyncedAt) {
      result[row.card_id].lastSyncedAt = row.created_at
    }
  }
  return result
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/himanshurawat/financial-tracker
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/statements.ts
git commit -m "feat: update Statement type and add getGmailSyncByCard helper"
```

---

### Task 3: Include statement source in transaction queries

**Files:**
- Modify: `lib/db/transactions.ts`

- [ ] **Step 1: Update Transaction type and getTransactions select**

In `lib/db/transactions.ts`, change the `Transaction` type's `statements` field and the query select:

Change:
```ts
  statements?: { card_id: string }
```
To:
```ts
  statements?: { card_id: string; source: string }
```

Change the `getTransactions` query select:
```ts
// from:
.select('*, statements!inner(card_id)', { count: 'exact' })
// to:
.select('*, statements!inner(card_id, source)', { count: 'exact' })
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/transactions.ts
git commit -m "feat: include statement source in transaction queries"
```

---

### Task 4: Cards page — Gmail badge per card

**Files:**
- Modify: `app/(dashboard)/cards/page.tsx`
- Modify: `components/cards/card-list.tsx`

- [ ] **Step 1: Update cards page to fetch Gmail sync data**

Replace `app/(dashboard)/cards/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCards } from '@/lib/db/cards'
import { getGmailSyncByCard } from '@/lib/db/statements'
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

  const [cards, gmailSync] = await Promise.all([
    getCards(supabase, user.id),
    getGmailSyncByCard(supabase, user.id),
  ])
  const plan = (profile?.plan ?? 'free') as 'free' | 'pro'

  return <CardList cards={cards} plan={plan} gmailSync={gmailSync} />
}
```

- [ ] **Step 2: Update CardList to accept and render Gmail badge**

In `components/cards/card-list.tsx`, add the `gmailSync` prop and badge.

Change the component signature from:
```tsx
export default function CardList({
  cards,
  plan,
}: {
  cards: Card[]
  plan: 'free' | 'pro'
})
```
To:
```tsx
export default function CardList({
  cards,
  plan,
  gmailSync = {},
}: {
  cards: Card[]
  plan: 'free' | 'pro'
  gmailSync?: Record<string, { count: number; lastSyncedAt: string }>
})
```

Inside the card map, after the card name/last4 block, add the Gmail badge. Replace:
```tsx
              <div>
                <div className="font-medium">{card.bank_name}</div>
                <div className="text-sm text-gray-400">
                  {card.card_name}{card.last4 ? ` •••• ${card.last4}` : ''}
                </div>
              </div>
```
With:
```tsx
              <div>
                <div className="font-medium">{card.bank_name}</div>
                <div className="text-sm text-gray-400">
                  {card.card_name}{card.last4 ? ` •••• ${card.last4}` : ''}
                </div>
                {gmailSync[card.id] && (
                  <div className="text-xs text-blue-400 mt-1">
                    {gmailSync[card.id].count} transactions via Gmail &middot; last synced{' '}
                    {new Date(gmailSync[card.id].lastSyncedAt).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </div>
                )}
              </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/cards/page.tsx components/cards/card-list.tsx
git commit -m "feat: show Gmail import badge on cards page"
```

---

### Task 5: Transactions list — Gmail source tag

**Files:**
- Modify: `components/transactions/transaction-list.tsx`

- [ ] **Step 1: Add source tag to transaction rows**

In `components/transactions/transaction-list.tsx`, add a `Source` column header and source tag cell.

Add `<th>` after the Type header:
```tsx
// Change:
              <th className="pb-3 font-medium">Type</th>
// To:
              <th className="pb-3 pr-4 font-medium">Type</th>
              <th className="pb-3 font-medium">Source</th>
```

Add `<td>` after the Type cell, inside the row map:
```tsx
// After the type <td>:
                <td className="py-3">
                  {tx.statements?.source && tx.statements.source !== 'manual' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400">
                      Gmail
                    </span>
                  )}
                </td>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/transactions/transaction-list.tsx
git commit -m "feat: show Gmail source tag on transaction rows"
```

---

### Task 6: Write Claude Code Gmail sync procedure

**Files:**
- Create: `docs/gmail-sync-procedure.md`

- [ ] **Step 1: Create the sync procedure doc**

Create `docs/gmail-sync-procedure.md`:

```markdown
# Gmail Sync Procedure

When the user asks Claude Code to "sync Gmail", follow these steps exactly.

## Prerequisites
- Gmail MCP tools available in session
- Supabase MCP tools available in session
- Project: `jdsfhgmsemoieujggilh`

## Step 1 — Load user's cards

Run via Supabase MCP (`execute_sql`):
```sql
select id, bank_name, card_name from public.cards where user_id = '<user_id>';
```
Ask user for their user_id if unknown (find via `select id, email from auth.users`).

## Step 2 — Load already-imported Gmail message IDs

```sql
select gmail_message_id from public.statements
where user_id = '<user_id>' and gmail_message_id is not null;
```
Store these in a set to skip during processing.

## Step 3 — Search Gmail for transaction alerts

Use `gmail_search_messages` with queries:
- `"transaction alert" OR "debit alert" OR "you have spent" OR "debited" from:(alerts) newer_than:30d`
- `"credited to your account" OR "credit alert" newer_than:30d`

For each email not in the already-imported set:
- Read the message body via `gmail_read_message`
- Extract: date, merchant/description, amount, type (debit/credit)
- Match bank name to a card (fuzzy match email sender domain vs card bank_name)
- If match is ambiguous, ask user which card before inserting

## Step 4 — Search Gmail for statement PDFs

Use `gmail_search_messages` with queries:
- `"e-statement" OR "monthly statement" OR "statement for" has:attachment filename:pdf newer_than:90d`

For each email not in the already-imported set:
- Read message via `gmail_read_message`, get attachment
- Download PDF attachment
- Match to card by bank name in subject/sender
- Run through existing `/api/parse-pdf` endpoint (POST with the PDF as formData) OR insert directly via Supabase MCP if running outside the app

## Step 5 — Insert transaction alerts

For each parsed transaction alert, via Supabase MCP:

```sql
-- Create statement record
insert into public.statements (card_id, user_id, month, file_path, status, source, gmail_message_id)
values (
  '<card_id>',
  '<user_id>',
  date_trunc('month', '<date>'::date)::date,
  'gmail/<message_id>',
  'parsed',
  'gmail_alert',
  '<gmail_message_id>'
) returning id;

-- Insert transaction
insert into public.transactions (statement_id, user_id, date, merchant, amount, type, category)
values ('<statement_id>', '<user_id>', '<date>', '<merchant>', <amount>, '<debit|credit>', '<category>');
```

Use `assignCategory` logic (check `lib/pdf/categories.ts`) to set category.

## Step 6 — Insert statement PDF transactions

For PDF statements, create one statement record with `source = 'gmail_statement'` and `gmail_message_id = '<id>'`, then insert all parsed transactions linked to it.

## Step 7 — Report to user

Summarise:
- Emails scanned
- Already imported (skipped)
- Transaction alerts imported (N transactions)
- Statement PDFs imported (N transactions across M statements)
- Any items that needed manual card matching
```

- [ ] **Step 2: Commit**

```bash
git add docs/gmail-sync-procedure.md
git commit -m "docs: add Claude Code Gmail sync procedure"
```
