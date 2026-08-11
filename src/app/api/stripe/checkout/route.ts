import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabase
    .from('stripe_purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Already purchased' }, { status: 400 })

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/quiz?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/paywall?canceled=true`,
    client_reference_id: user.id,
    metadata: { user_id: user.id },
  })

  await supabase.from('stripe_purchases').insert({
    user_id: user.id,
    stripe_session_id: session.id,
    stripe_customer_id: session.customer as string || null,
    amount: 0,
    status: 'pending',
  })

  return NextResponse.json({ url: session.url })
}
