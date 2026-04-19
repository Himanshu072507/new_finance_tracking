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
      <Suspense fallback={<div className="h-12 mb-6" />}>
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
