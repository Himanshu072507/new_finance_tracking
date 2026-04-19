'use client'
import type { Card } from '@/lib/db/cards'

export default function CardList({
  cards,
  gmailSync = {},
}: {
  cards: Card[]
  gmailSync?: Record<string, { count: number; lastSyncedAt: string }>
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Cards</h1>

      {cards.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          No cards found.
        </div>
      )}

      <div className="space-y-4">
        {cards.map(card => (
          <div key={card.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="font-medium">{card.bank_name}</div>
            <div className="text-sm text-gray-400">
              {card.card_name}{card.last4 ? ` •••• ${card.last4}` : ''}
            </div>
            {gmailSync[card.id] && (
              <div className="text-xs text-blue-400 mt-1">
                {gmailSync[card.id].count} transactions via Gmail &middot; last synced{' '}
                {new Date(gmailSync[card.id].lastSyncedAt).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
