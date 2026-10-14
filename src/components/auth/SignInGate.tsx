"use client";

import { Check } from "lucide-react";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { MiniWindow } from "@/components/home/landing/MiniWindow";
import { ApexMini, ArchiveMini, CircuitMini, PredictMini, ReplayMini } from "@/components/home/landing/FeatureShowcase";

type Gate = { title: string; lead: string; points: string[]; preview: "archive" | "circuit" | "replay" | "predict" | "apex"; window: string };

/** What a visitor gets behind each gate, chosen from the gate's label - so the page says what's here, not just
 * "signed-in users only". */
function gateFor(label: string): Gate {
  const l = label.toLowerCase();
  if (l.includes("archive"))
    return { title: "Every Formula 1 race since 1950", lead: "Seventy-six seasons of official classifications, told as stories.", points: ["Every season's championship, round by round", "Drivers' and teams' careers, season by season", "Every circuit and who has won there"], preview: "archive", window: "Archive · since 1950" };
  if (l.includes("circuit"))
    return { title: "Every circuit on the calendar", lead: "Each track as it's raced today, and how it got here.", points: ["The circuit drawn from real timing data", "How its layout changed through the years", "Records, past winners and Apex's read"], preview: "circuit", window: "Circuits" };
  if (l.includes("race") || l.includes("simulat"))
    return { title: "Every race, as it happened", lead: "Results, replays and the model's view of the weekend.", points: ["A replay of every car on the real circuit", "Qualifying stage by stage, practice and the sprint", "10,000 simulated races before the start: who's likely to win"], preview: "replay", window: "Race replay" };
  if (l.includes("communit") || l.includes("predict"))
    return { title: "Predict with your friends", lead: "Make your picks before each Grand Prix and see who reads the sport best.", points: ["Pick the winner, the podium and more", "Private communities with their own leaderboard", "Score against everyone else - and our model"], preview: "predict", window: "Predict" };
  if (l.includes("season") || l.includes("standing"))
    return { title: "The championship, round by round", lead: "Standings with sprint points, form and how the title fight moved.", points: ["Drivers' and constructors' standings", "Form, streaks and head-to-heads", "Apex's take on the season so far"], preview: "apex", window: "Apex" };
  return { title: `Sign in to see ${label}`, lead: "F1 Hub is free: results, predictions, an AI analyst and every race since 1950.", points: ["Live results and timing for every session", "Predictions you can play with friends", "Every race since 1950"], preview: "apex", window: "Apex" };
}

/**
 * What a signed-out visitor sees in place of a signed-in page: what that page offers (specific to it), a way in, and a
 * floating preview window of the feature - a miniature with no names or numbers, so nothing reads as real data.
 * Opens the same shared sign-in/sign-up dialog the header uses (store/useAuthDialogStore).
 */
export function SignInGate({ label = "this" }: { label?: string }) {
  const open = useAuthDialogStore((s) => s.open);
  const g = gateFor(label);

  return (
    <section className="grid min-h-[calc(100dvh-16rem)] grid-cols-1 overflow-x-clip content-center items-center gap-10 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
      <div className="min-w-0">
        <p className="text-body-sm text-secondary">Sign in to see {label}</p>
        {/* The page's h1: every caller renders the gate in place of the whole page. */}
        <h1 className="mt-1 text-display-md font-semibold text-primary">{g.title}</h1>
        <p className="mt-3 max-w-xl text-body text-secondary">{g.lead}</p>
        <ul className="mt-6 space-y-2.5">
          {g.points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-body text-primary">
              <Check aria-hidden size={18} className="mt-0.5 shrink-0 text-success" />
              {p}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={open}
            className="rounded-control bg-brand px-5 py-2.5 text-body font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Create a free account
          </button>
          <button type="button" onClick={open} className="text-body font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
            I have an account · Sign in
          </button>
        </div>
        <p className="mt-3 text-caption text-tertiary">Free. Sign in with Google, GitHub, Discord or GitLab; no password to remember.</p>
      </div>

      <div aria-hidden className="relative mx-auto w-full max-w-md lg:scale-110">
        <span className="absolute -inset-10 -z-10 rounded-full bg-brand/10 blur-3xl" />
        <MiniWindow title={g.window} float={{ x: 4, y: 14, dur: 9, delay: 0 }}>
          {g.preview === "archive" ? (
            <ArchiveMini />
          ) : g.preview === "circuit" ? (
            <CircuitMini />
          ) : g.preview === "replay" ? (
            <ReplayMini drivers={[{ driver: "1", team: "a" }, { driver: "2", team: "b" }, { driver: "3", team: "c" }]} anonymous />
          ) : g.preview === "predict" ? (
            <PredictMini drivers={[]} anonymous />
          ) : (
            <ApexMini leader={null} />
          )}
        </MiniWindow>
      </div>
    </section>
  );
}
