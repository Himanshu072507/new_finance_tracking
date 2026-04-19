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
  const password = (formData.get('password') as string | null) || undefined

  if (!file || !cardId || !month) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify card belongs to this user
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
    const transactions = await parsePdfBuffer(buffer, statement.id, user.id, password)

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
  } catch (err) {
    await updateStatementStatus(supabase, statement.id, 'failed')
    const errName = err instanceof Error ? err.name : 'unknown'
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[parse-pdf] error:', errName, errMsg)
    return NextResponse.json({ error: `[${errName}] ${errMsg}` }, { status: 422 })
  }
}
