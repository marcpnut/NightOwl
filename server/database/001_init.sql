CREATE TABLE IF NOT EXISTS provider_config (
  id text PRIMARY KEY,
  base_url text NOT NULL,
  playback_base_url text,
  allowed_live_formats jsonb NOT NULL DEFAULT '[]'::jsonb,
  username_cipher text NOT NULL,
  password_cipher text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE provider_config ADD COLUMN IF NOT EXISTS playback_base_url text;
ALTER TABLE provider_config ADD COLUMN IF NOT EXISTS allowed_live_formats jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS categories (
  kind text NOT NULL CHECK (kind IN ('live','movie','series')),
  id text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind,id)
);

CREATE TABLE IF NOT EXISTS catalog (
  kind text NOT NULL CHECK (kind IN ('live','movie','series','episode')),
  id text NOT NULL,
  parent_id text,
  season_number integer,
  episode_number integer,
  category_id text,
  title text NOT NULL,
  description text,
  poster_url text,
  backdrop_url text,
  genre text,
  release_year integer,
  duration_seconds integer,
  rating numeric(4,2),
  added_at timestamptz,
  stream_extension text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  detail_synced_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind,id)
);
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS detail_synced_at timestamptz;
CREATE INDEX IF NOT EXISTS catalog_kind_active_added_idx ON catalog(kind,active,added_at DESC,id);
CREATE INDEX IF NOT EXISTS catalog_parent_idx ON catalog(parent_id,season_number,episode_number) WHERE kind='episode';
CREATE INDEX IF NOT EXISTS catalog_series_detail_idx ON catalog(detail_synced_at,id) WHERE kind='series' AND active;
CREATE INDEX IF NOT EXISTS catalog_category_idx ON catalog(kind,category_id) WHERE active;
CREATE INDEX IF NOT EXISTS catalog_search_idx ON catalog USING gin (to_tsvector('simple', title || ' ' || coalesce(description,'')));

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_device_idx ON profiles(device_id);
CREATE TABLE IF NOT EXISTS my_list (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('movie','series')),
  catalog_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id,kind,catalog_id)
);
CREATE TABLE IF NOT EXISTS watch_progress (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('movie','episode','live')),
  catalog_id text NOT NULL,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  duration_seconds integer CHECK (duration_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id,kind,catalog_id)
);
CREATE INDEX IF NOT EXISTS watch_progress_recent_idx ON watch_progress(profile_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  dataset text PRIMARY KEY,
  status text NOT NULL DEFAULT 'never',
  cursor text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  row_count integer NOT NULL DEFAULT 0
);
