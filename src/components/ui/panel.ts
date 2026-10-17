/**
 * The site's own glass, as Season draws it (SeasonCalendar, AnalysisWorkspace): a hairline edge, a barely-there white
 * fill and a 2px blur, so the page's ambient light shows through rather than a milky pane sitting on top of it. Communities
 * and the Archive's driver, team and circuit pages use this one recipe, so they read as part of the same product.
 */
export const PANEL = "rounded-lg border border-white/[0.06] bg-white/[0.012] backdrop-blur-[2px]";

/** A panel that opens something: the edge and fill lift a little on hover, as Season's interactive rows do. */
export const PANEL_INTERACTIVE = `${PANEL} transition-colors duration-fast hover:border-white/[0.12] hover:bg-white/[0.025]`;

/** A section label, Season's eyebrow ("SEASON SNAPSHOT", "WHAT CHANGED"): small, uppercase, widely tracked. At the
 * 12px caption token rather than Season's 10px, the floor the design spec and its lint hold new code to. */
export const EYEBROW = "text-caption font-semibold uppercase tracking-[0.16em] text-tertiary";
