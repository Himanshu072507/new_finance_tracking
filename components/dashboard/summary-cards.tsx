export default function SummaryCards({
  totalSpend,
  thisMonthSpend,
  topCategory,
}: {
  totalSpend: number
  thisMonthSpend: number
  topCategory: string
}) {
  const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {[
        { label: 'Total Spend', value: fmt(totalSpend) },
        { label: 'This Month', value: fmt(thisMonthSpend) },
        { label: 'Top Category', value: topCategory || '—' },
      ].map(({ label, value }) => (
        <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-500 mb-1">{label}</div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
        </div>
      ))}
    </div>
  )
}
