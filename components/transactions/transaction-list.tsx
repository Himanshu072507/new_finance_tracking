import type { Transaction } from '@/lib/db/transactions'
import CategoryEdit from './category-edit'

export default function TransactionList({
  transactions,
  count,
  page,
  pageSize,
}: {
  transactions: Transaction[]
  count: number
  page: number
  pageSize: number
}) {
  const totalPages = Math.ceil(count / pageSize)

  if (transactions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        No transactions found. Upload a statement from the Cards page.
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="pb-3 pr-4 font-medium">Date</th>
              <th className="pb-3 pr-4 font-medium">Merchant</th>
              <th className="pb-3 pr-4 font-medium">Category</th>
              <th className="pb-3 pr-4 font-medium text-right">Amount</th>
              <th className="pb-3 pr-4 font-medium">Type</th>
              <th className="pb-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-900">
            {transactions.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-900/50 transition-colors">
                <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{tx.date}</td>
                <td className="py-3 pr-4 max-w-xs truncate">{tx.merchant}</td>
                <td className="py-3 pr-4">
                  <CategoryEdit transactionId={tx.id} current={tx.category} />
                </td>
                <td className="py-3 pr-4 text-right font-mono">
                  ₹{Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    tx.type === 'debit'
                      ? 'bg-red-900/40 text-red-400'
                      : 'bg-green-900/40 text-green-400'
                  }`}>
                    {tx.type}
                  </span>
                </td>
                <td className="py-3">
                  {tx.statements?.source && tx.statements.source !== 'manual' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400">
                      Gmail
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-500">
          <span>{count} transactions</span>
          <span>Page {page + 1} of {totalPages}</span>
        </div>
      )}
    </div>
  )
}
