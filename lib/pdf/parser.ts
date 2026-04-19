import { spawn } from 'child_process'
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
  // DD/MM/YYYY or DD/M/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1]}`

  // DD MMM YYYY
  const dmmmY = raw.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (dmmmY) {
    const m = MONTHS[dmmmY[2].toLowerCase()]
    if (m) return `${dmmmY[3]}-${m}-${dmmmY[1]}`
  }

  // DD-MM-YY or DD-M-YY
  const dmyShort = raw.match(/^(\d{2})[\/\-](\d{1,2})[\/\-](\d{2})$/)
  if (dmyShort) return `20${dmyShort[3]}-${dmyShort[2].padStart(2, '0')}-${dmyShort[1]}`

  return null
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[₹,\s]/g, ''))
}

// Matches: <date> <merchant text> <amount> [Dr|Cr]
const LINE_RE = /(\d{2}[\s\/\-][A-Za-z0-9]{1,4}[\s\/\-]\d{2,4})\s+(.+?)\s+([\d,₹]+\.\d{2})\s*(Dr|Cr)?/

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

const PYTHON_EXTRACT_SCRIPT = `
import sys, pypdf, io

password = sys.argv[1] if len(sys.argv) > 1 else ''
data = sys.stdin.buffer.read()
reader = pypdf.PdfReader(io.BytesIO(data))

if reader.is_encrypted:
    result = reader.decrypt(password)
    if result.value == 0:
        sys.exit(2)  # wrong password

lines = []
for page in reader.pages:
    text = page.extract_text()
    if text:
        lines.append(text)

sys.stdout.write('\\n'.join(lines))
`

const PYTHON_PATHS = [
  'python3',
  '/usr/bin/python3',
  '/Library/Developer/CommandLineTools/usr/bin/python3',
  '/usr/local/bin/python3',
  '/opt/homebrew/bin/python3',
]

function spawnAsync(
  cmd: string,
  args: string[],
  input: Buffer
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args)
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    proc.stdout.on('data', (d: Buffer) => chunks.push(d))
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 2) return reject(new Error('PasswordException'))
      if (code !== 0) {
        const msg = Buffer.concat(errChunks).toString().trim()
        return reject(new Error(msg || `Process exited with code ${code}`))
      }
      resolve(Buffer.concat(chunks))
    })
    proc.stdin.write(input)
    proc.stdin.end()
  })
}

async function findPython(): Promise<string | null> {
  for (const p of PYTHON_PATHS) {
    try {
      await new Promise<void>((res, rej) => {
        const proc = spawn(p, ['--version'])
        proc.on('error', rej)
        proc.on('close', (code) => (code === 0 ? res() : rej(new Error(String(code)))))
      })
      return p
    } catch {
      // not at this path
    }
  }
  return null
}

async function extractTextWithPython(buffer: Buffer, password?: string): Promise<string> {
  const python = await findPython()
  if (!python) throw new Error('python3 not found — install python3 to parse PDFs')
  const args = password ? ['-c', PYTHON_EXTRACT_SCRIPT, password] : ['-c', PYTHON_EXTRACT_SCRIPT]
  const out = await spawnAsync(python, args, buffer)
  return out.toString('utf8')
}

export async function parsePdfBuffer(
  buffer: Buffer,
  statementId: string,
  userId: string,
  password?: string
): Promise<ParsedTransaction[]> {
  const text = await extractTextWithPython(buffer, password)
  return parseTransactions(text, statementId, userId)
}
