import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { EYEBROW } from "@/components/ui/panel";

/** A legal page's frame (privacy notice, terms): a reading-width column, plain headings, and the draft notice. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="page-narrow py-10">
      <p className={EYEBROW}>Apex F1 Hub</p>
      <h1 className="mt-1 text-display-md text-primary">{title}</h1>
      <p className="mt-2 text-caption text-tertiary">Last updated {updated}</p>
      {/* Audit R-53: the wording is an accurate draft of what the code does, not reviewed legal text. */}
      <Alert tone="info" title="Draft" className="mt-6">
        This is a plain-language draft describing what the site actually does. Its legal wording has not been reviewed yet and may change.
      </Alert>
      <div className="mt-8 space-y-8 text-body-sm leading-relaxed text-secondary [&_h2]:mb-2 [&_h2]:text-body [&_h2]:font-semibold [&_h2]:text-primary [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
    </article>
  );
}
