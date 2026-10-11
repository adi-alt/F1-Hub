import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Surface } from "./Surface";

export type EmptyStateProps = {
  /** One sentence: what is missing and why, e.g. "No results yet: the race starts Sun 17:00." */
  message: string;
  icon?: LucideIcon;
  /** The next step, when there is a real one. */
  action?: ReactNode;
  /** A surface-1 card, only for a top-level page that is empty as a whole. */
  boxed?: boolean;
  /** Layout only: margin, width, height, grid placement. */
  className?: string;
};

/**
 * What a region shows when it has nothing to show (spec §4.9): an icon, one sentence and an optional
 * action. Unboxed by default, so it takes the place of the content it stands in for. `boxed` draws
 * it on a level 1 Surface and is for empty top-level pages only, so inside another Surface it
 * triggers the nesting warning.
 */
export function EmptyState({ message, icon: Icon, action, boxed = false, className }: EmptyStateProps) {
  const content = (
    <div
      className={["flex flex-col items-center gap-3 text-center", boxed ? "px-6 py-12" : "px-4 py-8", boxed ? undefined : className]
        .filter(Boolean)
        .join(" ")}
    >
      {Icon && <Icon size={24} strokeWidth={1.75} aria-hidden className="shrink-0 text-tertiary" />}
      <p className={boxed ? "max-w-md text-body text-secondary" : "max-w-md text-body-sm text-secondary"}>{message}</p>
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
  if (!boxed) return content;
  return (
    <Surface level={1} padding="none" className={className}>
      {content}
    </Surface>
  );
}
