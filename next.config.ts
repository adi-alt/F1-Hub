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

/**
 * A Content-Security-Policy in REPORT-ONLY mode (audit R-24): the browser reports what the policy would
 * have blocked, and blocks nothing, so the policy can be tightened from real reports instead of by guess.
 * Reports go to Sentry's security endpoint, built from the public DSN, when there is one. Enforce it
 * (rename the header to Content-Security-Policy) once the reports have been quiet for a while.
 *
 * 'unsafe-inline' for scripts is what Next.js needs without per-request nonces; moving to nonces is the
 * step after this one. Images allow any https host because a link preview's og:image can be anywhere.
 */
export function cspReportOnly(dsn: string | undefined): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.de.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com https://va.vercel-scripts.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  try {
    if (dsn) {
      const url = new URL(dsn);
      directives.push(`report-uri ${url.protocol}//${url.host}/api/${url.pathname.slice(1)}/security/?sentry_key=${url.username}`);
    }
  } catch {
    // A malformed DSN just means no report endpoint.
  }
  return directives.join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS, { key: "Content-Security-Policy-Report-Only", value: cspReportOnly(process.env.NEXT_PUBLIC_SENTRY_DSN) }],
      },
    ];
  },
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: "https", hostname: supabaseHostname, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
