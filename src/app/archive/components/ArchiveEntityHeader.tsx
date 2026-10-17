import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Typewriter } from "@/components/motion/Typewriter";
import { EYEBROW } from "@/components/ui/panel";

/**
 * The hero every Archive entity page (driver, team, circuit) opens with, in Season's language: a breadcrumb, an
 * eyebrow naming what this is ("DRIVER · 2007–2025"), the name with its team-colour bar, and - answer first - the one
 * sentence a visitor came for ("Seven-time champion, 105 wins"), typed in. The figures run underneath as Season's
 * snapshot does: tracked labels in hairline-divided columns, not a row of floating numbers. Every number is a real sum
 * from the archive; a missing photo is simply left out (the colour bar carries the identity), never a lettered stand-in.
 */
export function ArchiveEntityHeader({
  backHref,
  backLabel,
  kind,
  name,
  photoUrl,
  photoShape = "circle",
  subtitle,
  answer,
  stats,
  favoriteButton,
  accent,
}: {
  backHref: string;
  backLabel: string;
  /** What the page is about, for the eyebrow: "Driver", "Constructor", "Circuit". */
  kind: string;
  name: string;
  /** Omit, or null, for an entity without a photo (a circuit: its layout is drawn below; a team with no logo). */
  photoUrl?: string | null;
  photoShape?: "circle" | "square";
  subtitle: string;
  /** The headline about this entity, in one sentence. */
  answer?: string | null;
  stats: { label: string; value: string | number; detail?: string }[];
  favoriteButton?: React.ReactNode;
  /** The team colour: a ring round the photo, or a bar beside the name when there is no photo. */
  accent?: string | null;
}) {
  return (
    <header className="mb-10">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-caption">
        <Link href={backHref} className="text-secondary transition-colors duration-fast hover:text-primary">
          {backLabel}
        </Link>
        <span aria-hidden className="text-tertiary">
          /
        </span>
        <span className="truncate text-primary" aria-current="page">
          {name}
        </span>
      </nav>

      <div className="flex items-center gap-4 sm:gap-5">
        {photoUrl && (
          <span className={`shrink-0 p-0.5 ${photoShape === "circle" ? "rounded-full" : "rounded-md"}`} style={accent ? { boxShadow: `inset 0 0 0 1.5px ${accent}` } : undefined}>
            <EntityAvatar imageUrl={photoUrl} name={name} size={64} shape={photoShape} fit={photoShape === "square" ? "contain" : "cover"} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={EYEBROW}>
            {kind} · {subtitle}
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            {/* The team colour once: the ring round the photo, or this bar when there is no photo. */}
            {accent && !photoUrl && <span aria-hidden className="h-8 w-1 shrink-0 rounded-full sm:h-9" style={{ background: accent }} />}
            <h1 className="min-w-0 break-words text-display-md text-primary sm:text-display-lg">{name}</h1>
            {favoriteButton}
          </div>
        </div>
      </div>
      {answer && (
        <p className="mt-4 max-w-3xl text-body text-secondary" aria-live="polite">
          <Typewriter text={answer} msPerChar={14} />
        </p>
      )}

      {stats.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 border-t border-white/[0.06] sm:grid-cols-3 lg:flex">
          {stats.map((s, i) => (
            // A hairline between columns, Season's snapshot, instead of a boxed figure each.
            <div key={s.label} className={`relative min-w-0 py-3.5 pr-4 lg:flex-1 lg:px-5 lg:first:pl-0 ${i > 0 ? "lg:border-l lg:border-white/[0.06]" : ""}`}>
              <dt className={EYEBROW}>{s.label}</dt>
              <dd className="mt-1 text-title-md tabular text-primary">{s.value}</dd>
              {s.detail && <dd className="truncate font-mono text-caption tabular text-tertiary">{s.detail}</dd>}
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
