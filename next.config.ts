import type { NextConfig } from "next";

// Every driver headshot/team logo/circuit photo/group avatar this app renders now lives in one
// Supabase Storage bucket (see supabase/schema.sql's `media`/`group-avatars` buckets) - one
// remotePatterns entry covers all of them, rather than allow-listing F1's media CDN and
// Wikipedia's separately, since the pipeline re-hosts everything into Storage instead of
// hotlinking (see pipeline/ergast_utils.py's fetch_and_upload_media). Derived from the same env
// var the app's own Supabase clients already use, not hardcoded, so this doesn't silently point
// at the wrong project if that ever changes.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

/** Sent with every response (audit SEC-23, OPS-09). Vercel already adds Strict-Transport-Security
 * (max-age=63072000) on its own. A full Content-Security-Policy isn't here yet: it needs a
 * report-only period with somewhere to send the reports, so this one only says who may frame the
 * site (nobody: the sign-in flow uses a popup window, never an iframe). */
export const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" }, // the same, for browsers that predate frame-ancestors
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Features nothing here uses. Clipboard isn't listed: sharing and export copy to it.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: "https", hostname: supabaseHostname, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
