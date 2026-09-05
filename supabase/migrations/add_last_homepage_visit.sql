-- Migration: Add last_homepage_visit_at to profiles
-- Tracks user's previous visit to power "Since Last Visit" delta calculations.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_homepage_visit_at timestamptz;
