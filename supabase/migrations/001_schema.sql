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

-- Users create their own pending purchase record before Stripe checkout
CREATE POLICY "Users can insert own purchases"
  ON stripe_purchases FOR INSERT
  WITH CHECK (auth.uid() = user_id);

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
