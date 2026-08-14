"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { auth, githubProvider, googleProvider } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Skeleton } from "@/components/Skeleton";
import type { Role } from "@/lib/rbac";

type Step = "method" | "otp" | "profile";

type SignupOptions = { drivers: { code: string; name: string; team: string }[]; teams: string[]; tracks: string[] };

function errorCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
}

/** Firebase's default is one account per email address — trying a second provider against an
 * email that already has one throws this rather than silently merging them. Full account
 * linking (re-auth with the original provider, then link the new credential) is real work this
 * doesn't attempt yet; for now this just tells people which method to use instead. */
function friendlyAuthError(err: unknown): string {
  const code = errorCode(err);
  if (code === "auth/account-exists-with-different-credential") {
    return "An account already exists for this email with a different sign-in method. Use that one instead.";
  }
  if (code === "auth/popup-closed-by-user") return "";
  if (code === "auth/weak-password") return "Password must be at least 6 characters.";
  if (code === "auth/invalid-email") return "That doesn't look like a valid email address.";
  return "Something went wrong. Try again.";
}

// A lightweight 2D illustration, not another WebGL canvas - a modal that opens and closes
// repeatedly is exactly the wrong place to re-init a GLTF-loading r3f scene on every open.
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

// Six single-digit boxes rather than one text field - types forward automatically, backspace on
// an empty box steps back, and pasting a full code anywhere fills all six at once.
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-12 w-10 rounded-lg border border-[var(--f1-line)] bg-black/20 text-center text-lg font-bold text-white focus:border-white/30 focus:outline-none"
        />
      ))}
    </div>
  );
}

async function startOtpFlow(user: User): Promise<{ idToken: string; email: string }> {
  const idToken = await user.getIdToken();
  const res = await fetch("/api/auth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("Couldn't send a verification code. Try again.");
  const body = (await res.json()) as { email: string };
  return { idToken, email: body.email };
}

// The caller mounts this only while it should be open (`{open && <AuthDialog .../>}`) rather
// than always rendering it with an `open` prop — a fresh mount every time it opens is what gives
// it fresh state for free, no reset-on-open effect required.
export function AuthDialog({ onClose }: { onClose: () => void }) {
  const { setRole } = useAuth();
  const [step, setStep] = useState<Step>("method");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [idToken, setIdToken] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [code, setCode] = useState("");

  const [options, setOptions] = useState<SignupOptions | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  // "idle" is derived (short username, nothing worth checking yet) rather than stored, so the
  // debounce effect below only ever needs to set the states an actual check produces.
  const [checkedStatus, setCheckedStatus] = useState<"checking" | "available" | "taken" | null>(null);
  const usernameStatus = username.trim().length < 3 ? "idle" : checkedStatus ?? "idle";
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [favoriteDriver, setFavoriteDriver] = useState("");
  const [favoriteTeam, setFavoriteTeam] = useState("");
  const [favoriteTrack, setFavoriteTrack] = useState("");

  useEffect(() => {
    if (step !== "profile" || options) return;
    fetch("/api/auth/signup-options")
      .then((res) => res.json())
      .then(setOptions)
      .catch(() => setOptions({ drivers: [], teams: [], tracks: [] }));
  }, [step, options]);

  // Debounced live availability check as the user types a username. "checking" is set inside
  // the timeout callback, not synchronously in the effect body, so typing itself never
  // triggers a same-tick re-render — only the debounced check does.
  useEffect(() => {
    if (username.trim().length < 3) return;
    const handle = setTimeout(() => {
      setCheckedStatus("checking");
      fetch(`/api/username/check?u=${encodeURIComponent(username.trim())}`)
        .then((res) => res.json())
        .then((body: { available: boolean; suggestions?: string[] }) => {
          setCheckedStatus(body.available ? "available" : "taken");
          setUsernameSuggestions(body.suggestions ?? []);
        })
        .catch(() => setCheckedStatus(null));
    }, 400);
    return () => clearTimeout(handle);
  }, [username]);

  async function afterProviderAuth(user: User) {
    try {
      const result = await startOtpFlow(user);
      setIdToken(result.idToken);
      setVerifiedEmail(result.email);
      setStep("otp");
    } catch {
      setError("Couldn't send a verification code. Try again.");
    }
  }

  async function handleProvider(provider: typeof googleProvider | typeof githubProvider) {
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, provider);
      await afterProviderAuth(result.user);
    } catch (err) {
      const message = friendlyAuthError(err);
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailContinue() {
    setBusy(true);
    setError(null);
    try {
      let user: User;
      try {
        user = (await signInWithEmailAndPassword(auth, email, password)).user;
      } catch (signInErr) {
        try {
          user = (await createUserWithEmailAndPassword(auth, email, password)).user;
        } catch (createErr) {
          if (errorCode(createErr) === "auth/email-already-in-use") {
            throw new Error("That password doesn't match this email. Try again.");
          }
          void signInErr;
          throw createErr;
        }
      }
      await afterProviderAuth(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOtpSubmit() {
    if (!idToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, code }),
      });
      const body = (await res.json()) as { status?: "logged-in" | "needs-profile"; role?: Role; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Verification failed.");
        return;
      }
      if (body.status === "needs-profile") {
        setStep("profile");
      } else {
        setRole(body.role ?? "user");
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleProfileSubmit() {
    if (!idToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, firstName, lastName, username, favoriteDriver, favoriteTeam, favoriteTrack }),
      });
      const body = (await res.json()) as { status?: "logged-in"; role?: Role; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't create your account.");
        return;
      }
      setRole(body.role ?? "user");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none";

  // Rendered straight into document.body via a portal - inline (no portal) leaves position:fixed
  // exposed to any ancestor that happens to establish its own containing block (a transform, a
  // filter, plenty of other CSS a page can pick up over time), which is exactly what made this
  // render pinned to wherever its parent was instead of centered in the viewport. A portal makes
  // that whole category of bug structurally impossible rather than tracking down one ancestor.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative grid min-h-[560px] w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 shadow-2xl backdrop-blur-xl md:max-w-4xl md:grid-cols-2"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
            <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="hidden md:block">
          <FormulaScene />
        </div>

        <div className="flex flex-col justify-center overflow-hidden p-6">
        <AnimatePresence mode="wait">
        {step === "method" && (
          <motion.div
            key="method"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <h2 className="text-lg font-bold text-white">Sign in or sign up</h2>
            <p className="text-sm text-neutral-400">One account either way — we&apos;ll figure out which.</p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <button
              disabled={busy || !email || password.length < 6}
              onClick={() => void handleEmailContinue()}
              className="w-full rounded-full bg-[var(--f1-red)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Please wait…" : "Continue"}
            </button>

            <div className="flex items-center gap-2 py-1 text-xs text-neutral-500">
              <div className="h-px flex-1 bg-[var(--f1-line)]" />
              or
              <div className="h-px flex-1 bg-[var(--f1-line)]" />
            </div>

            <button
              disabled={busy}
              onClick={() => void handleProvider(googleProvider)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--f1-line)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <button
              disabled={busy}
              onClick={() => void handleProvider(githubProvider)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--f1-line)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </motion.div>
        )}

        {step === "otp" && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <h2 className="text-lg font-bold text-white">Check your email</h2>
            <p className="text-sm text-neutral-400">
              We sent a 6-digit code to <span className="text-white">{verifiedEmail}</span>.
            </p>
            <OtpInput value={code} onChange={setCode} />
            <button
              disabled={busy || code.length !== 6}
              onClick={() => void handleOtpSubmit()}
              className="w-full rounded-full bg-[var(--f1-red)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </motion.div>
        )}

        {step === "profile" && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="max-h-[70vh] space-y-3 overflow-y-auto">
            <h2 className="text-lg font-bold text-white">Tell us a bit about you</h2>
            <div className="flex gap-2">
              <input
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
              />
              {usernameStatus === "taken" && (
                <p className="mt-1 text-xs text-red-400">
                  Taken.
                  {usernameSuggestions.length > 0 && (
                    <>
                      {" "}
                      Try:{" "}
                      {usernameSuggestions.map((s, i) => (
                        <button
                          key={s}
                          onClick={() => setUsername(s)}
                          className="ml-1 text-[var(--f1-red)] underline hover:no-underline"
                        >
                          {s}
                          {i < usernameSuggestions.length - 1 ? "," : ""}
                        </button>
                      ))}
                    </>
                  )}
                </p>
              )}
              {usernameStatus === "available" && <p className="mt-1 text-xs text-green-400">Available.</p>}
            </div>

            {options ? (
              <>
                <select value={favoriteDriver} onChange={(e) => setFavoriteDriver(e.target.value)} className={inputClass}>
                  <option value="">Favorite driver (optional)</option>
                  {options.drivers.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select value={favoriteTeam} onChange={(e) => setFavoriteTeam(e.target.value)} className={inputClass}>
                  <option value="">Favorite team (optional)</option>
                  {options.teams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select value={favoriteTrack} onChange={(e) => setFavoriteTrack(e.target.value)} className={inputClass}>
                  <option value="">Favorite track (optional)</option>
                  {options.tracks.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </>
            )}

            <button
              disabled={
                busy ||
                !firstName.trim() ||
                !lastName.trim() ||
                username.trim().length < 3 ||
                usernameStatus === "taken"
              }
              onClick={() => void handleProfileSubmit()}
              className="w-full rounded-full bg-[var(--f1-red)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </motion.div>
        )}
        </AnimatePresence>
        </div>
      </div>
    </div>,
    document.body,
  );
}
