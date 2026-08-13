"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { auth, githubProvider, googleProvider } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Role } from "@/lib/rbac";

type Step = "method" | "email" | "otp" | "profile";

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative grid w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 shadow-2xl backdrop-blur-xl md:max-w-3xl md:grid-cols-2"
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

        <div className="p-6">
        {step === "method" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">Sign in or sign up</h2>
            <p className="text-sm text-neutral-400">One account either way — we&apos;ll figure out which.</p>
            <button
              disabled={busy}
              onClick={() => void handleProvider(googleProvider)}
              className="w-full rounded-full border border-[var(--f1-line)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              Continue with Google
            </button>
            <button
              disabled={busy}
              onClick={() => void handleProvider(githubProvider)}
              className="w-full rounded-full border border-[var(--f1-line)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              Continue with GitHub
            </button>
            <div className="flex items-center gap-2 py-1 text-xs text-neutral-500">
              <div className="h-px flex-1 bg-[var(--f1-line)]" />
              or
              <div className="h-px flex-1 bg-[var(--f1-line)]" />
            </div>
            <button
              onClick={() => setStep("email")}
              className="w-full rounded-full bg-[var(--f1-red)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Continue with email
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {step === "email" && (
          <div className="space-y-3">
            <button onClick={() => setStep("method")} className="text-sm text-neutral-500 hover:text-neutral-300">
              ← Back
            </button>
            <h2 className="text-lg font-bold text-white">Continue with email</h2>
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
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">Check your email</h2>
            <p className="text-sm text-neutral-400">
              We sent a 6-digit code to <span className="text-white">{verifiedEmail}</span>.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${inputClass} text-center text-lg tracking-[0.3em]`}
            />
            <button
              disabled={busy || code.length !== 6}
              onClick={() => void handleOtpSubmit()}
              className="w-full rounded-full bg-[var(--f1-red)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {step === "profile" && (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto">
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

            <select value={favoriteDriver} onChange={(e) => setFavoriteDriver(e.target.value)} className={inputClass}>
              <option value="">Favorite driver (optional)</option>
              {(options?.drivers ?? []).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
            <select value={favoriteTeam} onChange={(e) => setFavoriteTeam(e.target.value)} className={inputClass}>
              <option value="">Favorite team (optional)</option>
              {(options?.teams ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={favoriteTrack} onChange={(e) => setFavoriteTrack(e.target.value)} className={inputClass}>
              <option value="">Favorite track (optional)</option>
              {(options?.tracks ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

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
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
