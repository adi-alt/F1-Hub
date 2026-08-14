"use client";

import { useAuthDialogStore } from "@/store/useAuthDialogStore";

/** Drop-in replacement for any section that requires a signed-in session; opens the same
 * shared sign-in/sign-up dialog the header uses (see store/useAuthDialogStore). */
export function SignInGate({ label = "this" }: { label?: string }) {
  const open = useAuthDialogStore((s) => s.open);

  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-10 text-center">
      <p className="text-lg font-semibold text-white">Sign in to view {label}</p>
      <p className="mt-2 text-sm text-neutral-400">
        Predictions, results, and standings are for signed-in users only.
      </p>
      <button
        onClick={open}
        className="mt-5 rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
      >
        Sign in
      </button>
    </div>
  );
}
