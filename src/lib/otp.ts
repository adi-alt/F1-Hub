import nodemailer from "nodemailer";
import { adminDb } from "@/lib/firebase/admin";

const COLLECTION = "otp_codes";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes to enter the code
const VERIFIED_TTL_MS = 10 * 60 * 1000; // then 10 more minutes for complete-signup to use it
const RESEND_COOLDOWN_MS = 30 * 1000;
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

/** Generates a fresh 6-digit code, stores it, and emails it — rate-limited to one send per
 * email per 30s so a misbehaving client (or someone poking at the endpoint) can't turn this
 * into a spam cannon. Returns "cooldown" instead of sending if called too soon after the last one. */
export async function sendOtp(email: string): Promise<"sent" | "cooldown"> {
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

  await getTransporter().sendMail({
    from: `"F1 Hub" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${code} is your F1 Hub verification code`,
    text: `Your F1 Hub verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your F1 Hub verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  });

  return "sent";
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
