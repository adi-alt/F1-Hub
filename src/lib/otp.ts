import { setDefaultResultOrder } from "dns";
import nodemailer from "nodemailer";
import { adminDb } from "@/lib/firebase/admin";

// Some networks route Gmail's SMTP endpoint over a broken IPv6 path (seen locally as
// ESOCKET/EHOSTUNREACH) - nodemailer/smtp-connection has no per-transport option for this, DNS
// resolution order is process-wide. Preferring IPv4 first is the standard fix and is harmless
// wherever IPv6 already works fine.
setDefaultResultOrder("ipv4first");

const COLLECTION = "otp_codes";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes to enter the code
const VERIFIED_TTL_MS = 10 * 60 * 1000; // then 10 more minutes for complete-signup to use it
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type OtpDoc = {
  code: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
  verified: boolean;
  verifiedAt?: number;
};

function docRef(email: string) {
  // Firestore doc IDs can't contain "/" — email addresses never do, but this is the one
  // character that would break it, so normalize defensively rather than assume.
  return adminDb.collection(COLLECTION).doc(email.toLowerCase().replace(/\//g, "_"));
}

// Table-based layout with inline styles throughout - the only markup that survives Gmail/
// Outlook's habit of stripping <style> blocks and ignoring flex/grid in HTML email.
function buildOtpEmailHtml(code: string, email: string): string {
  const year = new Date().getFullYear();
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0c;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#17171a;border:1px solid #2c2c31;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background-color:#e10600;height:5px;font-size:0;line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td style="padding:32px 32px 0 32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:6px;height:20px;background-color:#e10600;border-radius:3px;"></td>
            <td style="padding-left:10px;font-size:18px;font-weight:700;color:#f2f2f3;letter-spacing:0.5px;">F1 HUB</td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 6px 32px;font-size:22px;font-weight:700;color:#f2f2f3;">
          Verify it&rsquo;s you
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 26px 32px;font-size:14px;line-height:1.6;color:#9a9aa2;">
          Someone (hopefully you) is signing in to F1 Hub as <span style="color:#f2f2f3;">${email}</span>. Enter this code to continue &mdash; it expires in 10 minutes.
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 20px 32px;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background-color:#0a0a0c;border:1px solid #2c2c31;border-radius:10px;">
            <tr><td align="center" style="padding:22px 0;font-size:34px;font-weight:700;letter-spacing:10px;color:#f2f2f3;font-family:'Courier New',monospace;">
              ${code}
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 28px 32px;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background-color:rgba(225,6,0,0.08);border:1px solid rgba(225,6,0,0.35);border-radius:8px;">
            <tr><td style="padding:12px 14px;font-size:12px;line-height:1.5;color:#f2b8b5;">
              &#9888; Never share this code with anyone &mdash; not even someone claiming to be F1 Hub support. We will never ask you for it.
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 24px 32px;font-size:12px;line-height:1.6;color:#63636c;border-top:1px solid #2c2c31;padding-top:20px;">
          Didn&rsquo;t request this? You can safely ignore this email &mdash; no account changes were made.
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 28px 32px;font-size:11px;color:#45454c;">
          &copy; ${year} F1 Hub. All rights reserved.
        </td>
      </tr>
    </table>
  </td></tr>
</table>`.trim();
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST / SMTP_USER / SMTP_PASS are not set — required to send OTP emails (see .env.local).");
  }
  transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
}

/** Generates a fresh 6-digit code and stores it — rate-limited to one per email per 30s so a
 * misbehaving client (or someone poking at the endpoint) can't turn this into a spam cannon.
 * Returns "cooldown" instead of a code if called too soon after the last one. Deliberately split
 * from the actual email send (see deliverOtp) — the SMTP round trip is the slow part (a second
 * or more), and there's no reason the client should sit on the sign-in dialog waiting for it when
 * all it actually needs to move on is the code existing in Firestore. */
export async function prepareOtp(email: string): Promise<{ code: string } | "cooldown"> {
  const ref = docRef(email);
  const existing = await ref.get();
  const now = Date.now();
  if (existing.exists) {
    const data = existing.data() as OtpDoc;
    if (now - data.sentAt < RESEND_COOLDOWN_MS) return "cooldown";
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const doc: OtpDoc = { code, expiresAt: now + CODE_TTL_MS, sentAt: now, attempts: 0, verified: false };
  await ref.set(doc);
  return { code };
}

/** The slow part — meant to be called via next/server's after() so it runs once the response
 * has already gone out, not awaited in the request's critical path. */
export async function deliverOtp(email: string, code: string): Promise<void> {
  await getTransporter().sendMail({
    from: `"F1 Hub" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${code} is your F1 Hub verification code`,
    text: `Your F1 Hub verification code is ${code}. It expires in 10 minutes. Never share it with anyone.`,
    html: buildOtpEmailHtml(code, email),
  });
}

/** One attempt per call, counted against MAX_ATTEMPTS regardless of outcome — a fixed code that
 * never locks out after wrong guesses is just a 6-digit password with extra steps. */
export async function verifyOtp(email: string, code: string): Promise<"ok" | "expired" | "wrong" | "too-many"> {
  const ref = docRef(email);
  const snap = await ref.get();
  if (!snap.exists) return "expired";
  const data = snap.data() as OtpDoc;

  if (data.attempts >= MAX_ATTEMPTS) return "too-many";
  if (Date.now() > data.expiresAt) return "expired";

  if (data.code !== code) {
    await ref.update({ attempts: data.attempts + 1 });
    return "wrong";
  }

  await ref.update({ verified: true, verifiedAt: Date.now() });
  return "ok";
}

/** complete-signup checks this rather than trusting the client's word that OTP passed - the
 * verified flag has its own short-lived window so a stale verification from an hour ago can't
 * be replayed to skip the step entirely. */
export async function isOtpVerified(email: string): Promise<boolean> {
  const snap = await docRef(email).get();
  if (!snap.exists) return false;
  const data = snap.data() as OtpDoc;
  return !!data.verified && !!data.verifiedAt && Date.now() - data.verifiedAt < VERIFIED_TTL_MS;
}

export async function clearOtp(email: string): Promise<void> {
  await docRef(email).delete();
}
