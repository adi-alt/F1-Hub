import type { ReactNode } from "react";

export type PageWidth = "wide" | "content" | "narrow";

/**
 * The frame a page's content sits in (design system spec §3): the same 1440px frame and gutters as
 * the header, so every route starts on the logo's left edge. `content` (the default) caps the
 * content at 1200px and `narrow` at 672px (forms, short messages), both kept on that edge rather
 * than re-centred; `wide` uses the whole frame (race, communities, archive). The widths are the
 * page-wide / page-content / page-narrow utilities in globals.css.
 *
 * `className` is for layout only: vertical padding, flex or grid, height.
 */
export function PageContainer({
  width = "content",
  as: Tag = "div",
  className,
  children,
}: {
  width?: PageWidth;
  as?: "div" | "main" | "section" | "header" | "footer";
  className?: string;
  children?: ReactNode;
}) {
  return <Tag className={[`page-${width}`, className].filter(Boolean).join(" ")}>{children}</Tag>;
}
