import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { sectionHeadingId } from "@/components/ui/Section";
import { EYEBROW, PANEL } from "@/components/ui/panel";

/**
 * A section of an Archive driver, team or circuit page, drawn the way Season draws its own ("SEASON SNAPSHOT",
 * "CHAMPIONSHIP"): the heading is a tracked uppercase eyebrow over a hairline that fades out, a one-line note beside
 * it, and the content on the site's near-transparent panel. `bare` leaves the panel out for content that brings its
 * own (the race table), so nothing is boxed twice.
 */
export function ArchiveSection({ id, title, note, bare = false, children }: { id: string; title: string; note?: string; bare?: boolean; children: ReactNode }) {
  const headingId = sectionHeadingId(id);
  return (
    <Reveal>
      <section id={id} aria-labelledby={headingId} className="scroll-mt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={headingId} className={EYEBROW}>
            {title}
          </h2>
          {note && <p className="text-caption text-tertiary">{note}</p>}
        </div>
        <div aria-hidden className="mb-3 mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
        {bare ? children : <div className={`p-5 ${PANEL}`}>{children}</div>}
      </section>
    </Reveal>
  );
}
