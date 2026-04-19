'use client'
import { useRouter, usePathname } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316','#84cc16','#6366f1','#94a3b8']

export default function CategoryDonutChart({
  data,
  selectedMonth,
  monthOptions,
}: {
  data: { category: string; total: number }[]
  selectedMonth: string
  monthOptions: { key: string; label: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()

  function handleMonthChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const params = new URLSearchParams()
    if (val) params.set('month', val)
    router.push(`${pathname}${val ? `?${params}` : ''}`)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-400">
          {selectedMonth ? 'Spend by Category' : 'Spend by Category (last 6 months)'}
        </h2>
        <select
          value={selectedMonth}
          onChange={handleMonthChange}
          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">Last 6 months</option>
          {monthOptions.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          No data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="category" cx="50%" cy="50%" innerRadius={60} outerRadius={90}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 13 }}
              formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, '']}
            />
            <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 12, color: '#9ca3af' }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
