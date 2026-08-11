import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // @ts-expect-error - Stripe API version mismatch with SDK types
  apiVersion: '2025-06-15.acacia',
})
