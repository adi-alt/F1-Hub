import { escapeHtml, singleLine, trustedOrigin } from "@/lib/html";

/**
 * Every email the site sends, in one design: the page's own red-to-blue light on carbon behind a glass card with the
 * red top bar, the brand, a chip naming what it's about (a community, a race), then a label, a title, what happened,
 * an optional detail block and one button named for the action, and a footer saying why it came and how to stop it.
 *
 * Table-based with inline styles and bgcolor fallbacks, so Gmail, Outlook and Apple Mail draw it alike; it declares
 * itself dark so mail apps in dark mode don't invert it. Returns the plain-text twin too: mail with only HTML scores
 * worse with spam filters.
 */

export type EmailContent = {
  subject: string;
  /** The line inboxes show after the subject. */
  preheader: string;
  /** What it's about: a community (with its picture) or a race. */
  context?: { label: string; imageUrl?: string | null };
  eyebrow?: string;
  title: string;
  text?: string;
  /** A person: who asked, who replied, who invited. */
  who?: { name: string; sub?: string; imageUrl?: string | null };
  /** A headline figure, such as points won. */
  big?: { value: string; unit?: string };
  /** A one-time code, set large and monospaced. */
  code?: string;
  /** Someone's own words: a reply, a join-request message. */
  quote?: string;
  rows?: { label: string; value: string }[];
  warning?: string;
  /** A path on the site ("/?section=...") or a full URL. */
  cta?: { label: string; href: string };
  /** Why this person got it, in one line. */
  reason: string;
  /** One click to stop this kind of email (also sent as the List-Unsubscribe header). */
  unsubscribeUrl?: string;
  /** Show the link to all email settings. */
  settingsLink?: boolean;
};

export type RenderedEmail = { subject: string; html: string; text: string; headers: Record<string, string> };

/** Where links in emails point: APP_BASE_URL, else the site's own address (www: the bare domain redirects). */
export function emailOrigin(): string {
  return trustedOrigin("https://www.apexf1hub.com");
}

export const SETTINGS_PATH = "/?section=profile&tab=notifications";

const absolute = (href: string) => (/^https?:\/\//.test(href) ? href : `${emailOrigin()}${href}`);

// The page's glow (globals.css --page-glow) flattened onto carbon: email clients can't blend transparent layers.
const GLOW =
  "linear-gradient(118deg,#09090b 6%,#27140f 22%,#0d111a 35%,#09090b 47%,#09090b 54%,#180f0d 67%,#101824 80%,#09090b 92%)";
const CARD = "linear-gradient(135deg,#26262c,#18181c)";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function avatar(name: string, imageUrl: string | null | undefined, size: number, round: boolean): string {
  const radius = round ? "50%" : "6px";
  if (imageUrl && /^https:\/\//.test(imageUrl)) {
    return `<img src="${escapeHtml(imageUrl)}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border-radius:${radius};object-fit:cover;border:0;">`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="#3a3a42" style="width:${size}px;height:${size}px;border-radius:${radius};background:#3a3a42;color:#f2f2f3;font:700 ${Math.round(size * 0.38)}px ${FONT};">${escapeHtml(initials(name))}</td></tr></table>`;
}

const row = (cells: string) => `<tr><td style="padding:0 28px;">${cells}</td></tr>`;

export function renderEmail(c: EmailContent): RenderedEmail {
  const e = escapeHtml;
  const blocks: string[] = [];

  if (c.who) {
    blocks.push(
      row(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>
<td valign="middle">${avatar(c.who.name, c.who.imageUrl, 40, true)}</td>
<td valign="middle" style="padding-left:12px;font-family:${FONT};"><div style="font-size:15px;font-weight:600;color:#f2f2f3;">${e(c.who.name)}</div>${c.who.sub ? `<div style="font-size:13px;color:#9a9aa2;margin-top:2px;">${e(c.who.sub)}</div>` : ""}</td>
</tr></table>`),
    );
  }
  blocks.push(row(`<div style="font:700 22px/1.3 ${FONT};color:#f2f2f3;margin-top:${c.who ? 18 : 8}px;">${e(c.title)}</div>`));
  if (c.big) {
    blocks.push(
      row(`<div style="font:800 40px/1.1 ${FONT};color:#f2f2f3;margin-top:10px;">${e(c.big.value)}${c.big.unit ? `<span style="font-size:15px;font-weight:600;color:#4ccb84;margin-left:8px;">${e(c.big.unit)}</span>` : ""}</div>`),
    );
  }
  if (c.text) blocks.push(row(`<div style="font:15px/1.6 ${FONT};color:#b4b4bb;margin-top:10px;">${e(c.text)}</div>`));
  if (c.code) {
    blocks.push(
      row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr><td align="center" bgcolor="#0f0f12" style="background:#0f0f12;border:1px solid #2c2c31;border-radius:10px;padding:20px 0;font:700 34px/1 'Courier New',monospace;letter-spacing:10px;color:#f2f2f3;">${e(c.code)}</td></tr></table>`),
    );
  }
  if (c.quote || c.rows?.length) {
    const quote = c.quote
      ? `<div style="border-left:3px solid #3a3a42;padding:2px 0 2px 12px;font:15px/1.55 ${FONT};color:#d6d6db;">${e(c.quote)}</div>`
      : "";
    const rows = (c.rows ?? [])
      .map(
        (r, i) =>
          `<tr><td style="padding:7px 0;font:14px ${FONT};color:#9a9aa2;${i ? "border-top:1px solid #26262b;" : ""}">${e(r.label)}</td><td align="right" style="padding:7px 0 7px 12px;font:600 14px ${FONT};color:#f2f2f3;${i ? "border-top:1px solid #26262b;" : ""}">${e(r.value)}</td></tr>`,
      )
      .join("");
    blocks.push(
      row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr><td bgcolor="#111114" style="background:#111114;border:1px solid #2c2c31;border-radius:10px;padding:12px 16px;">${quote}${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"${quote ? ' style="margin-top:10px;"' : ""}>${rows}</table>` : ""}</td></tr></table>`),
    );
  }
  if (c.warning) {
    blocks.push(
      row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr><td style="background:#2a1212;border:1px solid #5c1f1c;border-radius:8px;padding:10px 12px;font:12px/1.5 ${FONT};color:#f2b8b5;">${e(c.warning)}</td></tr></table>`),
    );
  }
  if (c.cta) {
    blocks.push(
      row(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr><td bgcolor="#e10600" style="background:#e10600;border-radius:8px;"><a href="${e(absolute(c.cta.href))}" style="display:inline-block;padding:12px 20px;font:600 15px ${FONT};color:#ffffff;text-decoration:none;">${e(c.cta.label)}</a></td></tr></table>`),
    );
  }

  const footerLinks = [
    c.unsubscribeUrl ? `<a href="${e(c.unsubscribeUrl)}" style="color:#9a9aa2;">Stop emails like this</a>` : "",
    c.settingsLink ? `<a href="${e(absolute(SETTINGS_PATH))}" style="color:#9a9aa2;">All email settings</a>` : "",
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const context = c.context
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle">${avatar(c.context.label, c.context.imageUrl, 22, false)}</td><td valign="middle" style="padding-left:8px;font:12px ${FONT};color:#9a9aa2;">${e(singleLine(c.context.label, 40))}</td></tr></table>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${e(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#09090b;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(c.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#09090b" style="background-color:#09090b;background-image:${GLOW};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" bgcolor="#1c1c21" style="width:100%;max-width:520px;background-color:#1c1c21;background-image:${CARD};border:1px solid #2c2c31;border-radius:16px;overflow:hidden;">
<tr><td height="4" bgcolor="#e10600" style="height:4px;background:#e10600;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:22px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="5" height="16" bgcolor="#e10600" style="width:5px;height:16px;background:#e10600;border-radius:3px;font-size:0;">&nbsp;</td><td style="padding-left:9px;font:700 15px ${FONT};color:#f2f2f3;letter-spacing:0.02em;">Apex F1 Hub</td></tr></table></td>
<td align="right" valign="middle">${context}</td>
</tr></table></td></tr>
${c.eyebrow ? row(`<div style="font:700 11px ${FONT};letter-spacing:0.14em;text-transform:uppercase;color:#9a9aa2;margin-top:22px;">${e(c.eyebrow)}</div>`) : row('<div style="height:14px;"></div>')}
${blocks.join("\n")}
<tr><td style="padding:28px 0 0;"></td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #2c2c31;font:12px/1.6 ${FONT};color:#77767e;">${e(c.reason)}${footerLinks ? `<br>${footerLinks}` : ""}</td></tr>
</table>
<div style="font:11px ${FONT};color:#55545b;margin-top:16px;">&copy; ${new Date().getFullYear()} Apex F1 Hub</div>
</td></tr></table>
</body></html>`;

  const text = [
    c.context?.label,
    c.eyebrow?.toUpperCase(),
    c.title,
    c.who ? `${c.who.name}${c.who.sub ? ` (${c.who.sub})` : ""}` : null,
    c.big ? `${c.big.value}${c.big.unit ? ` ${c.big.unit}` : ""}` : null,
    c.text,
    c.code ? `Code: ${c.code}` : null,
    c.quote ? `"${c.quote}"` : null,
    ...(c.rows ?? []).map((r) => `${r.label}: ${r.value}`),
    c.warning,
    c.cta ? `${c.cta.label}: ${absolute(c.cta.href)}` : null,
    "--",
    c.reason,
    c.unsubscribeUrl ? `Stop emails like this: ${c.unsubscribeUrl}` : null,
    c.settingsLink ? `All email settings: ${absolute(SETTINGS_PATH)}` : null,
  ]
    .filter((l): l is string => !!l)
    .join("\n\n");

  const headers: Record<string, string> = c.unsubscribeUrl
    ? { "List-Unsubscribe": `<${c.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : {};
  return { subject: singleLine(c.subject, 120), html, text, headers };
}
