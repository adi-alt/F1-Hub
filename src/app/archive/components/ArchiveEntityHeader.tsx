import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Typewriter } from "@/components/motion/Typewriter";

/**
 * The hero every Archive entity page (driver, team, circuit) opens with, in the circuit and race pages' language
 * (audit §3 page template, §4.11 PageHeader): a breadcrumb, the face or logo large, the name, and - answer first - the
 * one sentence a visitor came for ("Seven-time champion, 105 wins"), typed in. The figures run in a strip underneath.
 * Every number is a real sum from the archive; a missing photo stays a lettered badge, never a stand-in image.
 */
export function ArchiveEntityHeader({
  backHref,
  backLabel,
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
  name: string;
  /** Omit for an entity with no photo slot at all (a circuit: its layout is drawn below). */
  photoUrl?: string | null;
  photoShape?: "circle" | "square";
  subtitle: string;
  /** The headline about this entity, in one sentence. */
  answer?: string | null;
  stats: { label: string; value: string | number; detail?: string }[];
  favoriteButton?: React.ReactNode;
  /** A team colour behind the photo, when the entity has one. */
  accent?: string | null;
}) {
  return (
    <header className="mb-12">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-body-sm">
        <Link href={backHref} className="text-secondary transition-colors hover:text-primary">
          {backLabel}
        </Link>
        <span aria-hidden className="text-tertiary">
          /
        </span>
        <span className="truncate text-primary" aria-current="page">
          {name}
        </span>
      </nav>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        {photoUrl !== undefined && (
          <div className="relative shrink-0 self-start sm:self-center">
            {accent && <span aria-hidden className="absolute -inset-2 rounded-full opacity-40 blur-2xl" style={{ background: accent }} />}
            <EntityAvatar imageUrl={photoUrl} name={name} size={112} shape={photoShape} fit={photoShape === "square" ? "contain" : "cover"} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-secondary">{subtitle}</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="min-w-0 text-display-lg font-bold text-primary sm:text-display-xl">{name}</h1>
            {favoriteButton}
          </div>
          {answer && (
            <p className="mt-3 max-w-3xl text-title-md text-primary" aria-live="polite">
              <Typewriter text={answer} msPerChar={14} />
            </p>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-subtle py-5 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-12">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-caption text-secondary">{s.label}</dt>
              <dd className="mt-1 text-title-md font-semibold tabular text-primary">{s.value}</dd>
              {s.detail && <dd className="mt-0.5 truncate text-caption text-secondary">{s.detail}</dd>}
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
