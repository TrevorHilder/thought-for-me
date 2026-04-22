-- ============================================================
-- A Thought for Me — Supabase Database Migration
-- Run this in your Supabase SQL Editor (or via supabase CLI)
-- ============================================================

-- NOTE: The `users` table is managed entirely by Supabase Auth.
-- The tables below extend it with application data.

-- ── Enable UUID extension ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Deliveries ─────────────────────────────────────────────────────────────
-- Records every passage delivered to each user.
-- passage_id references passages.json (bundled with app) — no FK needed.

CREATE TABLE IF NOT EXISTS deliveries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  passage_id    TEXT        NOT NULL,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at       TIMESTAMPTZ,
  is_favourite  BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_deliveries_user_id       ON deliveries(user_id);
CREATE INDEX idx_deliveries_delivered_at  ON deliveries(user_id, delivered_at DESC);
CREATE UNIQUE INDEX idx_deliveries_user_passage ON deliveries(user_id, passage_id);

-- ── User Preferences ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID    NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_time        TEXT    NOT NULL DEFAULT '08:00',   -- "HH:MM" in user's timezone
  timezone              TEXT    NOT NULL DEFAULT 'Europe/London',
  email_notifications   BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Users can only see and modify their own data.

ALTER TABLE deliveries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Deliveries policies
CREATE POLICY "Users can read own deliveries"
  ON deliveries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deliveries"
  ON deliveries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deliveries"
  ON deliveries FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypass (for cron job inserts on behalf of users)
CREATE POLICY "Service role can manage all deliveries"
  ON deliveries
  USING (auth.role() = 'service_role');

-- User preferences policies
CREATE POLICY "Users can read own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own preferences"
  ON user_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all preferences"
  ON user_preferences
  USING (auth.role() = 'service_role');

-- ── Helper view: users due for delivery ─────────────────────────────────────
-- The cron job queries this to find who needs a delivery this hour.
CREATE OR REPLACE VIEW users_due_for_delivery AS
SELECT
  u.id          AS user_id,
  u.email       AS email,
  p.preferred_time,
  p.timezone,
  p.email_notifications,
  -- Has the user already received a delivery today (in their local time)?
  NOT EXISTS (
    SELECT 1 FROM deliveries d
    WHERE d.user_id = u.id
      AND (d.delivered_at AT TIME ZONE p.timezone)::date = (NOW() AT TIME ZONE p.timezone)::date
  ) AS needs_delivery,
  -- Is this the right hour for this user?
  EXTRACT(HOUR FROM (NOW() AT TIME ZONE p.timezone))::int =
    EXTRACT(HOUR FROM p.preferred_time::time)::int AS is_right_hour
FROM auth.users u
JOIN user_preferences p ON p.user_id = u.id
WHERE
  NOT EXISTS (
    SELECT 1 FROM deliveries d
    WHERE d.user_id = u.id
      AND (d.delivered_at AT TIME ZONE p.timezone)::date = (NOW() AT TIME ZONE p.timezone)::date
  )
  AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE p.timezone))::int =
      EXTRACT(HOUR FROM p.preferred_time::time)::int;

-- ============================================================
-- End of migration
-- ============================================================
