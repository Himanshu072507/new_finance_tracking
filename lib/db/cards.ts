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
    .not('card_name', 'ilike', '%savings account%')
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
