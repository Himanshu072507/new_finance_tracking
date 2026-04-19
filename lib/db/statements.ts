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
