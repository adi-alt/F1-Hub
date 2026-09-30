/** Escapes text for interpolation into an HTML email body or attribute. Every email template in
 * this app interpolates user-controlled strings (community names, display names, the recipient's
 * address) - unescaped, a community named `<a href=evil>…` becomes a phishing link sent from the
 * app's own verified domain (audit SEC-11). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Collapses control characters (notably CR/LF) so a user-controlled name can't inject headers into
 * an email subject line, and caps its length. */
export function singleLine(value: string, max = 80): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

/** The origin to put in links inside emails. Prefers APP_BASE_URL (a fixed, operator-controlled
 * value) over the origin of the incoming request, which is whatever Host header the request
 * carried. Falls back to the request origin so existing deployments keep working unconfigured. */
export function trustedOrigin(requestOrigin: string): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // fall through to the request origin
    }
  }
  return requestOrigin;
}
