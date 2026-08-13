"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { TrackMapScene } from "@/components/home/TrackMapScene";

export function AboutSection() {
  const { user, signInWithGoogle } = useAuth();

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
        How this works
      </h2>
      <p className="mb-2 max-w-2xl text-2xl font-bold text-white">
        F1 Hub follows the sport the way a fan actually does. Five corners, one lap.
      </p>
      <p className="mb-8 max-w-2xl text-sm text-neutral-400">
        Hover or tap a cone to see what it stands for.
      </p>

      <TrackMapScene />

      {!user && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-6 py-5">
          <p className="text-sm text-neutral-400">See it running on the current season.</p>
          <button
            onClick={() => void signInWithGoogle()}
            className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
          >
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
}
