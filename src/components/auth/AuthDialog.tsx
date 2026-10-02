"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select, TextInput } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCountdown } from "@/hooks/useCountdown";
import { useSignupOptions } from "@/queries/useSignupOptions";
import { useUsernameAvailability } from "@/queries/useUsernameAvailability";
import type { Role } from "@/lib/rbac";

type Step = "method" | "otp" | "profile";
type OAuthProvider = "google" | "github" | "discord" | "gitlab";

// Matches the backend's own resend cooldown (otp_issue, 20261001_otp_hardening.sql) so the button's countdown never
// disagrees with what the server would actually accept.
const RESEND_COOLDOWN_MS = 60_000;

// Alert announces itself: danger as role="alert", info as role="status".
function Messages({ info, error }: { info?: string | null; error: string | null }) {
  return (
    <>
      {info && <Alert tone="info">{info}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
    </>
  );
}

// A lightweight 2D illustration, not another WebGL canvas - a modal that opens and closes
// repeatedly is exactly the wrong place to re-init a GLTF-loading r3f scene on every open. It is the
// Dialog's aside: shown from md up only, and hidden from assistive tech.
function FormulaScene() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[var(--f1-carbon)] via-black to-[var(--f1-carbon-2)] p-8">
      <svg viewBox="0 0 300 500" className="pointer-events-none absolute inset-0 h-full w-full opacity-70" aria-hidden>
        <path
          d="M -20 40 C 80 20, 140 90, 120 160 C 100 230, 20 240, 40 310 C 60 380, 180 360, 220 430 C 250 480, 300 470, 320 500"
          fill="none"
          stroke="#33333a"
          strokeWidth="26"
          strokeLinecap="round"
        />
        <path
          d="M -20 40 C 80 20, 140 90, 120 160 C 100 230, 20 240, 40 310 C 60 380, 180 360, 220 430 C 250 480, 300 470, 320 500"
          fill="none"
          stroke="#f2f2f3"
          strokeWidth="2"
          strokeDasharray="10 10"
          strokeLinecap="round"
          opacity={0.5}
        />
      </svg>
      <div className="relative z-10 flex items-center gap-2 text-lg font-bold tracking-tight text-white">
        <span className="inline-block h-5 w-1.5 rounded-full bg-[var(--f1-red)]" />
        F1 HUB
      </div>
      <div className="relative z-10">
        <p className="text-2xl font-bold leading-tight text-white">
          Every race.
          <br />
          Every prediction.
        </p>
        <p className="mt-2 text-sm text-neutral-400">Predictions, a race simulator, and a full archive back to 1950.</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.46H12v4.66h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.83Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11C3.24 21.3 7.29 24 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.29V6.6H1.26A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.26 5.4l4.01-3.11Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0 7.29 0 3.24 2.7 1.26 6.6l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.79-.25.79-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .3.21.66.79.55A10.51 10.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#5865F2"
        d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.2 13.2 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.246.195.373.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.04.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.96 19.96 0 0 0 6.002-2.98.076.076 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028ZM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.078 2.157 2.38 0 1.312-.956 2.38-2.157 2.38Zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.078 2.157 2.38 0 1.312-.946 2.38-2.157 2.38Z"
      />
    </svg>
  );
}

function GitLabIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#FC6D26" d="M12 21 4 9h5l3-7 3 7h5l-8 12Z" />
    </svg>
  );
}

// Six single-digit boxes rather than one text field - types forward automatically, backspace on
// an empty box steps back, and pasting a full code anywhere fills all six at once. A labelled group,
// so a screen reader announces "6-digit code" on entering it and "Digit 1 of 6" on each box.
function OtpInput({
  value,
  onChange,
  firstInputRef,
  labelledBy,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  firstInputRef: RefObject<HTMLInputElement | null>;
  labelledBy: string;
  describedBy: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  function setDigit(i: number, raw: string) {
    const d = raw.replace(/\D/g, "").slice(-1);
    const next = digits.slice();
    next[i] = d;
    onChange(next.join(""));
    if (d && i < 5) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
            if (i === 0) firstInputRef.current = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          aria-label={`Digit ${i + 1} of 6`}
          value={d}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-12 w-10 rounded-control border border-strong bg-surface-2 text-center text-title-md text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        />
      ))}
    </div>
  );
}

// Fire-and-forget on purpose - the actual SMTP send is the slow part (a second or more, and
// /api/auth/start itself defers it via next/server's after() so the response comes back fast
// too), and nothing about showing the OTP screen should wait on either. If this particular call
// fails outright, the resend button is still there once its cooldown clears. No token to pass
// anymore — the Supabase session already lives in this request's cookies.
// Resolves to the server's message when it refused to send (the hourly limit), else null.
async function requestOtp(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/start", { method: "POST" });
    if (res.status !== 429) return null;
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error ?? "Too many codes requested. Try again later.";
  } catch {
    return null;
  }
}

// Split out so useCountdown's 1-second ticker only ever runs while the OTP step is actually
// mounted, not for the dialog's entire lifetime.
function OtpStep({
  verifiedEmail,
  code,
  setCode,
  resendAvailableAt,
  busy,
  info,
  error,
  firstInputRef,
  onSubmit,
  onResend,
}: {
  verifiedEmail: string;
  code: string;
  setCode: (v: string) => void;
  resendAvailableAt: number;
  busy: boolean;
  info: string | null;
  error: string | null;
  firstInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  onResend: () => void;
}) {
  const secondsUntilResend = useCountdown(resendAvailableAt);
  const id = useId();

  return (
    <form
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!busy && code.length === 6) onSubmit();
      }}
      className="space-y-4"
    >
      <p id={`${id}-sent`} className="flex flex-wrap items-center gap-1.5 text-body-sm text-secondary">
        {/* Empty only during the OAuth-redirect resume path, while the effect above is still
            fetching whose email this actually was (see AuthDialog's own comment on that fetch) -
            a skeleton in place of the email itself, not the generic sentence this used to fall
            back to, so it reads as "still loading" rather than as the final copy. */}
        <span>We sent a 6-digit code to</span>
        {verifiedEmail ? <span className="text-primary">{verifiedEmail}.</span> : <Skeleton className="h-4 w-36" />}
      </p>
      <p id={`${id}-label`} className="sr-only">
        6-digit code
      </p>
      <OtpInput value={code} onChange={setCode} firstInputRef={firstInputRef} labelledBy={`${id}-label`} describedBy={`${id}-sent`} />
      <p className="text-body-sm text-secondary">Don&apos;t see it? Check your spam folder as well.</p>
      <Button type="submit" variant="primary" size="md" className="w-full" disabled={code.length !== 6} loading={busy}>
        Verify
      </Button>
      <Button variant="ghost" size="md" className="w-full" disabled={secondsUntilResend > 0} onClick={onResend}>
        {secondsUntilResend > 0 ? `Resend code in ${secondsUntilResend}s` : "Resend code"}
      </Button>
      <Messages info={info} error={error} />
    </form>
  );
}

const STEP_TITLES: Record<Step, string> = {
  method: "Sign in or sign up",
  otp: "Check your email",
  profile: "Tell us a bit about you",
};

// The caller mounts this only while it should be open (`{open && <AuthDialog .../>}`) rather
// than always rendering it with an `open` prop — a fresh mount every time it opens is what gives
// it fresh state for free, no reset-on-open effect required. `resumeAtOtp` is the one exception:
// set when this mount is the OAuth-redirect round trip resuming (see AuthDialogHost.tsx) rather
// than a normal open, so it starts straight on the OTP step instead of "method".
export function AuthDialog({ onClose, resumeAtOtp = false }: { onClose: () => void; resumeAtOtp?: boolean }) {
  const { setRole, setDisplayName, setUser, refreshPointsBalance } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>(resumeAtOtp ? "otp" : "method");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState(0);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [favoriteDriver, setFavoriteDriver] = useState("");
  const [favoriteTeam, setFavoriteTeam] = useState("");
  const [favoriteTrack, setFavoriteTrack] = useState("");

  const { data: options } = useSignupOptions(step === "profile");
  const { status: usernameStatus, suggestions: usernameSuggestions } = useUsernameAvailability(username);

  // The first field of whichever step is showing. The Dialog focuses it on open (initialFocusRef,
  // after its trap has recorded the trigger to return to); the effect below moves focus to it when
  // the step changes, since the button that was focused is gone by then.
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    firstFieldRef.current?.focus();
  }, [step]);

  // /auth/callback already exchanged the OAuth code and sent the OTP by the time this mounts —
  // this just needs to find out *whose* email that was, since the callback redirect deliberately
  // doesn't put it in the URL. Re-POSTing /api/auth/start is safe (its own cooldown means no
  // second email goes out) and is also how the response carries the email back to us.
  useEffect(() => {
    if (!resumeAtOtp) return;
    fetch("/api/auth/start", { method: "POST" })
      .then((res) => res.json())
      .then((body: { email?: string }) => {
        setVerifiedEmail(body.email ?? "");
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      })
      .catch(() => {});
    // Only ever runs once, on the mount that resumed this way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function afterSignIn(signedInEmail: string) {
    setVerifiedEmail(signedInEmail);
    setStep("otp");
    setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
    void requestOtp().then((refused) => {
      if (refused) setError(refused);
    });
  }

  function handleResend() {
    setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
    setInfo("New code sent.");
    setError(null);
    void requestOtp().then((refused) => {
      if (!refused) return;
      setInfo(null);
      setError(refused);
    });
  }

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError("Enter your email above first.");
      return;
    }
    // Same message whether or not the account exists - not revealing which emails are
    // registered is the same email-enumeration protection Supabase's own defaults follow too.
    await supabase.auth
      .resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/reset-password` })
      .catch(() => {});
    setInfo("If an account exists for that email, a reset link is on its way.");
  }

  // Supabase has no popup flow the way Firebase's old signInWithPopup did (`skipBrowserRedirect`
  // just stops it from navigating the current tab itself - it still hands back a real redirect
  // URL, not a completed sign-in), so this opens that URL in a real popup window and drives the
  // round trip by hand: /auth/callback (?popup=1, appended below) does the same code exchange +
  // OTP dispatch it always did, then lands on /auth/popup-closed, which posts the result back via
  // postMessage and closes itself - the main tab never navigates or reloads at all. Falls back to
  // the previous same-tab redirect if the popup was blocked (a null return from window.open), so
  // this never leaves someone with a dead "nothing happened" button.
  function handleProvider(provider: OAuthProvider) {
    setBusy(true);
    setError(null);
    setInfo(null);
    void supabase.auth
      .signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?popup=1`, skipBrowserRedirect: true },
      })
      .then(({ data, error }) => {
        if (error || !data?.url) {
          setError("That sign-in method isn't set up yet.");
          setBusy(false);
          return;
        }

        const popup = window.open(data.url, "f1hub-oauth", "width=480,height=640");
        if (!popup) {
          // Blocked - same-tab redirect, exactly the old behavior (/auth/callback's own `popup`
          // param is simply absent this time, so it lands back on `/` the same way it always did).
          window.location.href = data.url;
          return;
        }

        let settled = false;
        function onMessage(e: MessageEvent) {
          if (e.origin !== window.location.origin || e.data?.source !== "f1hub-oauth") return;
          settled = true;
          window.removeEventListener("message", onMessage);
          clearInterval(poll);
          popup?.close();
          setBusy(false);
          if (e.data.step === "otp") {
            setVerifiedEmail(e.data.email ?? "");
            setStep("otp");
            setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
          } else {
            setError("Sign-in failed. Try again.");
          }
        }
        window.addEventListener("message", onMessage);

        // The popup closing without ever posting a message means the person closed it themselves
        // (or it errored before /auth/callback could run) - not a failure worth surfacing, just
        // back to the idle "method" step.
        const poll = setInterval(() => {
          if (!popup.closed) return;
          clearInterval(poll);
          window.removeEventListener("message", onMessage);
          if (!settled) setBusy(false);
        }, 400);
      });
  }

  async function handleEmailContinue() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        // Supabase's anti-enumeration behavior: signing up again against an email that already
        // has a confirmed account "succeeds" with an empty identities array instead of a clear
        // error the way Firebase's auth/email-already-in-use did - this is the only way to tell.
        if (data.user && data.user.identities?.length === 0) {
          throw new Error("That password doesn't match this email. Try again.");
        }
      }
      await afterSignIn(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOtpSubmit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json()) as {
        status?: "logged-in" | "needs-profile";
        role?: Role;
        displayName?: string | null;
        uid?: string;
        email?: string;
        photoURL?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Verification failed.");
        return;
      }
      if (body.status === "needs-profile") {
        setStep("profile");
      } else {
        setRole(body.role ?? "user");
        setDisplayName(body.displayName ?? null);
        if (body.uid) setUser({ uid: body.uid, email: body.email ?? null, photoURL: body.photoURL ?? null });
        refreshPointsBalance();
        // Every Server Component below the header reads the session cookie at request time —
        // without this, signed-in content stays stuck on the signed-out render until a hard
        // reload.
        router.refresh();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  const profileIncomplete = !firstName.trim() || !lastName.trim() || username.trim().length < 3 || usernameStatus === "taken";

  async function handleProfileSubmit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          username,
          // Signup only ever offers one pick each (a quick default, not the full multi-favorite
          // editor) — wrapped into arrays here since that's the shape the profile actually
          // stores. Add more later via Personalization or the archive's heart icons — all three
          // write into these same favoriteDrivers/Teams/Tracks arrays, never a separate copy.
          favoriteDrivers: favoriteDriver ? [favoriteDriver] : [],
          favoriteTeams: favoriteTeam ? [favoriteTeam] : [],
          favoriteTracks: favoriteTrack ? [favoriteTrack] : [],
        }),
      });
      const body = (await res.json()) as {
        status?: "logged-in";
        role?: Role;
        displayName?: string | null;
        uid?: string;
        email?: string;
        photoURL?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't create your account.");
        return;
      }
      setRole(body.role ?? "user");
      setDisplayName(body.displayName ?? null);
      if (body.uid) setUser({ uid: body.uid, email: body.email ?? null, photoURL: body.photoURL ?? null });
      refreshPointsBalance();
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  // The Dialog primitive supplies what this used to lack (audit UI-30, CR-24): role="dialog" named
  // by the step's title, focus moved in and trapped, Escape and the scrim close it, focus goes back
  // to whatever opened it, and the page behind stops scrolling. It is portalled to document.body,
  // which also keeps position:fixed safe from any ancestor that establishes a containing block.
  // The panel is opaque and capped at the viewport height with the body scrolling inside, so a
  // short phone no longer clips the form.
  return (
    <Dialog
      open
      onClose={onClose}
      title={STEP_TITLES[step]}
      description={step === "method" ? "One account either way. We'll figure out which." : undefined}
      size="sm"
      aside={<FormulaScene />}
      initialFocusRef={firstFieldRef}
    >
      {step === "method" && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && email && password.length >= 6) void handleEmailContinue();
          }}
          className="space-y-3"
        >
          <TextInput ref={firstFieldRef} label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextInput
            label="Password"
            type="password"
            autoComplete="current-password"
            hint="At least 6 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => void handleForgotPassword()}>
              Forgot password?
            </Button>
          </div>
          <Button type="submit" variant="primary" size="md" className="w-full" disabled={!email || password.length < 6} loading={busy}>
            Continue
          </Button>

          <div className="flex items-center gap-2 py-1 text-body-sm text-secondary">
            <div aria-hidden className="h-px flex-1 bg-strong" />
            or
            <div aria-hidden className="h-px flex-1 bg-strong" />
          </div>

          <Button variant="secondary" size="md" className="w-full" disabled={busy} onClick={() => handleProvider("google")}>
            <GoogleIcon />
            Continue with Google
          </Button>
          <Button variant="secondary" size="md" className="w-full" disabled={busy} onClick={() => handleProvider("github")}>
            <GitHubIcon />
            Continue with GitHub
          </Button>
          <Button variant="secondary" size="md" className="w-full" disabled={busy} onClick={() => handleProvider("discord")}>
            <DiscordIcon />
            Continue with Discord
          </Button>
          <Button variant="secondary" size="md" className="w-full" disabled={busy} onClick={() => handleProvider("gitlab")}>
            <GitLabIcon />
            Continue with GitLab
          </Button>
          <Messages info={info} error={error} />
        </form>
      )}

      {step === "otp" && (
        <OtpStep
          verifiedEmail={verifiedEmail}
          code={code}
          setCode={setCode}
          resendAvailableAt={resendAvailableAt}
          busy={busy}
          info={info}
          error={error}
          firstInputRef={firstFieldRef}
          onSubmit={() => void handleOtpSubmit()}
          onResend={handleResend}
        />
      )}

      {step === "profile" && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!profileIncomplete) void handleProfileSubmit();
          }}
          className="space-y-3"
        >
          <div className="flex gap-2">
            <TextInput ref={firstFieldRef} label="First name" autoComplete="given-name" className="min-w-0 flex-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <TextInput label="Last name" autoComplete="family-name" className="min-w-0 flex-1" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <TextInput
            label="Username"
            autoComplete="username"
            hint={usernameStatus === "available" ? "Available." : "At least 3 characters."}
            error={
              usernameStatus === "taken" ? (
                <>
                  Taken.
                  {usernameSuggestions.length > 0 && (
                    <>
                      {" "}
                      Try:{" "}
                      {usernameSuggestions.map((suggestion, i) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setUsername(suggestion)}
                          className="ml-1 rounded-control text-primary underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                          {suggestion}
                          {i < usernameSuggestions.length - 1 ? "," : ""}
                        </button>
                      ))}
                    </>
                  )}
                </>
              ) : undefined
            }
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          {options ? (
            <>
              <Select label="Favourite driver (optional)" value={favoriteDriver} onChange={(e) => setFavoriteDriver(e.target.value)}>
                <option value="">None</option>
                {options.drivers.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Select label="Favourite team (optional)" value={favoriteTeam} onChange={(e) => setFavoriteTeam(e.target.value)}>
                <option value="">None</option>
                {options.teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Select label="Favourite track (optional)" value={favoriteTrack} onChange={(e) => setFavoriteTrack(e.target.value)}>
                <option value="">None</option>
                {options.tracks.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </>
          ) : (
            <div className="space-y-3" role="status" aria-label="Loading the favourites lists">
              <Skeleton shape="block" className="h-16 w-full" />
              <Skeleton shape="block" className="h-16 w-full" />
              <Skeleton shape="block" className="h-16 w-full" />
            </div>
          )}

          <Button type="submit" variant="primary" size="md" className="w-full" disabled={profileIncomplete} loading={busy}>
            Create account
          </Button>
          <Messages error={error} />
        </form>
      )}
    </Dialog>
  );
}
