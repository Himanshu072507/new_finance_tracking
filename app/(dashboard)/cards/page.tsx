import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCards } from '@/lib/db/cards'
import { getGmailSyncByCard } from '@/lib/db/statements'
import CardList from '@/components/cards/card-list'

export default async function CardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [cards, gmailSync] = await Promise.all([
    getCards(supabase, user.id),
    getGmailSyncByCard(supabase, user.id),
  ])

  return <CardList cards={cards} gmailSync={gmailSync} />
}
