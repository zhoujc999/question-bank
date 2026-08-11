'use client'

import { useState } from 'react'
import { signIn, signUp } from '@/app/login/actions'

export function AuthForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    setMessage('')
    const result: { error?: string; message?: string } | undefined =
      mode === 'signin' ? await signIn(formData) : await signUp(formData)
    if (result?.error) setError(result.error)
    if (result?.message) setMessage(result.message)
    setLoading(false)
  }

  return (
    <div className="password-gate">
      <section className="password-card auth-card">
        <h1>Recall Loop</h1>
        <p>
          {mode === 'signin'
            ? 'Sign in to access the question bank.'
            : 'Create an account to get started.'}
        </p>
        <form className="auth-form" action={handleSubmit}>
          <input
            className="password-input"
            name="email"
            type="email"
            placeholder="Email"
            required
            autoComplete="email"
          />
          <input
            className="password-input"
            name="password"
            type="password"
            placeholder="Password"
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
          />
          <div className="auth-actions">
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError('')
                setMessage('')
              }}
            >
              {mode === 'signin' ? 'Create account' : 'Sign in instead'}
            </button>
          </div>
          {error && <p className="auth-message error">{error}</p>}
          {message && <p className="auth-message">{message}</p>}
        </form>
      </section>
    </div>
  )
}
