'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { Card } from '@/lib/db/cards'
import { CATEGORIES } from '@/lib/constants'

export default function TransactionFilters({ cards }: { cards: Card[] }) {
  const router = useRouter()
  const params = useSearchParams()

  const update = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.push(`/transactions?${next.toString()}`)
  }, [params, router])

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <input
        type="text"
        placeholder="Search merchant..."
        defaultValue={params.get('search') ?? ''}
        onChange={e => update('search', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-48"
      />
      <select
        value={params.get('cardId') ?? ''}
        onChange={e => update('cardId', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      >
        <option value="">All Cards</option>
        {cards.map(c => (
          <option key={c.id} value={c.id}>{c.bank_name} {c.card_name}</option>
        ))}
      </select>
      <select
        value={params.get('category') ?? ''}
        onChange={e => update('category', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      >
        <option value="">All Categories</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        value={params.get('type') ?? ''}
        onChange={e => update('type', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      >
        <option value="">Debit & Credit</option>
        <option value="debit">Debit</option>
        <option value="credit">Credit</option>
      </select>
      <input
        type="date"
        value={params.get('dateFrom') ?? ''}
        onChange={e => update('dateFrom', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      />
      <input
        type="date"
        value={params.get('dateTo') ?? ''}
        onChange={e => update('dateTo', e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
      />
    </div>
  )
}
