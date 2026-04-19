'use client'
import { useState } from 'react'

export default function UploadStatement({
  cardId,
  onUploaded,
}: {
  cardId: string
  onUploaded: (statementId: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const currentYear = new Date().getFullYear()
  const [monthNum, setMonthNum] = useState('')
  const [yearNum, setYearNum] = useState(String(currentYear))
  const month = yearNum && monthNum ? `${yearNum}-${monthNum.padStart(2, '0')}` : ''
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !month) return
    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('cardId', cardId)
      formData.append('month', month) // "YYYY-MM"
      if (password) formData.append('password', password)

      const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Upload failed')
      } else {
        onUploaded(json.statementId)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-3 mt-4 border-t border-gray-800 pt-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Statement Month</label>
        <div className="flex gap-2">
          <select
            value={monthNum}
            onChange={e => setMonthNum(e.target.value)}
            required
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">Month</option>
            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>
          <select
            value={yearNum}
            onChange={e => setYearNum(e.target.value)}
            required
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            {Array.from({ length: 4 }, (_, i) => currentYear - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`file-${cardId}`} className="block text-sm text-gray-400 mb-1">PDF File</label>
        <input
          id={`file-${cardId}`}
          type="file"
          accept=".pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          required
          className="text-sm text-gray-400"
        />
      </div>
      <div>
        <label htmlFor={`password-${cardId}`} className="block text-sm text-gray-400 mb-1">
          PDF Password <span className="text-gray-600">(if protected)</span>
        </label>
        <input
          id={`password-${cardId}`}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Leave blank if not protected"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading || !file || !month}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      >
        {loading ? 'Uploading & parsing...' : 'Upload Statement'}
      </button>
    </form>
  )
}
