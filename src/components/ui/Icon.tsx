import type { LucideIcon } from "lucide-react";

export type IconSize = 16 | 20 | 24;

export type IconProps = {
  icon: LucideIcon;
  size?: IconSize;
  /** Announces the icon as an image with this name. Leave it out when visible text already says the
   * same thing: the icon is then decorative and hidden from assistive technology. */
  label?: string;
  /** Layout only: margin, alignment, grid placement. The icon takes its colour from the text around it. */
  className?: string;
};

/**
 * The one way to draw an icon, so every icon has the same stroke (1.75) and one of three sizes.
 * Decorative (aria-hidden) unless given a `label`, which makes it role="img" with that name.
 */
export function Icon({ icon: Glyph, size = 20, label, className }: IconProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return <Glyph size={size} strokeWidth={1.75} className={className ? `shrink-0 ${className}` : "shrink-0"} {...a11y} />;
}
