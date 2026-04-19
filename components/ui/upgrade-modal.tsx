'use client'
import { useState } from 'react'

export default function UpgradeModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const res = await fetch('/api/create-checkout', { method: 'POST' })
    const { url } = await res.json()
    window.location.href = url
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-sm w-full">
        <h2 className="text-xl font-bold mb-2">Upgrade to Pro</h2>
        <p className="text-gray-400 text-sm mb-6">
          Free plan supports 1 card. Upgrade to Pro for unlimited cards and banks.
        </p>
        <ul className="text-sm text-gray-300 space-y-2 mb-6">
          <li>✓ Unlimited cards</li>
          <li>✓ All banks supported</li>
          <li>✓ Full analytics</li>
        </ul>
        <div className="flex gap-3">
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? 'Redirecting...' : 'Upgrade — ₹199/mo'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
