import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type Breadcrumb = { label: string; href?: string };

export type PageHeaderProps = {
  /** The page's h1, sentence case. */
  title: string;
  /** Ancestors first; the last item is the current page. */
  breadcrumbs?: Breadcrumb[];
  /** One sentence-case caption line above the title, e.g. "Round 16 · Sakhir". */
  eyebrow?: string;
  /** The line under the title: date, session times, counts. */
  meta?: ReactNode;
  /** The page's one state badge (a StateLabel), shown beside the title. */
  badge?: ReactNode;
  /** The page's actions, including its primary one. */
  actions?: ReactNode;
  /** Layout only: margin, width, grid placement. */
  className?: string;
};

const CRUMB_LINK_CLASS =
  "rounded-control underline-offset-4 transition-colors duration-fast ease-standard hover:text-primary hover:underline motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

function BreadcrumbTrail({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      {/* role="list": Safari stops announcing a list once preflight strips its markers. */}
      <ol role="list" className="flex flex-wrap items-center gap-1 text-body-sm text-secondary">
        {items.map((crumb, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${index}-${crumb.label}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-tertiary" />}
              {crumb.href ? (
                <Link href={crumb.href} aria-current={current ? "page" : undefined} className={current ? `text-primary ${CRUMB_LINK_CLASS}` : CRUMB_LINK_CLASS}>
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={current ? "page" : undefined} className={current ? "text-primary" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The top of every page (spec §4.11): breadcrumb trail, the page's h1, an optional eyebrow, a meta
 * line, the state badge and the page actions. It renders the page's only h1, so use exactly one
 * per page and start every Section below it at level 2.
 */
export function PageHeader({ title, breadcrumbs = [], eyebrow, meta, badge, actions, className }: PageHeaderProps) {
  return (
    <header className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}>
      {breadcrumbs.length > 0 && <BreadcrumbTrail items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 grow basis-80">
          {eyebrow && <p className="mb-1 text-caption text-secondary">{eyebrow}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-display-md text-primary">{title}</h1>
            {badge}
          </div>
          {meta && <div className="mt-2 text-body-sm text-secondary">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
