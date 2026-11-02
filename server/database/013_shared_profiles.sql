-- This installation has one NightOwl owner account. Profiles and their data
-- therefore belong to that account, not to the device used to sign in.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_id text;
UPDATE profiles SET account_id='primary' WHERE account_id IS NULL;
ALTER TABLE profiles ALTER COLUMN account_id SET DEFAULT 'primary';
ALTER TABLE profiles ALTER COLUMN account_id SET NOT NULL;

-- Older installs created an independent profile with the same name on each
-- device. Consolidate those rows so continue-watching and My List are shared.
WITH profile_map AS (
  SELECT id,first_value(id) OVER (PARTITION BY account_id,lower(name) ORDER BY created_at,id) AS canonical_id
  FROM profiles
), merged_progress AS (
  SELECT DISTINCT ON (pm.canonical_id,w.kind,w.catalog_id)
    pm.canonical_id,w.kind,w.catalog_id,w.position_seconds,w.duration_seconds,w.completed,w.updated_at
  FROM watch_progress w JOIN profile_map pm ON pm.id=w.profile_id
  ORDER BY pm.canonical_id,w.kind,w.catalog_id,w.updated_at DESC
)
INSERT INTO watch_progress(profile_id,kind,catalog_id,position_seconds,duration_seconds,completed,updated_at)
SELECT canonical_id,kind,catalog_id,position_seconds,duration_seconds,completed,updated_at
FROM merged_progress
ON CONFLICT(profile_id,kind,catalog_id) DO UPDATE SET position_seconds=EXCLUDED.position_seconds,
  duration_seconds=EXCLUDED.duration_seconds,completed=EXCLUDED.completed,updated_at=EXCLUDED.updated_at
WHERE EXCLUDED.updated_at>watch_progress.updated_at;

WITH profile_map AS (
  SELECT id,first_value(id) OVER (PARTITION BY account_id,lower(name) ORDER BY created_at,id) AS canonical_id
  FROM profiles
)
INSERT INTO my_list(profile_id,kind,catalog_id,created_at)
SELECT pm.canonical_id,m.kind,m.catalog_id,min(m.created_at)
FROM my_list m JOIN profile_map pm ON pm.id=m.profile_id
WHERE pm.id<>pm.canonical_id
GROUP BY pm.canonical_id,m.kind,m.catalog_id
ON CONFLICT(profile_id,kind,catalog_id) DO UPDATE SET created_at=LEAST(my_list.created_at,EXCLUDED.created_at);

WITH profile_map AS (
  SELECT id,first_value(id) OVER (PARTITION BY account_id,lower(name) ORDER BY created_at,id) AS canonical_id
  FROM profiles
)
DELETE FROM profiles p USING profile_map pm
WHERE p.id=pm.id AND pm.id<>pm.canonical_id;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_name_unique ON profiles(account_id,lower(name));
CREATE INDEX IF NOT EXISTS profiles_account_created_idx ON profiles(account_id,created_at);
