'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function MonthlyTrendChart({
  data,
}: {
  data: { month: string; total: number }[]
}) {
  const formatted = data.map(d => ({
    ...d,
    label: new Date(d.month + '-01').toLocaleString('default', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
      <h2 className="text-sm font-medium text-gray-400 mb-4">Monthly Spend (last 6 months)</h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={formatted} barSize={32}>
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 13 }}
            formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Spend']}
          />
          <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
