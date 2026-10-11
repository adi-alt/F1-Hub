import { ensureVisible } from "@/lib/colorContrast";

export type ProbabilityEntry = {
  /** What the share belongs to: a driver code, a team, "Yes". Shown as the direct label. */
  label: string;
  /** A probability, 0..1. */
  value: number;
  /** The entity's colour (a team colour); lightened if too dark to see. Neutral when absent. */
  color?: string | null;
};

export type MeterSegment = { label: string; share: number; color: string | null; other: boolean };

/** Neutral tones (the text tokens) for entries without a colour, so they never read as a team; "Other" is
 * text-tertiary at 40%, the spec's treatment for everything that isn't in focus (§7). */
const NEUTRALS = ["var(--text-secondary)", "var(--text-tertiary)"];
const OTHER_COLOR = "color-mix(in srgb, var(--text-tertiary) 40%, transparent)";

/**
 * The bar's segments: the top `topN` entries by value, then everything else summed as "Other". Shares are
 * normalised to the total, so a meter whose probabilities don't quite add to 1 (rounding, an unlisted field)
 * still fills exactly once. Empty or all-zero input gives no segments.
 */
export function meterSegments(entries: readonly ProbabilityEntry[], topN = 3): MeterSegment[] {
  const valid = entries.filter((e) => Number.isFinite(e.value) && e.value > 0);
  const total = valid.reduce((sum, e) => sum + e.value, 0);
  if (total <= 0) return [];
  const sorted = [...valid].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, topN).map((e, i) => ({ label: e.label, share: e.value / total, color: e.color ? ensureVisible(e.color) : NEUTRALS[i % NEUTRALS.length], other: false }));
  const rest = sorted.slice(topN).reduce((sum, e) => sum + e.value, 0);
  return rest > 0 ? [...top, { label: "Other", share: rest / total, color: OTHER_COLOR, other: true }] : top;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * One horizontal stacked bar for the top few and "Other", with the labels written on the segments instead of
 * a legend (design system spec §4.11, §7). Percentages are tabular so they line up. The bar is decorative to
 * assistive tech: an sr-only table carries the same numbers, captioned by `caption`.
 */
export function ProbabilityMeter({ entries, topN = 3, caption, className }: { entries: readonly ProbabilityEntry[]; topN?: number; caption: string; className?: string }) {
  const segments = meterSegments(entries, topN);
  if (segments.length === 0) return null;
  return (
    <div className={className}>
      <div aria-hidden className="flex h-2.5 w-full gap-px overflow-hidden rounded-control">
        {segments.map((s) => (
          <span key={s.label} className="h-full" style={{ width: `${s.share * 100}%`, backgroundColor: s.color ?? NEUTRALS[0] }} />
        ))}
      </div>
      <div aria-hidden className="mt-1.5 flex w-full gap-px">
        {segments.map((s) => (
          // Each label sits under its own segment and shares its width; a label too long for a thin segment
          // truncates instead of spilling into its neighbour.
          <span key={s.label} className="min-w-0 truncate text-caption" style={{ width: `${s.share * 100}%` }}>
            <span className={s.other ? "text-tertiary" : "font-semibold text-primary"}>{s.label}</span>{" "}
            <span className="tabular-nums text-secondary">{percent(s.share)}</span>
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Outcome</th>
            <th scope="col">Probability</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr key={s.label}>
              <th scope="row">{s.label}</th>
              <td>{percent(s.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
