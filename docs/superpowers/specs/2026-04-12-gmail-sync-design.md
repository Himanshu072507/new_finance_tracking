# Gmail Sync — Design Spec

**Date:** 2026-04-12
**Status:** Approved

---

## Overview

The Gmail MCP is linked to Claude Code (not the Next.js app). Rather than building a full in-app Gmail OAuth flow, Claude Code acts as the sync agent: it reads the user's Gmail, parses transaction alerts and statement PDFs, and inserts transactions directly into Supabase. The Next.js app gets minimal UI additions to surface Gmail-sourced data.

---

## Data Model

### `statements` table additions

| Column | Type | Default | Notes |
|---|---|---|---|
| `source` | `text` | `'manual'` | `'manual' | 'gmail_alert' | 'gmail_statement'` |
| `gmail_message_id` | `text` | `null` | Gmail message ID; used for deduplication on re-sync |

Both columns are added via a new migration (`002_gmail_sync.sql`).

No new tables. Gmail-sourced transactions remain linked to statements as-is.

---

## Claude Code Sync Flow

Triggered on demand by the user asking Claude Code to sync.

1. **Load cards** — Query Supabase for the user's cards (id, bank_name, card_name)
2. **Search Gmail** for two categories:
   - **Transaction alerts** — subjects/senders matching patterns like "transaction alert", "debit alert", "spent", "debited" from known bank domains
   - **Statement emails** — subjects matching "e-statement", "statement for", "monthly statement" with PDF attachments
3. **Deduplicate** — Fetch all existing `gmail_message_id` values from `statements`; skip already-imported messages
4. **Parse transaction alerts** — Extract from email body: date, merchant, amount, type (debit/credit). Create one `statement` record (`source: 'gmail_alert'`) + one `transaction` per email.
5. **Parse statement PDFs** — Download PDF attachment, run through existing `parsePdfBuffer`. Create one `statement` record (`source: 'gmail_statement'`) + N transactions.
6. **Card matching** — Fuzzy-match bank name from email sender/subject against saved cards. If ambiguous, ask the user before importing.
7. **Report** — Summarise: emails found, emails skipped (duplicates), transactions inserted, items needing review.

---

## UI Changes

### Cards page (`components/cards/card-list.tsx`)

- Each card that has Gmail-sourced statements shows a small "Gmail imported" badge with:
  - Count of Gmail-imported transactions
  - Date of most recent Gmail import
- Existing "Upload Statement" button remains — manual upload is still available

### Transactions page (`components/transactions/transaction-list.tsx`)

- Each transaction row shows a subtle `Gmail` source tag when `statement.source` is `gmail_alert` or `gmail_statement`
- No layout or filter changes required

### No new pages or nav items.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Email matches no card | Ask user before importing; skip if user declines |
| PDF parsing returns 0 transactions | Mark statement as `failed`, report to user |
| Duplicate gmail_message_id | Skip silently, include in "skipped" count |
| Gmail search returns no results | Report "No new emails found" |

---

## Out of Scope

- In-app Gmail OAuth (self-service sync without Claude Code) — future work
- Automatic/scheduled Gmail sync
- Editing parsed transactions before save
