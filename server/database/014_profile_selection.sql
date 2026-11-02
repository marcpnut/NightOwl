ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_main boolean NOT NULL DEFAULT false;

UPDATE profiles
SET is_main=true
WHERE id=(SELECT id FROM profiles WHERE account_id='primary' ORDER BY created_at,id LIMIT 1)
  AND NOT EXISTS(SELECT 1 FROM profiles WHERE account_id='primary' AND is_main);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_single_main_idx
  ON profiles(account_id) WHERE is_main;

CREATE TABLE IF NOT EXISTS device_profile_selections (
  device_id text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
