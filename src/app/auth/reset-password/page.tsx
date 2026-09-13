"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

// Where the "Forgot password?" email link lands (see resetPasswordForEmail's redirectTo in
// AuthDialog.tsx). Supabase has no hosted page for this the way Firebase did — the browser
// client auto-establishes a recovery session from the link's own token before this ever renders
// (detectSessionInUrl, on by default), so all this page does is collect the new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/"), 1500);
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-lg font-bold text-white">Set a new password</h1>
      {done ? (
        <p className="text-sm text-green-400">Password updated. Redirecting…</p>
      ) : (
        <>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          />
          <button
            disabled={busy || password.length < 6}
            onClick={() => void handleSubmit()}
            className="w-full rounded-full bg-[var(--f1-red)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save password"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}
