import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getAdminClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { metadata?: { userId?: string }; subscription?: string }
    const userId = session.metadata?.userId
    if (userId) {
      const { error } = await supabase.from('users').update({
        plan: 'pro',
        stripe_subscription_id: session.subscription,
      }).eq('id', userId)
      if (error) console.error('checkout.session.completed update failed:', error)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as { id: string }
    const { error } = await supabase.from('users')
      .update({ plan: 'free', stripe_subscription_id: null })
      .eq('stripe_subscription_id', sub.id)
    if (error) console.error('customer.subscription.deleted update failed:', error)
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as { id: string; status: string }
    if (sub.status === 'active') {
      const { error } = await supabase.from('users').update({ plan: 'pro' }).eq('stripe_subscription_id', sub.id)
      if (error) console.error('customer.subscription.updated (active) update failed:', error)
    } else if (['canceled', 'unpaid', 'past_due'].includes(sub.status)) {
      const { error } = await supabase.from('users').update({ plan: 'free' }).eq('stripe_subscription_id', sub.id)
      if (error) console.error('customer.subscription.updated (inactive) update failed:', error)
    }
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
