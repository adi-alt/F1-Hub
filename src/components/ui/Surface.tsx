"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";

export type SurfaceLevel = 1 | 2 | 3;
export type SurfacePadding = "none" | "sm" | "md";

const LEVEL_CLASS: Record<SurfaceLevel, string> = {
  1: "bg-surface-1",
  2: "bg-surface-2",
  3: "bg-surface-3",
};

/** Hover lifts an interactive card one tone: surface-1 to surface-2 (spec §4.3), surface-2 to surface-3. */
const HOVER_CLASS: Record<1 | 2, string> = {
  1: "hover:bg-surface-2",
  2: "hover:bg-surface-3",
};

const PADDING_CLASS: Record<SurfacePadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
};

/** The link's ::after covers the card, and draws the card's focus ring in place of the link's own. */
const STRETCHED_LINK_CLASS =
  "after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus-ring";

/** Content paints above the stretched link but lets clicks fall through to it, except on the controls inside it.
 * It carries the card's padding, so anything absolutely positioned in it is still placed against the card's edges. */
const INTERACTIVE_CONTENT_CLASS =
  "pointer-events-none relative h-full [&_:where(a,button,input,select,textarea,summary,label,[tabindex])]:pointer-events-auto";

/** The level of the nearest enclosing Surface; undefined on the page canvas (surface-0). */
const SurfaceLevelContext = createContext<SurfaceLevel | undefined>(undefined);

/** Spec §4.3: a Surface may not contain another Surface of the same or a lower level. */
export function isValidSurfaceNesting(parent: SurfaceLevel | undefined, child: SurfaceLevel): boolean {
  return parent === undefined || child > parent;
}

/** The development warning for a nesting that breaks the rule, or null when it is allowed. */
export function surfaceNestingWarning(parent: SurfaceLevel | undefined, child: SurfaceLevel): string | null {
  if (isValidSurfaceNesting(parent, child)) return null;
  return `Surface: a level ${child} Surface is nested inside a level ${parent} Surface. A Surface may only contain higher levels (design system spec §4.3): raise the inner one, or drop it and separate the content with space.`;
}

type SurfaceBaseProps = {
  /** "sm" is 16px (compact), "md" 20px (the default). */
  padding?: SurfacePadding;
  as?: "section" | "article" | "div";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Layout only: margin, width, grid placement. Never colour, border or padding. */
  className?: string;
  children?: ReactNode;
};

export type SurfaceProps = SurfaceBaseProps &
  (
    | { level: SurfaceLevel; interactive?: false; href?: never; linkLabel?: never }
    | {
        /** Not 3: dialogs and sheets aren't links, and there is no higher tone to hover to. */
        level: 1 | 2;
        interactive: true;
        href: string;
        /** The card link's accessible name. Repeat the card's visible title in it (WCAG 2.5.3, label in name). */
        linkLabel: string;
      }
  );

/**
 * A tonal container (spec §4.3): level 1 for data regions (tables, charts, prediction cards, rails),
 * 2 for raised content, 3 for dialogs, sheets and toasts. No border; the tone separates it from
 * what it sits on.
 *
 * A Surface may only contain Surfaces of a higher level. Each one passes its level down through
 * context, and in development a nested Surface that isn't higher than its parent logs a warning.
 *
 * `interactive` makes the whole card one link to `href` (stretched link): the link comes first in
 * the card, its ::after covers the card, so a click anywhere follows it and its focus ring outlines
 * the card. Buttons, inputs and links inside the content stay separately clickable and focusable,
 * so nested actions are ordinary buttons; never wrap the card in another link.
 */
export function Surface(props: SurfaceProps) {
  const { level, padding = "md", as: Tag = "div", className, children } = props;
  const parentLevel = useContext(SurfaceLevelContext);
  if (process.env.NODE_ENV !== "production") {
    const warning = surfaceNestingWarning(parentLevel, level);
    if (warning) console.warn(warning);
  }
  const labels = { "aria-label": props["aria-label"], "aria-labelledby": props["aria-labelledby"] };

  if (!props.interactive) {
    return (
      <SurfaceLevelContext value={level}>
        <Tag {...labels} className={["rounded-card", LEVEL_CLASS[level], PADDING_CLASS[padding], className].filter(Boolean).join(" ")}>
          {children}
        </Tag>
      </SurfaceLevelContext>
    );
  }

  return (
    <SurfaceLevelContext value={level}>
      <Tag
        {...labels}
        className={[
          "relative rounded-card transition-colors duration-fast ease-standard motion-reduce:transition-none",
          LEVEL_CLASS[level],
          HOVER_CLASS[props.level],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Link href={props.href} className={STRETCHED_LINK_CLASS}>
          <span className="sr-only">{props.linkLabel}</span>
        </Link>
        <div className={[INTERACTIVE_CONTENT_CLASS, PADDING_CLASS[padding]].filter(Boolean).join(" ")}>{children}</div>
      </Tag>
    </SurfaceLevelContext>
  );
}
