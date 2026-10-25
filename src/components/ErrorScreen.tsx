"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, Flag, Home, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MiniWindow } from "@/components/home/landing/MiniWindow";
import { CircuitMini } from "@/components/home/landing/FeatureShowcase";
import { ReportProblemButton, errorSummary } from "@/components/ReportProblem";

const NEXT = [
  { href: "/?section=season", icon: Flag, title: "Season", text: "Standings, races and the title fight" },
  { href: "/?section=circuits", icon: MapPin, title: "Circuits", text: "Every track on the calendar" },
  { href: "/?section=archive", icon: Archive, title: "Archive", text: "Every race since 1950" },
  { href: "/", icon: Home, title: "Home", text: "The next race and the latest" },
];

/**
 * The error boundaries' page, in the 404 page's layout (src/app/not-found.tsx): what happened, Try again / Go home /
 * Report this problem, the floating window with the car still lapping, and where to go next. A client component,
 * since error boundaries are; `children` sits under the copy (the archive's admin diagnostic).
 */
export function ErrorScreen({ error, reset, children }: { error: Error & { digest?: string }; reset: () => void; children?: ReactNode }) {
  return (
    <div className="page-content isolate overflow-x-clip py-10 lg:py-16">
      <section className="grid grid-cols-1 items-center gap-10 lg:min-h-[24rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div className="min-w-0">
          <p className="text-body-sm text-secondary">
            <span className="font-semibold text-brand-text">Red flag</span> · Something went wrong
          </p>
          <h1 className="mt-1 text-display-md font-semibold text-primary">This page hit an unexpected error.</h1>
          <p className="mt-3 max-w-xl text-body text-secondary">It&apos;s been logged. Try again, or pick up from one of the sections below.</p>
          {children}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" onClick={() => reset()}>
              Try again
            </Button>
            <Button variant="secondary" size="md" asChild>
              <Link href="/">Go home</Link>
            </Button>
            <ReportProblemButton
              error={errorSummary(error)}
              className="px-2 text-body-sm text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              Report this problem
            </ReportProblemButton>
          </div>
        </div>
        <div aria-hidden className="relative mx-auto w-full max-w-sm">
          <span className="absolute inset-6 -z-10 rounded-full bg-brand/10 blur-3xl" />
          <MiniWindow title="Red flag" float={{ x: 4, y: 14, dur: 9, delay: 0 }}>
            <CircuitMini />
          </MiniWindow>
        </div>
      </section>

      <section aria-labelledby="error-next-heading" className="mt-14 border-t border-subtle pt-8">
        <h2 id="error-next-heading" className="text-body font-semibold text-primary">
          Where to next?
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NEXT.map((n) => (
            <li key={n.title}>
              <Link href={n.href} className="group flex h-full items-start gap-3 rounded-card bg-surface-1 p-4 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring">
                <n.icon aria-hidden size={20} className="mt-0.5 shrink-0 text-secondary transition-colors group-hover:text-brand-text" />
                <span className="min-w-0">
                  <span className="block text-body-sm font-semibold text-primary">{n.title}</span>
                  <span className="mt-0.5 block text-caption text-secondary">{n.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
