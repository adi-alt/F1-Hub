"use client";

import Link from "next/link";
import { Archive, Bot, Check, Flag, MapPin, Trophy, Users } from "lucide-react";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { Button } from "@/components/ui/Button";
import { MiniWindow } from "@/components/home/landing/MiniWindow";
import { ApexMini, ArchiveMini, CircuitMini, PredictMini, ReplayMini } from "@/components/home/landing/FeatureShowcase";

type Preview = "archive" | "circuit" | "replay" | "predict" | "apex";
type Gate = { title: string; lead: string; points: string[]; preview: Preview; window: string };

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
  return { title: `Sign in to see ${label}`, lead: "Apex F1 Hub is free: results, predictions, an AI analyst and every race since 1950.", points: ["Live results and timing for every session", "Predictions you can play with friends", "Every race since 1950"], preview: "apex", window: "Apex" };
}

/** The rest of the site, for the "Also on Apex F1 Hub" row - the gate's own section left out. */
const ALSO: { key: Preview | "season"; href: string; icon: typeof Flag; title: string; text: string }[] = [
  { key: "predict", href: "/?section=communities", icon: Trophy, title: "Predict", text: "Picks for every Grand Prix, with friends" },
  { key: "replay", href: "/?section=season", icon: Flag, title: "Races", text: "Replays, qualifying and the simulation" },
  { key: "season", href: "/?section=season", icon: Users, title: "Season", text: "Standings, form and the title fight" },
  { key: "circuit", href: "/?section=circuits", icon: MapPin, title: "Circuits", text: "Every track and how it changed" },
  { key: "archive", href: "/?section=archive", icon: Archive, title: "Archive", text: "Every race since 1950" },
  { key: "apex", href: "/", icon: Bot, title: "Apex", text: "An AI analyst for every race" },
];

const WINDOW_TITLE: Record<Preview, string> = { archive: "Archive", circuit: "Circuits", replay: "Race replay", predict: "Predict", apex: "Apex" };

function previewFor(p: Preview) {
  if (p === "archive") return <ArchiveMini />;
  if (p === "circuit") return <CircuitMini />;
  if (p === "replay") return <ReplayMini drivers={[{ driver: "1", team: "a" }, { driver: "2", team: "b" }, { driver: "3", team: "c" }]} anonymous />;
  if (p === "predict") return <PredictMini drivers={[]} anonymous />;
  return <ApexMini leader={null} />;
}

/**
 * What a signed-out visitor sees in place of a signed-in page: what that page offers (specific to it), a way in, and
 * a floating preview of the feature - with two more windows layered behind it on desktop - then the rest of the site.
 * The previews are miniatures with no names or numbers, so nothing reads as real data. Opens the same shared
 * sign-in/sign-up dialog the header uses (store/useAuthDialogStore).
 */
export function SignInGate({ label = "this", title, lead }: { label?: string; /** Overrides the section's own heading, e.g. an invitation naming its community. */ title?: string; lead?: string }) {
  const open = useAuthDialogStore((s) => s.open);
  const g = { ...gateFor(label), ...(title ? { title } : {}), ...(lead ? { lead } : {}) };
  const behind = (["circuit", "archive", "replay", "predict"] as Preview[]).filter((p) => p !== g.preview).slice(0, 2);
  const also = ALSO.filter((a) => a.key !== g.preview && !(g.preview === "apex" && a.key === "season")).slice(0, 4);

  return (
    // isolate: the windows' layers stay inside the gate, so the sticky header is always on top.
    <div className="isolate overflow-x-clip py-6 lg:py-10">
      <section className="grid grid-cols-1 items-center gap-10 lg:min-h-[28rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
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
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" onClick={open}>
              Create a free account
            </Button>
            <Button variant="secondary" size="md" onClick={open}>
              I have an account · Sign in
            </Button>
          </div>
          <p className="mt-3 text-caption text-tertiary">Free. Sign in with Google, GitHub, Discord or GitLab; no password to remember.</p>
        </div>

        {/* The preview: the section's own window in front, two others layered behind it on desktop. */}
        <div aria-hidden className="relative mx-auto w-full max-w-md lg:h-[26rem] lg:max-w-none">
          <span className="absolute inset-8 -z-10 rounded-full bg-brand/10 blur-3xl" />
          {behind.map((p, i) => (
            <div key={p} className={`hidden lg:absolute lg:block lg:w-60 lg:opacity-60 ${i === 0 ? "lg:right-0 lg:top-0" : "lg:bottom-0 lg:left-0"}`}>
              <MiniWindow title={WINDOW_TITLE[p]} float={{ x: 3, y: 10, dur: 10 + i * 1.5, delay: 2 + i * 2 }}>
                {previewFor(p)}
              </MiniWindow>
            </div>
          ))}
          <div className="relative z-10 lg:absolute lg:left-1/2 lg:top-1/2 lg:w-96 lg:-translate-x-1/2 lg:-translate-y-1/2">
            <MiniWindow title={g.window} float={{ x: 4, y: 14, dur: 9, delay: 0 }}>
              {previewFor(g.preview)}
            </MiniWindow>
          </div>
        </div>
      </section>

      <section aria-labelledby="also-heading" className="mt-14 border-t border-subtle pt-8">
        <h2 id="also-heading" className="text-body font-semibold text-primary">
          Also on Apex F1 Hub
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {also.map((a) => (
            <li key={a.title}>
              <Link href={a.href} className="group flex h-full items-start gap-3 rounded-card bg-surface-1 p-4 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring">
                <a.icon aria-hidden size={20} className="mt-0.5 shrink-0 text-secondary transition-colors group-hover:text-brand-text" />
                <span className="min-w-0">
                  <span className="block text-body-sm font-semibold text-primary">{a.title}</span>
                  <span className="mt-0.5 block text-caption text-secondary">{a.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
