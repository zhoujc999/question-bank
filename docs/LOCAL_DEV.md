# Running Recall Loop Locally

Full end-to-end (auth → payment → quiz) on your own machine. Everything runs on
`localhost` — no production deploys touched.

## Prerequisites (already on this machine)

| Tool | Status |
|------|--------|
| Docker | ✓ v29.6.1 |
| Node.js | ✓ v22.15.0 |
| npm | ✓ 10.9.2 |

## 0. Install the two CLIs

```bash
brew install supabase/tap/supabase
brew install stripe/stripe-cli/stripe
```

Verify:

```bash
supabase --version
stripe --version
```

---

## 1. Start local Supabase (auth + database)

`supabase/` already contains `migrations/001_schema.sql` (schema) and
`seed.sql` (400 questions). Initialize and start the stack:

```bash
supabase init      # creates supabase/config.toml (only needed once)
supabase start     # pulls Docker images, starts Postgres/Auth/Studio/etc.
```

On first run this downloads several Docker images — allow a few minutes.

When it finishes you'll see output like this:

```
         API URL: http://127.0.0.1:54321
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323        <- Supabase dashboard (local)
    Inbucket URL: http://127.0.0.1:54324        <- test emails land here
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Apply the schema + seed the 400 questions (migrations first, then seed):

```bash
supabase db reset --no-confirm
```

Verify in Studio (**http://localhost:54323** → Table Editor): `questions`
has 400 rows, and `profiles` / `stripe_purchases` exist.

---

## 2. Configure `.env.local`

`.env.local` is already gitignored. Copy the values printed by `supabase start`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from output>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from output>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRICE_AMOUNT=999
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

(Supabase values are filled now; Stripe values come in step 3.)

---

## 3. Stripe (test mode) — product, keys, webhook

You need a free Stripe account; use **test mode** only, no real charges.

### 3a. Create the product + price

Via CLI (alternative: do it in the dashboard → **Products** → Add product, $9.99 one-time):

```bash
stripe products create --name "Recall Loop — lifetime access"
```

Copy the returned `prod_...` ID, then:

```bash
STRIPE_API_KEY=sk_test_... stripe products create --name "Recall Loop — lifetime access"
STRIPE_API_KEY=sk_test_... stripe prices create --product prod_xxx --unit-amount 999 --currency usd
```

Copy the returned `price_...` ID → set `STRIPE_PRICE_ID`.

### 3b. Grab API keys

Dashboard → **Developers → API keys**:
- `STRIPE_SECRET_KEY` = `sk_test_...`

### 3c. Forward webhooks to localhost

In a terminal (leave it running while you test):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

It prints a signing secret on startup:

```
Your webhook signing secret is whsec_...
```

Set `STRIPE_WEBHOOK_SECRET` = that `whsec_...` value.

---

## 4. Run the app

Ready your terminals:

| Terminal | Command |
|----------|---------|
| 1 (Supabase) | `supabase start` (leave running) |
| 2 (Webhooks) | `stripe listen --forward-to localhost:3000/api/stripe/webhook` |
| 3 (App) | `npm run dev` |
| 4 (Studio) | http://localhost:54323 (open when needed) |

---

## 5. End-to-end test

1. Open **http://localhost:3000** → landing page.
2. **Get Access** → sign up with an email + password.
3. Confirm the email:
   - Open **http://localhost:54324** (Inbucket) and click the confirmation link, **or**
   - auto-confirm from Studio → SQL Editor:
     ```sql
     UPDATE auth.users SET email_confirmed_at = now()
     WHERE email = 'you@example.com';
     ```
4. After logging in you'll be sent to **/paywall** (no purchase yet).
5. **Pay with Card** → Stripe Checkout. Use test card:
   `4242 4242 4242 4242`, any future expiry, any CVC.
6. Stripe redirects to **/quiz?success=true**. The webhook (terminal 2) logs
   `checkout.session.completed` and marks your purchase complete.
7. The quiz loads all 400 questions with category filters. Answer one — you get
   instant feedback + explanation, and the Session stats update.

Note: the first purchase in a test run can take a second or two to flip
`stripe_purchases.status` to `completed` (webhook latency). If you land on
`/quiz` and get bounced to `/paywall`, just revisit `/quiz`.

---

## Shortcuts for local development

**Skip payments entirely** (unlock your user directly):

```sql
-- In Studio → SQL Editor
INSERT INTO stripe_purchases (user_id, stripe_session_id, stripe_customer_id, amount, status)
SELECT id, 'manual', NULL, 999, 'completed'
FROM auth.users WHERE email = 'you@example.com';
```

Then `/quiz` works without Stripe.

**Add / edit questions:** Studio → Table Editor → `questions` table (vs. dashboard,
manually, or re-run the extractor: `node scripts/extract-questions.js` then re-seed).

---

## Troubleshooting

- **`supabase start` fails / image pull issues** → `supabase stop` then retry;
  check Docker is running (`docker info`).
- **Confirmation link redirects somewhere odd** → in `supabase/config.toml`
  under `[auth]`, set `site_url = "http://localhost:3000"`, then
  `supabase restart` (managed Supabase sets this per project).
- **Checkout says "No such price"** → `STRIPE_PRICE_ID` is wrong; re-check 3a.
- **Webhook returns 400 (bad signature)** → `STRIPE_WEBHOOK_SECRET` must be the
  `whsec_...` from **your** running `stripe listen` (each instance generates a new one).
- **Quiz keeps bouncing to `/paywall`** → purchases not marked complete yet; wait a
  beat and revisit, or use the manual-insert shortcut above.
- **Middleware warning about `proxy` vs `middleware`** → harmless deprecation notice
  on Next.js 16; functionally identical for now.
