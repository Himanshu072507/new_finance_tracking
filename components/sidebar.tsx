'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/cards', label: 'Cards' },
  { href: '/settings', label: 'Settings' },
]

export default function Sidebar({ plan }: { plan: 'free' | 'pro' }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="font-bold text-lg tracking-tight">BillWise</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === href
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-gray-800 space-y-3">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          plan === 'pro' ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'
        }`}>
          {plan === 'pro' ? 'Pro' : 'Free'}
        </span>
        <button
          onClick={handleSignOut}
          className="block text-sm text-gray-500 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
