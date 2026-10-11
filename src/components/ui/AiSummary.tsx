"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Icon } from "./Icon";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";

export type AiSummaryProps = {
  /** The generated text. Plain prose; keep it to a few sentences. */
  children: ReactNode;
  /** When it was generated (an ISO string or a Date). Shown in the viewer's own zone. */
  generatedAt?: string | Date | null;
  /** The facts it was written from, shown on request: the numbers a reader can check it against. */
  evidence?: ReactNode;
  /** Defaults to "AI summary". */
  label?: string;
  /** Layout only. */
  className?: string;
};

function timeLabel(value: string | Date, timeZone: string | undefined): string | null {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { timeZone, hour: "numeric", minute: "2-digit" });
}

/**
 * Model-written text, marked as such (design system spec §4.11): an info icon, "AI summary · 14:02", the text,
 * and the evidence behind it on request. Deliberately quieter than the page's own facts (secondary text, no
 * surface of its own), so a generated sentence never looks like a measured number. The evidence uses a native
 * <details>, which is keyboard and screen-reader operable with no script.
 */
export function AiSummary({ children, generatedAt, evidence, label = "AI summary", className }: AiSummaryProps) {
  const timeZone = useViewerTimeZone();
  const time = generatedAt ? timeLabel(generatedAt, timeZone) : null;
  return (
    <div className={className}>
      <p className="flex items-center gap-1.5 text-caption text-tertiary">
        <Icon icon={Info} size={16} />
        <span>
          {label}
          {time && <> · {time}</>}
        </span>
      </p>
      <div className="mt-1.5 text-body-sm text-secondary">{children}</div>
      {evidence && (
        <details className="group mt-2 text-caption text-tertiary">
          <summary className="w-fit cursor-pointer rounded-control underline-offset-2 hover:text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            What this is based on
          </summary>
          <div className="mt-1.5 text-secondary">{evidence}</div>
        </details>
      )}
    </div>
  );
}
