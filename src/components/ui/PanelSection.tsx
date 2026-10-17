import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { sectionHeadingId } from "@/components/ui/Section";
import { EYEBROW, PANEL } from "@/components/ui/panel";

/**
 * A section drawn the way Season draws its own ("SEASON SNAPSHOT", "CHAMPIONSHIP"): a tracked uppercase eyebrow over
 * a hairline that fades out, a one-line note or an action beside it, and the content on the site's near-transparent
 * panel. `bare` leaves the panel out for content that brings its own (a table). `fill` makes the section take its
 * grid cell's full height with the panel stretching to match, so two sections side by side end level instead of one
 * leaving a blank block under it.
 */
export function PanelSection({
  id,
  title,
  note,
  action,
  bare = false,
  fill = false,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  /** A control for the whole section, at the right of the eyebrow row (a "Full results" link). */
  action?: ReactNode;
  bare?: boolean;
  fill?: boolean;
  children: ReactNode;
}) {
  const headingId = sectionHeadingId(id);
  return (
    <Reveal className={fill ? "h-full" : undefined}>
      <section id={id} aria-labelledby={headingId} className={`min-w-0 scroll-mt-24 ${fill ? "flex h-full flex-col" : ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={headingId} className={EYEBROW}>
            {title}
          </h2>
          {action ?? (note && <p className="text-caption text-tertiary">{note}</p>)}
        </div>
        <div aria-hidden className="mb-3 mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
        {bare ? children : <div className={`p-5 ${PANEL} ${fill ? "flex flex-1 flex-col" : ""}`}>{children}</div>}
      </section>
    </Reveal>
  );
}
