-- Migration: Add ai_cache table for server-side caching of AI intelligence bundles
-- Service-role only (no public RLS policy), browser never queries this directly.

CREATE TABLE IF NOT EXISTS ai_cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  data_version text NOT NULL,
  model_identifier text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_cache_expires_idx ON ai_cache (expires_at);

ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
