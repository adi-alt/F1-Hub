import { EntityAvatar } from "@/components/EntityAvatar";
import { ensureVisible } from "@/lib/colorContrast";
import { teamColor } from "@/lib/teamColors";

export type DriverIdentityProps = {
  /** The three-letter code, "VER". Always visible. */
  code: string;
  /** "Max Verstappen". Visible from sm up; below that it is still read out, so a screen reader hears the name. */
  name?: string | null;
  /** The constructor, for the team bar's colour when `color` isn't given. */
  team?: string | null;
  /** A known team colour (overrides `team`). Lightened if it is too dark to see on the page. */
  color?: string | null;
  headshotUrl?: string | null;
  /** Headshot size: 24 in dense tables and pickers, 32 in results and cards. */
  size?: 24 | 32;
  /** "responsive" (the default) shows the name from sm up; "always" also shows it on a phone, for the one
   * place a name is the point (a winner in a header). */
  nameVisibility?: "responsive" | "always";
  /** Layout only. */
  className?: string;
};

/**
 * Who a row is about, the same way everywhere (design system spec §4.11): a 3px team bar, the headshot, the
 * code and the name. Team colour is only ever this bar, never a tint (spec §2.3), and always beside the code,
 * so colour is never the only cue. Below sm only the code shows, which keeps tables narrow on a phone.
 */
export function DriverIdentity({ code, name, team, color, headshotUrl, size = 24, nameVisibility = "responsive", className }: DriverIdentityProps) {
  const bar = color ?? (team ? teamColor(team) : null);
  return (
    <span className={["inline-flex min-w-0 items-center gap-2", className].filter(Boolean).join(" ")}>
      <span aria-hidden className="w-[3px] shrink-0 self-stretch rounded-full" style={{ backgroundColor: bar ? ensureVisible(bar) : "transparent", minHeight: size }} />
      {headshotUrl !== undefined && <EntityAvatar imageUrl={headshotUrl ?? null} name={name ?? code} size={size} />}
      <span className="min-w-0 truncate">
        <span className="font-semibold text-primary">{code}</span>
        {name && <span className={nameVisibility === "always" ? "ml-1.5 text-secondary" : "sr-only sm:not-sr-only sm:ml-1.5 sm:text-secondary"}> {name}</span>}
      </span>
    </span>
  );
}
