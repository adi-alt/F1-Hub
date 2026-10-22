import { createHmac, randomInt } from "node:crypto";
import { renderEmail } from "@/lib/email/layout";
import { setDefaultResultOrder } from "dns";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Some networks route Gmail's SMTP endpoint over a broken IPv6 path (seen locally as
// ESOCKET/EHOSTUNREACH) - nodemailer/smtp-connection has no per-transport option for this, DNS
// resolution order is process-wide. Preferring IPv4 first is the standard fix and is harmless
// wherever IPv6 already works fine.
setDefaultResultOrder("ipv4first");

// Every rule - expiry (10 min), single use, 5 guesses per code, 60 s resend cooldown, at most 5 codes
// and 10 failed guesses per email per hour, the 10-minute complete-signup window - is enforced by the
// database, atomically, under a row lock (supabase/migrations/20261001_otp_hardening.sql). This module
// generates the code, hashes it, sends it, and never stores or logs it in the clear.
const VERIFIED_TTL_MS = 10 * 60 * 1000; // mirrors otp_consume_verification; used only for the early read-only check

type OtpVerificationRow = { verified: boolean; verified_at: string | null; verification_consumed_at: string | null };

// No id-format constraint here the way Firestore doc ids had (email is just a text primary key
// column now) — normalizing to lowercase still matters so "Foo@x.com" and "foo@x.com" hit the
// same row.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A 6-digit code from the OS CSPRNG, uniformly over 000000-999999. Exported for tests. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Keyed with a subkey of SESSION_SECRET (server-only, already required): the database holds only
// this HMAC, so a leaked otp_codes row - or a read of the table - does not reveal a usable code, and
// the 10^6 code space cannot be brute-forced offline without the key. The email is part of the MAC
// so one code's hash is useless for any other address. Fails closed without a secret.
function otpKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET (32+ chars) is required to hash OTP codes.");
  return createHmac("sha256", secret).update("apex-otp-v1").digest();
}
/** Exported for tests. */
export function hashOtpCode(email: string, code: string): string {
  return createHmac("sha256", otpKey()).update(`${normalizeEmail(email)}:${code}`).digest("hex");
}

/** "j***@example.com" - enough to correlate a delivery log line with a support request, not enough
 * to harvest addresses from logs. Exported for tests. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

// Table-based layout with inline styles throughout - the only markup that survives Gmail/
// Outlook's habit of stripping <style> blocks and ignoring flex/grid in HTML email.
/** The sign-in code email, in the shared design (lib/email/layout). */
function buildOtpEmail(code: string, email: string) {
  return renderEmail({
    subject: `${code} is your Apex F1 Hub code`,
    preheader: "Expires in 10 minutes. Never share it.",
    context: { label: "Sign-in" },
    eyebrow: "Verification",
    title: "Your sign-in code",
    text: `For ${email}. It expires in 10 minutes.`,
    code,
    warning: "Never share this code with anyone, not even someone claiming to be Apex F1 Hub support. We will never ask you for it.",
    reason: "Didn't try to sign in? Ignore this email; nothing changes without the code.",
  });
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
// Exported - groups.ts's inviteByEmail reuses this same SMTP setup for group-invite emails
// rather than duplicating the host/port/auth wiring for a second transactional email type.
//
// Resend's own SMTP relay (smtp.resend.com), not raw Gmail SMTP anymore - a personal Gmail
// account had no verified sending domain, so it landed in spam for most providers and was
// blocked outright by corporate mail gateways with zero trace (confirmed in production). Now
// that apexf1hub.com is a real domain verified in Resend with SPF/DKIM/DMARC, deliverability is
// actually solved instead of just logged-and-shrugged-at. SMTP_USER is literally the string
// "resend" (Resend's own convention) - the real identity is MAIL_FROM, which must be an address
// on the verified domain, not a raw account username the way SMTP_USER was for Gmail.
export function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST / SMTP_USER / SMTP_PASS are not set — required to send OTP emails (see .env.local).");
  }
  if (!process.env.MAIL_FROM) {
    throw new Error("MAIL_FROM is not set — required as the verified-domain sender address (see .env.local).");
  }
  transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
}

export type PrepareOtpResult =
  | { status: "issued"; code: string }
  /** A code was sent under a minute ago - the user can still use that one. */
  | { status: "cooldown"; retryAfterSeconds: number }
  /** Too many codes or failed guesses for this email in the past hour. */
  | { status: "throttled"; retryAfterSeconds: number };

/** Generates a fresh 6-digit code and registers its hash (otp_issue decides cooldown/throttling
 * atomically - two simultaneous requests cannot both get a code). Deliberately split from the actual
 * email send (see deliverOtp) — the SMTP round trip is the slow part (a second or more), and there's
 * no reason the client should sit on the sign-in dialog waiting for it. The plaintext code exists
 * only in this return value and the email. */
export async function prepareOtp(email: string): Promise<PrepareOtpResult> {
  const code = generateOtpCode();
  const { data, error } = await supabaseAdmin.rpc("otp_issue", { p_email: normalizeEmail(email), p_code_hash: hashOtpCode(email, code) });
  if (error) throw new Error(`prepareOtp: ${error.message}`);
  const result = data as { status: string; retry_after_seconds?: number };
  if (result.status === "issued") return { status: "issued", code };
  if (result.status === "cooldown" || result.status === "throttled") return { status: result.status, retryAfterSeconds: result.retry_after_seconds ?? 60 };
  throw new Error(`prepareOtp: unexpected status ${String(result.status)}`);
}

/** The slow part — meant to be called via next/server's after() so it runs once the response
 * has already gone out, not awaited in the request's critical path. Every caller fires this via
 * `after()` with no .catch of its own, so a delivery failure here needs to actually be logged —
 * otherwise a bad send (auth failure, Gmail throttling, a rejected recipient) is completely
 * invisible: the sign-in screen already showed the OTP step, nothing ever surfaces the error to
 * the user or to anyone watching logs. */
export async function deliverOtp(email: string, code: string): Promise<void> {
  try {
    const info = await getTransporter().sendMail({
      from: `"Apex F1 Hub" <${process.env.MAIL_FROM}>`,
      to: email,
      ...buildOtpEmail(code, email),
    });
    // Counts, not addresses: info.accepted/rejected ARE the recipient address, and the SMTP
    // response line can echo it back. The code itself is never logged.
    console.log(`[otp] sent to ${maskEmail(email)} — accepted:${info.accepted.length} rejected:${info.rejected.length}`);
  } catch (err) {
    // The error's own message/code only - a transport error object can carry the envelope.
    const e = err as { code?: string; responseCode?: number; message?: string };
    const scrubbed = (e.message ?? "").replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), maskEmail(email));
    console.error(`[otp] FAILED to send to ${maskEmail(email)}: ${e.code ?? "error"} ${e.responseCode ?? ""} ${scrubbed}`);
  }
}

export type VerifyOtpResult = "ok" | "expired" | "wrong" | "used" | "too-many";

const OTP_SHAPE = /^[0-9]{6}$/;

/** One attempt per call, counted atomically by otp_verify (a fixed code that never locks out after
 * wrong guesses is just a 6-digit password with extra steps). A malformed code is rejected here
 * without touching the database - it can never be right, and it is not worth a round trip - but it
 * still counts as a wrong guess, so malformed input cannot be used to probe for free. */
export async function verifyOtp(email: string, code: string): Promise<VerifyOtpResult> {
  const candidate = OTP_SHAPE.test(code.trim()) ? code.trim() : "invalid";
  const { data, error } = await supabaseAdmin.rpc("otp_verify", { p_email: normalizeEmail(email), p_code_hash: hashOtpCode(email, candidate) });
  if (error) throw new Error(`verifyOtp: ${error.message}`);
  const result = data as string;
  if (result === "ok" || result === "expired" || result === "wrong" || result === "used" || result === "too-many") return result;
  throw new Error(`verifyOtp: unexpected result ${String(result)}`);
}

/** Early, read-only check so complete-signup can refuse a request that skipped the code before doing
 * any other work. NOT the gate - consumeOtpVerification is. */
export async function isOtpVerified(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("otp_codes").select("verified, verified_at, verification_consumed_at").eq("email", normalizeEmail(email)).maybeSingle();
  const row = data as OtpVerificationRow | null;
  if (!row || !row.verified || !row.verified_at || row.verification_consumed_at) return false;
  return Date.now() - new Date(row.verified_at).getTime() < VERIFIED_TTL_MS;
}

/** Spends a recent verification exactly once (otp_consume_verification): of two simultaneous
 * complete-signup calls, one gets true. The row is kept, not deleted - deleting it would reset the
 * hourly limits. */
export async function consumeOtpVerification(email: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("otp_consume_verification", { p_email: normalizeEmail(email) });
  if (error) throw new Error(`consumeOtpVerification: ${error.message}`);
  return data === true;
}
