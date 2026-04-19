'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function SettingsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? '')
      supabase.from('users').select('plan').eq('id', user.id).single()
        .then(({ data }) => setPlan((data?.plan ?? 'free') as 'free' | 'pro'))
    })
  }, [])

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/create-portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Failed to open billing portal')
      window.location.href = data.url
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {params.get('upgraded') && (
        <div className="bg-green-900/30 border border-green-800 rounded-xl p-4 mb-6 text-sm text-green-300">
          You're now on Pro. All banks and cards are unlocked.
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-500 mb-1">Account</div>
          <div className="font-medium">{email}</div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-500 mb-1">Plan</div>
          <div className="flex items-center justify-between">
            <span className="font-medium capitalize">{plan}</span>
            {plan === 'pro' ? (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="text-sm text-blue-400 hover:underline disabled:opacity-50"
              >
                {portalLoading ? 'Loading...' : 'Manage subscription'}
              </button>
            ) : (
              <button
                onClick={() => router.push('/cards')}
                className="text-sm bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-1.5 transition-colors"
              >
                Upgrade to Pro
              </button>
            )}
          </div>
          {portalError && (
            <p className="text-red-400 text-sm mt-2">{portalError}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  )
}
