import type { NextConfig } from "next";

// Every driver headshot/team logo/circuit photo/group avatar this app renders now lives in one
// Supabase Storage bucket (see supabase/schema.sql's `media`/`group-avatars` buckets) - one
// remotePatterns entry covers all of them, rather than allow-listing F1's media CDN and
// Wikipedia's separately, since the pipeline re-hosts everything into Storage instead of
// hotlinking (see pipeline/ergast_utils.py's fetch_and_upload_media). Derived from the same env
// var the app's own Supabase clients already use, not hardcoded, so this doesn't silently point
// at the wrong project if that ever changes.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: "https", hostname: supabaseHostname, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
