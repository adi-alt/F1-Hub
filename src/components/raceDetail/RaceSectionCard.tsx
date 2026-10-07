import type { ReactNode } from "react";
import { Section } from "@/components/ui/Section";
import { Surface } from "@/components/ui/Surface";

/**
 * A race-page section (spec §3.3, §4.4): the title is a sentence-case h2 above the content, not a grey
 * uppercase label inside a bordered box, and the content sits on one level-1 surface (the tone that marks a
 * data region). `bare` leaves the surface out for content that brings its own (a table, a list of cards), so
 * nothing is boxed twice. Spacing between sections belongs to the page.
 */
export function RaceSectionCard({
  id,
  title,
  description,
  headerRight,
  bare = false,
  children,
}: {
  /** The section's anchor; defaults to a slug of the title. */
  id?: string;
  title: string;
  description?: string;
  // A control for the whole section, beside the title.
  headerRight?: ReactNode;
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <Section id={id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")} title={title} level={2} description={description} actions={headerRight} className="scroll-mt-24">
      {bare ? (
        children
      ) : (
        <Surface level={1} padding="md">
          {children}
        </Surface>
      )}
    </Section>
  );
}
