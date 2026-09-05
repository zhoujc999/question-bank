-- Grant role privileges (required for the REST/Auth roles)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- questions: service_role full access, authenticated can read (RLS gates by purchase)
GRANT SELECT ON questions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON questions TO service_role;

-- profiles: users can read their own (RLS gates by id)
GRANT SELECT ON profiles TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON profiles TO service_role;

-- stripe_purchases: users can read their own; service_role writes via webhook
GRANT SELECT, INSERT ON stripe_purchases TO authenticated, service_role;
GRANT UPDATE, DELETE ON stripe_purchases TO service_role;
