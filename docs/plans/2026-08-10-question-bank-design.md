# Question Bank Web App — Design Document

**Date:** 2026-08-10
**Status:** Approved

## Overview

Transform the existing single-file "Recall Loop" HTML app into a full-stack Next.js web application with user authentication and Stripe payments. Users pay a fixed one-time amount for lifetime access to the question bank.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Frontend | React 19, CSS Modules |
| Auth | Supabase Auth (email + password) |
| Database | Supabase (PostgreSQL) |
| Payments | Stripe Checkout (one-time, lifetime access) |
| Hosting | Vercel |
| Content Mgmt | Supabase dashboard (table editor) |

## Architecture

```
Landing Page (/) 
    → Login (/login) — Supabase Auth email/password 
    → Paywall (/paywall) — Stripe Checkout redirect 
    → Quiz (/quiz) — Protected, gated by purchase check
```

**Data flow:**
1. User visits `/` — landing page with "Get Access" CTA
2. Redirected to `/login` — sign up or sign in via Supabase Auth
3. After auth, middleware checks `stripe_purchases` for active purchase
4. No purchase → `/paywall` with Stripe Checkout button
5. Successful payment → Stripe webhook creates record in `stripe_purchases`
6. User lands on `/quiz` with full access

## Database Schema (Supabase)

```sql
-- Questions table (managed via Supabase dashboard)
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,          -- e.g. "FARs", "FOI Basics", etc.
  question TEXT NOT NULL,
  choices JSONB NOT NULL,           -- ["Answer A", "Answer B", "Answer C"]
  answer INTEGER NOT NULL,          -- 0-based index of correct choice
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Purchase records
CREATE TABLE stripe_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  amount INTEGER NOT NULL,          -- in cents
  status TEXT NOT NULL DEFAULT 'pending',
  purchased_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: users can only read their own profile + purchases
-- RLS: authenticated users with active purchase can read questions
```

## Component Tree

```
Layout
├── LandingPage (/)
│   ├── Hero section
│   ├── Features preview
│   └── CTA → /login
│
├── AuthForm (/login)
│   ├── Sign In form (email + password)
│   └── Sign Up form (email + password)
│
├── PaywallGate (/paywall)
│   ├── Price display
│   └── Stripe Checkout button
│
└── QuizPage (/quiz)
    ├── TopBar (brand, logout)
    ├── CategoryBar (filter chips)
    ├── Layout (grid)
    │   ├── QuizCard
    │   │   ├── Question text
    │   │   ├── ChoiceButton × N
    │   │   ├── FeedbackSection
    │   │   │   ├── Correct/incorrect banner
    │   │   │   └── Explanation
    │   │   └── Navigation (prev/next)
    │   └── Sidebar
    │       └── Stats (answered, accuracy)
    └── Logout button
```

## Feature Scope — MVP

**Included:**
- MCQ with instant feedback (correct/incorrect highlighting)
- Category filtering (deck filter chips)
- Explanation display after answering
- Session stats (answered count, accuracy %)
- Full responsive design (preserves reference's CSS design system)

**Deferred (v2):**
- Active recall input
- Confidence tracking (sure/unsure/guessing)
- Spaced repetition review system
- Inline question editing
- JSON import/export
- Keyboard navigation shortcuts
- Wrong answer review mode
- Progress persistence across sessions

## Design System (preserved from reference)

All CSS custom properties, component styles, and responsive breakpoints are carried over from `reference.html`:
- Colors: `--bg: #f8fafc`, `--ink: #1f2937`, `--accent: #2563eb`, etc.
- Typography: Inter font family, responsive font sizes via `clamp()`
- Spacing: 16px card radius, 12px choice radius, consistent gaps
- States: selected, correct, wrong, hover, focus-visible
- Breakpoints: 900px (sidebar collapse), 640px (mobile)

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/stripe/checkout` | POST | Create Stripe Checkout session, return URL |
| `/api/stripe/webhook` | POST | Handle Stripe events (checkout.session.completed) |

## Middleware

```typescript
// Check: authenticated → has active purchase → allow /quiz
// Unauthenticated → redirect to /login
// No purchase → redirect to /paywall
```
