'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES } from '@/lib/constants'

export default function CategoryEdit({
  transactionId,
  current,
}: {
  transactionId: string
  current: string
}) {
  const [category, setCategory] = useState(current)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSelect(cat: string) {
    const prev = category
    setSaving(true)
    setOpen(false)
    setCategory(cat)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('transactions')
        .update({ category: cat })
        .eq('id', transactionId)
      if (error) setCategory(prev)
    } catch {
      setCategory(prev)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className="text-xs bg-gray-800 hover:bg-gray-700 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
      >
        {saving ? '...' : category}
      </button>
      {open && (
        <div className="absolute z-10 top-full mt-1 left-0 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-40">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => handleSelect(cat)}
              className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-gray-800 transition-colors ${cat === category ? 'text-blue-400' : 'text-gray-300'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
