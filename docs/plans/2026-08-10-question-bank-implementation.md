# Question Bank Web App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js full-stack quiz app with Supabase auth, Stripe one-time payment gating, and MCQ question bank.

**Architecture:** Next.js 15 App Router, Supabase for auth + PostgreSQL, Stripe Checkout for one-time lifetime access payments. Preserves the reference HTML's design system. CSS Modules with custom properties.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase (auth + db), Stripe SDK, CSS Modules

**Design doc:** `docs/plans/2026-08-10-question-bank-design.md`

---

### Task 0: Project Scaffolding

**Files:**
- Create: all project files via `create-next-app`
- Modify: none

**Step 1: Scaffold Next.js project**

Run:
```bash
cd /Users/jingchao/question-bank && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

If the directory is not empty, add `--force` or scaffold in a temp directory and move files.

**Step 2: Install additional dependencies**

Run:
```bash
cd /Users/jingchao/question-bank && npm install @supabase/supabase-js @supabase/ssr stripe
```

**Step 3: Verify project runs**

Run:
```bash
cd /Users/jingchao/question-bank && npm run dev
```

Open http://localhost:3000 — should see the default Next.js page.

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js project with dependencies"
```

---

### Task 1: Environment & Supabase Setup

**Files:**
- Create: `.env.local`, `supabase/migrations/001_schema.sql`

**Step 1: Create `.env.local`**

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRICE_AMOUNT=999
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Step 2: Create the database migration file**

Create `supabase/migrations/001_schema.sql`:

```sql
-- Questions table (populated via Supabase dashboard or import)
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  choices JSONB NOT NULL,
  answer INTEGER NOT NULL,
  explanation TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Purchase records
CREATE TABLE IF NOT EXISTS stripe_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  purchased_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- RLS: Purchases
ALTER TABLE stripe_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own purchases"
  ON stripe_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: Questions (any authenticated user with active purchase can read)
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users with purchase can read questions"
  ON questions FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM stripe_purchases
      WHERE user_id = auth.uid()
      AND status = 'completed'
    )
  );
```

**Step 3: Run migration in Supabase SQL editor**

Copy the contents of `supabase/migrations/001_schema.sql` and run it in the Supabase dashboard SQL editor.

**Step 4: Verify tables exist**

Open Supabase dashboard → Table Editor → Confirm `questions`, `profiles`, `stripe_purchases` exist with correct columns.

**Step 5: Commit**

```bash
git add supabase/migrations/001_schema.sql .env.local && git commit -m "feat: add database schema and environment config"
```

---

### Task 2: Supabase Client Library

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`

**Step 1: Create browser client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```

**Step 2: Create server client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

**Step 3: Create middleware helper**

Create `src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: purchase } = await supabase
      .from('stripe_purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .single()

    if (request.nextUrl.pathname.startsWith('/quiz')) {
      if (!purchase) {
        return NextResponse.redirect(new URL('/paywall', request.url))
      }
    }
  } else {
    if (request.nextUrl.pathname.startsWith('/quiz') || request.nextUrl.pathname.startsWith('/paywall')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return supabaseResponse
}
```

**Step 4: Commit**

```bash
git add src/lib/supabase/ && git commit -m "feat: add Supabase client library and middleware helper"
```

---

### Task 3: Auth Middleware & Logout

**Files:**
- Create: `src/middleware.ts`
- Modify: `src/app/layout.tsx`

**Step 1: Create middleware**

Create `src/middleware.ts`:

```typescript
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: Request) {
  const { pathname } = new URL(request.url)
  const protectedPaths = ['/quiz', '/paywall']
  const isProtected = protectedPaths.some(path => pathname.startsWith(path))

  if (!isProtected) return

  return await updateSession(request as any)
}

export const config = {
  matcher: ['/quiz/:path*', '/paywall/:path*'],
}
```

Note: Supabase's SSR middleware uses cookies from the Request/Response objects. The `as any` cast is needed because Next.js types differ slightly.

**Step 2: Verify middleware compiles**

Run:
```bash
cd /Users/jingchao/question-bank && npx tsc --noEmit
```

Expected: No type errors (or only pre-existing ones).

**Step 3: Add logout action**

Create `src/app/auth/logout/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'))
}
```

Run:
```bash
mkdir -p /Users/jingchao/question-bank/src/app/auth/logout
```

**Step 4: Commit**

```bash
git add src/middleware.ts src/app/auth/logout/route.ts && git commit -m "feat: add auth middleware and logout route"
```

---

### Task 4: Design System — Global Styles

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Replace `globals.css` with the reference design system**

Read the current `src/app/globals.css`, then replace its content with the CSS from `reference.html:9-1048` (the entire `<style>` block). Strip out the tailwind directives if present, or keep a minimal Tailwind base.

Run:
```bash
rm /Users/jingchao/question-bank/src/app/globals.css
```

Create `src/app/globals.css` with the full CSS from reference.html's `<style>` block, plus:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

at the top if keeping Tailwind, or remove Tailwind entirely if preferring pure CSS. Since this project uses the reference design system exclusively, remove Tailwind directives:

```css
/* No Tailwind — pure design system from reference.html */
```

Then paste the entire CSS from reference.html's `<style>` section.

**Step 2: Update root layout to include Inter font**

Modify `src/app/layout.tsx` to include the Inter font link and apply design system classes:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Recall Loop',
  description: 'Question bank for active recall practice',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

**Step 3: Verify CSS loads**

Run:
```bash
cd /Users/jingchao/question-bank && npm run dev
```

Open http://localhost:3000 — the body should have the correct font and background color.

**Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx && git commit -m "feat: add design system global styles from reference"
```

---

### Task 5: Auth Form — Login Page

**Files:**
- Create: `src/app/login/page.tsx`, `src/components/AuthForm.tsx`
- Create: `src/app/login/actions.ts`

**Step 1: Create auth server actions**

Create `src/app/login/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/quiz')
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: error.message }

  return { message: 'Check your email for confirmation.' }
}
```

**Step 2: Create AuthForm component**

Create `src/components/AuthForm.tsx`:

Reference the `.auth-card`, `.auth-form`, `.auth-actions`, `.auth-message` CSS classes from `reference.html:952-1034`.

```tsx
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
    const result = mode === 'signin' ? await signIn(formData) : await signUp(formData)
    if (result?.error) setError(result.error)
    if (result?.message) setMessage(result.message)
    setLoading(false)
  }

  return (
    <div className="password-gate">
      <section className="password-card auth-card">
        <h1>Recall Loop</h1>
        <p>{mode === 'signin' ? 'Sign in to access the question bank.' : 'Create an account to get started.'}</p>
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
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage('') }}
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
```

**Step 3: Create login page**

Create `src/app/login/page.tsx`:

```tsx
import { AuthForm } from '@/components/AuthForm'

export default function LoginPage() {
  return <AuthForm />
}
```

**Step 4: Verify login page renders**

Run:
```bash
cd /Users/jingchao/question-bank && npm run dev
```

Open http://localhost:3000/login — should see the auth card with email/password fields.

**Step 5: Commit**

```bash
git add src/app/login/ src/components/AuthForm.tsx && git commit -m "feat: add auth form and login page"
```

---

### Task 6: Stripe Checkout API

**Files:**
- Create: `src/lib/stripe.ts`
- Create: `src/app/api/stripe/checkout/route.ts`

**Step 1: Create Stripe server helper**

Create `src/lib/stripe.ts`:

```typescript
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-15.acacia',
})
```

**Step 2: Create checkout API route**

Create `src/app/api/stripe/checkout/route.ts`:

```typescript
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
    .single()

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
    stripe_customer_id: session.customer as string,
    amount: 0,
    status: 'pending',
  })

  return NextResponse.json({ url: session.url })
}
```

**Step 3: Commit**

```bash
git add src/lib/stripe.ts src/app/api/stripe/checkout/route.ts && git commit -m "feat: add Stripe checkout API route"
```

---

### Task 7: Stripe Webhook

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`

**Step 1: Create webhook route**

Create `src/app/api/stripe/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabaseAdmin
      .from('stripe_purchases')
      .update({ status: 'completed', amount: (session.amount_total || 0), stripe_customer_id: session.customer as string })
      .eq('stripe_session_id', session.id)
  }

  return NextResponse.json({ received: true })
}

export const config = { api: { bodyParser: false } }
```

**Step 2: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts && git commit -m "feat: add Stripe webhook handler"
```

---

### Task 8: Paywall Page

**Files:**
- Create: `src/app/paywall/page.tsx`

**Step 1: Create paywall page**

Create `src/app/paywall/page.tsx`:

```tsx
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
            ${(Number(process.env.NEXT_PUBLIC_STRIPE_PRICE_AMOUNT) / 100).toFixed(2)}
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
```

Note: The price amount won't be available client-side via `process.env` directly. We'll expose it via the public env var `NEXT_PUBLIC_STRIPE_PRICE_AMOUNT` defined in `.env.local`.

If you want the price to display dynamically, you can fetch it from an API. For the MVP, a hardcoded env var is sufficient.

**Step 2: Verify paywall renders**

Run:
```bash
cd /Users/jingchao/question-bank && npm run dev
```

Open http://localhost:3000/paywall — should see the price and "Pay with Card" button.

**Step 3: Commit**

```bash
git add src/app/paywall/page.tsx && git commit -m "feat: add paywall page with Stripe Checkout redirect"
```

---

### Task 9: Landing Page

**Files:**
- Create: `src/app/page.tsx`

**Step 1: Create landing page**

Create `src/app/page.tsx`:

```tsx
import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', textAlign: 'center' }}>
      <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '16px' }}>
        Recall Loop
      </h1>
      <p style={{ maxWidth: '560px', color: 'var(--muted)', fontSize: '18px', lineHeight: 1.6, marginBottom: '32px' }}>
        Active recall practice with instant feedback. Master your knowledge with our comprehensive question bank.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/login" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          Get Access
        </Link>
        <Link href="/login" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          Sign In
        </Link>
      </div>
    </div>
  )
}
```

**Step 2: Verify landing page renders**

Run:
```bash
cd /Users/jingchao/question-bank && npm run dev
```

Open http://localhost:3000 — should see the landing page with branding and CTA.

**Step 3: Commit**

```bash
git add src/app/page.tsx && git commit -m "feat: add landing page"
```

---

### Task 10: Supabase Auth Callback

**Files:**
- Create: `src/app/auth/callback/route.ts`

**Step 1: Create auth callback route (for email confirmation magic links)**

Create `src/app/auth/callback/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/quiz'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
```

Run:
```bash
mkdir -p /Users/jingchao/question-bank/src/app/auth/callback
```

**Step 2: Commit**

```bash
git add src/app/auth/callback/route.ts && git commit -m "feat: add Supabase auth callback route"
```

---

### Task 11: Quiz Page — Data Fetching & State

**Files:**
- Create: `src/app/quiz/page.tsx`
- Create: `src/lib/quiz.ts`

**Step 1: Create quiz data helpers**

Create `src/lib/quiz.ts`:

```typescript
export interface Question {
  id: string
  category: string
  question: string
  choices: string[]
  answer: number
  explanation: string
}

export const CATEGORIES = [
  'FARs',
  'General',
  'Definitions-Concepts',
  'FOI Basics',
  'Perception-Memory',
  'Evaluation',
]

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
```

**Step 2: Create quiz page (server component for data fetch)**

Create `src/app/quiz/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { QuizApp } from '@/components/QuizApp'
import type { Question } from '@/lib/quiz'

export default async function QuizPage() {
  const supabase = await createClient()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .returns<Question[]>()

  if (!questions || questions.length === 0) {
    return (
      <div className="app-shell">
        <div className="panel empty-state">
          <h2>No questions yet</h2>
          <p>Add questions via the Supabase dashboard to get started.</p>
        </div>
      </div>
    )
  }

  return <QuizApp questions={questions} />
}
```

**Step 3: Commit**

```bash
git add src/lib/quiz.ts src/app/quiz/page.tsx && git commit -m "feat: add quiz page data fetching and types"
```

---

### Task 12: QuizApp Component

**Files:**
- Create: `src/components/QuizApp.tsx`

**Step 1: Create QuizApp (client component with full quiz state)**

Create `src/components/QuizApp.tsx`:

```tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import type { Question } from '@/lib/quiz'
import { shuffleArray, CATEGORIES } from '@/lib/quiz'
import { CategoryBar } from './CategoryBar'
import { QuizCard } from './QuizCard'
import { Sidebar } from './Sidebar'

export function QuizApp({ questions }: { questions: Question[] }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  const filtered = useMemo(() => {
    if (selectedCategory === 'All') return questions
    return questions.filter((q) => q.category === selectedCategory)
  }, [questions, selectedCategory])

  const current = filtered[currentIndex] ?? null

  const handleAnswer = useCallback(
    (choiceIndex: number) => {
      if (answered || !current) return
      setSelectedChoice(choiceIndex)
      setAnswered(true)
      setStats((s) => ({
        answered: s.answered + 1,
        correct: s.correct + (choiceIndex === current.answer ? 1 : 0),
      }))
    },
    [answered, current]
  )

  const goNext = useCallback(() => {
    if (currentIndex < filtered.length - 1) {
      setCurrentIndex((i) => i + 1)
      setAnswered(false)
      setSelectedChoice(null)
    }
  }, [currentIndex, filtered.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
      setAnswered(false)
      setSelectedChoice(null)
    }
  }, [currentIndex])

  const handleCategoryChange = useCallback((cat: string) => {
    setSelectedCategory(cat)
    setCurrentIndex(0)
    setAnswered(false)
    setSelectedChoice(null)
  }, [])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Recall Loop</h1>
          <p>Multiple-choice practice with instant feedback.</p>
        </div>
        <div className="toolbar">
          <a href="/auth/logout" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Logout
          </a>
        </div>
      </header>

      <CategoryBar selected={selectedCategory} categories={[...CATEGORIES, 'All']} onChange={handleCategoryChange} />

      <div className="layout">
        <QuizCard
          question={current}
          index={currentIndex}
          total={filtered.length}
          answered={answered}
          selectedChoice={selectedChoice}
          onAnswer={handleAnswer}
          onNext={goNext}
          onPrev={goPrev}
        />
        <Sidebar answered={stats.answered} correct={stats.correct} total={questions.length} />
      </div>
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/QuizApp.tsx && git commit -m "feat: add QuizApp state management component"
```

---

### Task 13: CategoryBar, QuizCard, Sidebar, ChoiceButton Components

**Files:**
- Create: `src/components/CategoryBar.tsx`, `src/components/QuizCard.tsx`, `src/components/Sidebar.tsx`, `src/components/ChoiceButton.tsx`, `src/components/FeedbackSection.tsx`

**Step 1: Create CategoryBar**

Create `src/components/CategoryBar.tsx`:

Use the `.deck-filter`, `.filter-btn`, `.filter-btn.active` CSS classes from reference.html.

```tsx
export function CategoryBar({
  selected,
  categories,
  onChange,
}: {
  selected: string
  categories: string[]
  onChange: (cat: string) => void
}) {
  return (
    <div className="deck-filter" style={{ marginBottom: '20px' }}>
      {categories.map((cat) => (
        <button
          key={cat}
          className={`filter-btn ${selected === cat ? 'active' : ''}`}
          onClick={() => onChange(cat)}
        >
          {cat === 'All' ? 'All questions' : `${cat} questions`}
        </button>
      ))}
    </div>
  )
}
```

**Step 2: Create ChoiceButton**

Create `src/components/ChoiceButton.tsx`:

```tsx
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function ChoiceButton({
  index,
  text,
  state,
  onClick,
}: {
  index: number
  text: string
  state: 'idle' | 'selected' | 'correct' | 'wrong'
  onClick: () => void
}) {
  const classMap: Record<typeof state, string> = {
    idle: 'choice',
    selected: 'choice selected',
    correct: 'choice correct',
    wrong: 'choice wrong',
  }

  return (
    <button
      className={classMap[state]}
      onClick={onClick}
      disabled={state !== 'idle' && state !== 'selected'}
    >
      <span className="choice-letter">{LETTERS[index] || '?'}</span>
      <span className="choice-text">{text}</span>
    </button>
  )
}
```

**Step 3: Create FeedbackSection**

Create `src/components/FeedbackSection.tsx`:

```tsx
export function FeedbackSection({
  selectedChoice,
  correctAnswer,
  choices,
  explanation,
}: {
  selectedChoice: number
  correctAnswer: number
  choices: string[]
  explanation: string
}) {
  const isCorrect = selectedChoice === correctAnswer

  return (
    <div className={`feedback show ${isCorrect ? 'good' : 'bad'}`}>
      <h3>{isCorrect ? 'Correct!' : 'Not quite'}</h3>
      <p>
        You selected <strong>{choices[selectedChoice]}</strong>.
        {!isCorrect && (
          <>
            {' '}The correct answer is <strong>{choices[correctAnswer]}</strong>.
          </>
        )}
      </p>
      {explanation && (
        <div className="explanation">
          <strong>Explanation</strong>
          <p>{explanation}</p>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Create QuizCard**

Create `src/components/QuizCard.tsx`:

```tsx
import type { Question } from '@/lib/quiz'
import { ChoiceButton } from './ChoiceButton'
import { FeedbackSection } from './FeedbackSection'

export function QuizCard({
  question,
  index,
  total,
  answered,
  selectedChoice,
  onAnswer,
  onNext,
  onPrev,
}: {
  question: Question | null
  index: number
  total: number
  answered: boolean
  selectedChoice: number | null
  onAnswer: (i: number) => void
  onNext: () => void
  onPrev: () => void
}) {
  if (!question) {
    return (
      <section className="panel quiz-card">
        <div className="empty-state">
          <h2>No questions in this category</h2>
          <p>Select a different category or add questions via the Supabase dashboard.</p>
        </div>
      </section>
    )
  }

  function getChoiceState(choiceIndex: number): 'idle' | 'selected' | 'correct' | 'wrong' {
    if (!answered) {
      return selectedChoice === choiceIndex ? 'selected' : 'idle'
    }
    if (choiceIndex === question!.answer) return 'correct'
    if (choiceIndex === selectedChoice) return 'wrong'
    return 'idle'
  }

  return (
    <section className="panel quiz-card">
      <div className="eyebrow">
        <span>{question.category}</span>
        <span>{index + 1} of {total}</span>
      </div>

      <h2 className="question">{question.question}</h2>

      <div className="choices">
        {question.choices.map((choice, i) => (
          <ChoiceButton
            key={i}
            index={i}
            text={choice}
            state={getChoiceState(i)}
            onClick={() => onAnswer(i)}
          />
        ))}
      </div>

      {answered && selectedChoice !== null && (
        <FeedbackSection
          selectedChoice={selectedChoice}
          correctAnswer={question.answer}
          choices={question.choices}
          explanation={question.explanation}
        />
      )}

      <div className="actions">
        <button className="btn btn-secondary" onClick={onPrev} disabled={index === 0}>
          Previous
        </button>
        <button className="btn btn-primary" onClick={onNext} disabled={index >= total - 1}>
          Next
        </button>
      </div>
    </section>
  )
}
```

**Step 5: Create Sidebar**

Create `src/components/Sidebar.tsx`:

```tsx
export function Sidebar({
  answered,
  correct,
  total,
}: {
  answered: number
  correct: number
  total: number
}) {
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0

  return (
    <aside className="panel sidebar">
      <h2 className="section-title">Session</h2>
      <div className="stats-grid">
        <div className="stat">
          <strong>{answered}</strong>
          <span>Answered</span>
        </div>
        <div className="stat">
          <strong>{accuracy}%</strong>
          <span>Accuracy</span>
        </div>
      </div>
    </aside>
  )
}
```

**Step 6: Verify the full quiz experience**

Run:
```bash
cd /Users/jingchao/question-bank && npm run dev
```

First, insert a test question in Supabase dashboard `questions` table:

```sql
INSERT INTO questions (category, question, choices, answer, explanation)
VALUES ('Evaluation', 'What is the extent to which a test measures what it is supposed to measure?',
  '["Reliability", "Validity", "Discrimination"]'::jsonb, 1,
  'Validity is the most important consideration in test evaluation.');
```

Login, go through payment (or directly visit `/quiz` if bypassing the purchase check during dev), and verify:
- Quiz card shows the question with choices
- Clicking a choice highlights it, then shows feedback
- Explanation appears
- Previous/Next navigation works
- Category filter changes question set
- Sidebar shows stats

**Step 7: Commit**

```bash
git add src/components/ && git commit -m "feat: add quiz UI components (CategoryBar, ChoiceButton, Feedback, QuizCard, Sidebar)"
```

---

### Task 14: Final Integration Test & Polish

**Files:**
- Modify: `src/app/globals.css` (add any missing classes)
- Modify: various component files as needed

**Step 1: Run type check**

```bash
cd /Users/jingchao/question-bank && npx tsc --noEmit
```

Fix any type errors.

**Step 2: Run lint**

```bash
cd /Users/jingchao/question-bank && npm run lint
```

Fix any lint errors.

**Step 3: Full end-to-end verification**

1. Visit `/` — landing page renders
2. Click "Get Access" → `/login`
3. Sign up with a new email/password
4. Check email for confirmation link (if email confirmation is enabled in Supabase)
5. After login, middleware redirects to `/paywall` (no purchase)
6. Click "Pay with Card" — redirects to Stripe Checkout
7. Complete test payment with Stripe test card `4242 4242 4242 4242`
8. Stripe redirects to `/quiz?success=true`
9. Middleware detects purchase → allows `/quiz` access
10. Quiz renders with questions from Supabase
11. Answer questions, verify feedback, navigation, stats
12. Click "Logout" → redirects to `/login`
13. Sign in again → purchase check passes → straight to `/quiz`

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: integration polish and final fixes"
```

---

### Task 15: Import Questions from Reference

**Files:**
- Create: `scripts/import-questions.ts`

**Step 1: Create import script to migrate questions from reference.html to Supabase**

Extract the `sampleQuestions` JSON array from `reference.html` (between `/* QUESTION_BANK_START */` and `/* QUESTION_BANK_END */`) and create a Node.js script to insert them into Supabase.

**Step 2: Run import**

Run the script to populate the `questions` table.

**Step 3: Verify questions appear**

Open Supabase dashboard → Table Editor → `questions` table → confirm all questions are present.

**Step 4: Commit**

```bash
git add scripts/ && git commit -m "feat: add question import script from reference"
```
