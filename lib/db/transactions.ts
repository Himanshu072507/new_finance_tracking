import { SupabaseClient } from '@supabase/supabase-js'
import type { StatementSource } from './statements'

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
  statements?: { card_id: string; source: StatementSource }
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
    .select('*, statements!inner(card_id, source)', { count: 'exact' })
    .eq('user_id', userId)
    .eq('statements.source', 'gmail_alert')

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
    .select('date, amount, statements!inner(source)')
    .eq('user_id', userId)
    .eq('type', 'debit')
    .eq('statements.source', 'gmail_alert')
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
