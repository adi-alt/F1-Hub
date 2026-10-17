import type { ReactNode } from "react";
import { ProvenanceLine, type Provenance } from "./ProvenanceLine";
import { EYEBROW } from "./panel";

export type SectionLevel = 2 | 3;

const HEADING_CLASS: Record<SectionLevel, string> = {
  2: "text-title-lg text-primary",
  3: "text-title-md text-primary",
};

/** The id of a Section's heading, which is also what labels the section: "results" -> "results-heading". */
export function sectionHeadingId(sectionId: string): string {
  return `${sectionId}-heading`;
}

export type SectionHeaderProps = {
  /** Sentence case. */
  title: string;
  /** 2 for a page section (h2), 3 for a sub-section inside one (h3). Keep headings in order. */
  level: SectionLevel;
  description?: string;
  /** Controls for the whole section, shown on the right. */
  actions?: ReactNode;
  /** Source, status and freshness of what the section shows. Required for results, predictions, AI output and weather. */
  provenance?: Provenance;
  /** Set when something is labelled by this heading. Section sets it for you. */
  headingId?: string;
  /** Layout only: margin, width, grid placement. */
  className?: string;
};

/**
 * A section's header without the Section wrapper: a real h2 or h3, an optional description and
 * provenance line, and actions on the right. Use it where the region already exists (a dialog
 * body, a rail block) and pass `headingId` if that region is labelled by the heading.
 */
export function SectionHeader({ title, level, description, actions, provenance, headingId, className }: SectionHeaderProps) {
  // A page section (h2) is headed the way Season heads its own ("SEASON SNAPSHOT", "CHAMPIONSHIP"): a tracked
  // uppercase eyebrow over a hairline, so every section on the site reads as one family. A sub-section (h3) keeps a
  // sentence-case title, the step down inside a section.
  if (level === 2) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id={headingId} className={`min-w-0 ${EYEBROW}`}>
            {title}
          </h2>
          {/* At most the row's width: a wide control wraps under the title, then scrolls inside itself. */}
          {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
        {description && <p className="mt-2 text-body-sm text-secondary">{description}</p>}
        {provenance && <ProvenanceLine {...provenance} className="mt-1" />}
      </div>
    );
  }
  return (
    <div className={["flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className].filter(Boolean).join(" ")}>
      <div className="min-w-0 grow basis-64">
        <h3 id={headingId} className={HEADING_CLASS[level]}>
          {title}
        </h3>
        {description && <p className="mt-1 text-body-sm text-secondary">{description}</p>}
        {provenance && <ProvenanceLine {...provenance} className="mt-1" />}
      </div>
      {/* At most the row's width: a wide control (a four-way segmented filter) wraps under the title and then
          scrolls inside itself on a 320px screen, instead of pushing the page sideways. */}
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type SectionProps = Omit<SectionHeaderProps, "headingId" | "className"> & {
  /** URL-fragment-safe slug: the section's anchor, and the base of its heading's id. */
  id: string;
  /** Layout only: margin, width, grid placement. */
  className?: string;
  children: ReactNode;
};

/**
 * A titled region of a page (spec §4.4), labelled by its own heading. It replaces RaceSectionCard,
 * RaceSubSection and the uppercase eyebrow labels: the title is a sentence-case h2 or h3, and the
 * section draws no box of its own. Put data regions (tables, charts) in a Surface inside it, and
 * leave the space between sections to the page layout.
 */
export function Section({ id, className, children, ...header }: SectionProps) {
  const headingId = sectionHeadingId(id);
  return (
    <section id={id} aria-labelledby={headingId} className={className}>
      <SectionHeader {...header} headingId={headingId} className="mb-4" />
      {children}
    </section>
  );
}
