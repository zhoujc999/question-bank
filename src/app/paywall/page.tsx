'use client'

import { useState } from 'react'

export default function PaywallPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCheckout() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      setError(data.error || 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <div className="password-gate">
      <section className="password-card auth-card">
        <h1>Unlock Recall Loop</h1>
        <p>Get lifetime access to the full question bank with a one-time payment.</p>
        <div className="auth-form">
          <div style={{ fontSize: '40px', fontWeight: 700, textAlign: 'center', margin: '16px 0' }}>
            ${(Number(process.env.NEXT_PUBLIC_STRIPE_PRICE_AMOUNT || 999) / 100).toFixed(2)}
          </div>
          <button className="btn btn-primary" onClick={handleCheckout} disabled={loading}>
            {loading ? 'Redirecting...' : 'Pay with Card'}
          </button>
          {error && <p className="auth-message error">{error}</p>}
        </div>
      </section>
    </div>
  )
}
