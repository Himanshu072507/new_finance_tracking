#!/usr/bin/env node
/**
 * Gmail Transaction Sync Script
 *
 * Usage:
 *   node scripts/sync-gmail.mjs
 *
 * On first run: opens browser for Google OAuth. Token saved to scripts/.gmail-token.json.
 * Subsequent runs: uses saved token automatically.
 *
 * Syncs ICICI credit card (XX3005) transaction alert emails into Supabase.
 */

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID      = '6f812731-f8f0-42ed-9314-c1b4ed4d024d'
const CARD_ID      = 'cc64c951-cd2c-4f8d-88eb-04877853b240' // ICICI Coral XX3005

const TOKEN_PATH   = path.join(__dirname, '.gmail-token.json')
const CREDS_PATH   = path.join(__dirname, 'gmail-credentials.json')
const SCOPES       = ['https://www.googleapis.com/auth/gmail.readonly']

// ── Category rules ────────────────────────────────────────────────────────────

const RULES = [
  [/icici.?direct|icicidirect|EBA\/EQ|EBA\/MTF|EBA\/SPOT|EBA\/NSE|NSEMRGNPIPO|DPCHG|demat|zerodha|groww|upstox|mutual fund|sip|nps|ppf|fixed deposit/i, 'Investment'],
  [/icici bank interest|savings interest|fd interest|CMS TRANSACTION|salary/i, 'Income'],
  [/atm cash|cash withdrawal|atm wdl/i, 'Cash'],
  [/BIL\/INFT|CC BillPay|NET BANKING BIL.*CREDIT|UPI Credit|UPI Debit|@ybl|@oksbi|@okaxis|@okhdfcbank|@paytm|@upi|imps|neft|rtgs|paytm/i, 'Transfers'],
  [/swiggy|zomato|dominos|pizza|mcdonald|kfc|subway|starbucks|cafe|restaurant|biryani|burger king|haldiram|chaayos|faasos|box8|eatfit|rebel foods|bundl/i, 'Food & Dining'],
  [/blinkit|bigbasket|zepto|grofers|jiomart|dmart|reliance fresh|natures basket|grocery|supermarket|countrydelight|instamart|blink commerce/i, 'Groceries'],
  [/uber|ola|rapido|metro|railway|irctc|bus|cab|petrol|fuel|bpcl|hpcl|iocl|shell|indian oil|fasttag|toll|redbus|hpcl/i, 'Transport'],
  [/amazon|flipkart|myntra|ajio|meesho|snapdeal|nykaa|lifestyle|westside|pantaloons|croma|vijay sales|tatacliq|firstcry|titan|rosewalk|ramanlal/i, 'Shopping'],
  [/netflix|spotify|prime video|hotstar|youtube premium|zee5|sonyliv|jiocinema|disney|bookmyshow|inox|pvr/i, 'Entertainment'],
  [/airtel|vodafone|bsnl|recharge|broadband|fiber|electricity|bescom|tata power|water bill|gas bill|mahanagar gas|cbdt|googlecloud/i, 'Bills & Utilities'],
  [/^jio(?!mart|cinema)/i, 'Bills & Utilities'],
  [/apollo|medplus|pharmeasy|1mg|netmeds|hospital|clinic|doctor|health|insurance|fortis|manipal|narayana|practo|curefit|gym|fitness|shalby/i, 'Health'],
  [/makemytrip|cleartrip|goibibo|easemytrip|booking\.com|airbnb|oyo|yatra|ixigo|airasia|indigo|spicejet|air india|vistara|akasa|neelgagan|sarees/i, 'Travel'],
  [/refund|cashback|reversal/i, 'Refund'],
]

function assignCategory(merchant) {
  for (const [pattern, category] of RULES) {
    if (pattern.test(merchant)) return category
  }
  return 'Other'
}

// ── Gmail auth ────────────────────────────────────────────────────────────────

function loadCredentials() {
  if (!fs.existsSync(CREDS_PATH)) {
    console.error(`
ERROR: gmail-credentials.json not found at scripts/gmail-credentials.json

To set up:
1. Go to https://console.cloud.google.com
2. Create a project → Enable Gmail API
3. OAuth consent screen → External → Add your Gmail as test user
4. Credentials → Create OAuth 2.0 Client ID → Desktop app
5. Download JSON → save as scripts/gmail-credentials.json
`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'))
}

async function getAuthClient() {
  const creds = loadCredentials()
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web
  const oAuth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')))
    return oAuth2
  }

  // First-time: open browser for consent
  const authUrl = oAuth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES })
  console.log('\nOpening browser for Gmail authorization...')
  console.log('If it does not open, visit:\n', authUrl)

  const { exec } = await import('child_process')
  exec(`open "${authUrl}"`)

  // Local server to capture the code
  const code = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:3333')
      const code = url.searchParams.get('code')
      res.end('<h2>Authorized! You can close this tab.</h2>')
      server.close()
      resolve(code)
    }).listen(3333)
  })

  const { tokens } = await oAuth2.getToken(code)
  oAuth2.setCredentials(tokens)
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens))
  console.log('Token saved to scripts/.gmail-token.json\n')
  return oAuth2
}

// ── Email parsing ─────────────────────────────────────────────────────────────

// Snippet format: "...Credit Card XX3005 has been used for a transaction of INR 315.00 on Dec 03, 2025 at 08:26:38. Info: Payu*Swiggy Food..."
const ALERT_RE = /Credit Card XX3005 has been used for a transaction of INR ([\d,.]+) on ([A-Za-z]+ \d{1,2}, \d{4}) at [\d:]+\.\s*Info:\s*([^.]+)/

const MONTH_MAP = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }

function parseAlertSnippet(snippet) {
  const m = snippet.match(ALERT_RE)
  if (!m) return null
  const [, rawAmount, rawDate, merchant] = m

  const amount = parseFloat(rawAmount.replace(/,/g, ''))
  if (isNaN(amount) || amount <= 0) return null

  // "Dec 03, 2025" → "2025-12-03"
  const parts = rawDate.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/)
  if (!parts) return null
  const mon = MONTH_MAP[parts[1].toLowerCase().slice(0, 3)]
  if (!mon) return null
  const date = `${parts[3]}-${mon}-${parts[2].padStart(2, '0')}`

  return { date, merchant: merchant.trim(), amount, type: 'debit', category: assignCategory(merchant.trim()) }
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment.')
    console.error('Run: source .env.local && node scripts/sync-gmail.mjs')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const auth = await getAuthClient()
  const gmail = google.gmail({ version: 'v1', auth })

  // Find the most recent synced transaction date to avoid re-importing old data
  const { data: latest } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', USER_ID)
    .eq('statements.source', 'gmail_alert')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastDate = latest?.date ?? '2025-12-05' // fallback: day after last known import
  const afterDate = new Date(lastDate)
  afterDate.setDate(afterDate.getDate() + 1)
  const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth()+1).padStart(2,'0')}/${String(afterDate.getDate()).padStart(2,'0')}`

  console.log(`Searching for new alerts after ${afterStr}...`)

  const query = `from:credit_cards@icicibank.com subject:"Transaction alert" after:${afterStr}`
  const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 200 })
  const messages = list.data.messages ?? []

  if (messages.length === 0) {
    console.log('No new transaction emails found.')
    return
  }

  console.log(`Found ${messages.length} new email(s). Parsing...`)

  const parsed = []
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['Subject', 'Date'] })
    const snippet = detail.data.snippet ?? ''
    const tx = parseAlertSnippet(snippet)
    if (tx) parsed.push({ ...tx, messageId: msg.id })
  }

  if (parsed.length === 0) {
    console.log('No parseable transactions found in emails.')
    return
  }

  // Group by month → upsert statements
  const byMonth = {}
  for (const tx of parsed) {
    const month = tx.date.slice(0, 7) // "2025-12"
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(tx)
  }

  let inserted = 0
  for (const [monthKey, txs] of Object.entries(byMonth)) {
    const monthDate = `${monthKey}-01`

    // Find or create statement for this month
    let { data: stmt } = await supabase
      .from('statements')
      .select('id')
      .eq('card_id', CARD_ID)
      .eq('user_id', USER_ID)
      .eq('month', monthDate)
      .eq('source', 'gmail_alert')
      .maybeSingle()

    if (!stmt) {
      const { data: newStmt, error } = await supabase
        .from('statements')
        .insert({ card_id: CARD_ID, user_id: USER_ID, month: monthDate, file_path: 'gmail_alert', status: 'parsed', source: 'gmail_alert' })
        .select('id')
        .single()
      if (error) { console.error(`Failed to create statement for ${monthKey}:`, error.message); continue }
      stmt = newStmt
    }

    // Insert transactions (skip duplicates by date+merchant+amount)
    const rows = txs.map(({ date, merchant, amount, type, category }) => ({
      statement_id: stmt.id,
      user_id: USER_ID,
      date,
      merchant,
      amount,
      type,
      category,
    }))

    // Deduplicate against existing transactions in this statement
    const { data: existing } = await supabase
      .from('transactions')
      .select('date, merchant, amount')
      .eq('statement_id', stmt.id)

    const existingKeys = new Set((existing ?? []).map(r => `${r.date}|${r.merchant}|${r.amount}`))
    const newRows = rows.filter(r => !existingKeys.has(`${r.date}|${r.merchant}|${r.amount}`))

    if (newRows.length > 0) {
      const { error } = await supabase.from('transactions').insert(newRows)
      if (error) { console.error(`Failed to insert transactions for ${monthKey}:`, error.message); continue }
      inserted += newRows.length
    }
  }

  console.log(`Done. Inserted ${inserted} new transaction(s).`)
}

main().catch(err => { console.error('Sync failed:', err.message); process.exit(1) })
