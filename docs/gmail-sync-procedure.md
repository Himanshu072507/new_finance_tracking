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
