import Link from 'next/link'

export default function LandingPage() {
  return (
    <div
      className="app-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(32px, 4vw, 48px)',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          marginBottom: '16px',
        }}
      >
        Recall Loop
      </h1>
      <p
        style={{
          maxWidth: '560px',
          color: 'var(--muted)',
          fontSize: '18px',
          lineHeight: 1.6,
          marginBottom: '32px',
        }}
      >
        Active recall practice with instant feedback. Master your knowledge with our
        comprehensive question bank.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          href="/login"
          className="btn btn-primary"
          style={{ textDecoration: 'none', display: 'inline-block' }}
        >
          Get Access
        </Link>
        <Link
          href="/login"
          className="btn btn-secondary"
          style={{ textDecoration: 'none', display: 'inline-block' }}
        >
          Sign In
        </Link>
      </div>
    </div>
  )
}
