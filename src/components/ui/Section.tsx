import type { ReactNode } from "react";
import { ProvenanceLine, type Provenance } from "./ProvenanceLine";

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
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={["flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className].filter(Boolean).join(" ")}>
      <div className="min-w-0 grow basis-64">
        <Heading id={headingId} className={HEADING_CLASS[level]}>
          {title}
        </Heading>
        {description && <p className="mt-1 text-body-sm text-secondary">{description}</p>}
        {provenance && <ProvenanceLine {...provenance} className="mt-1" />}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
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
