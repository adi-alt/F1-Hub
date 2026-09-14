import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";

/**
 * The compact header every Archive entity detail page (driver/team/circuit) shares - a real
 * photo, name, one-line range/count subtitle, and a row of real computed stats. Replaces each
 * page's own ad hoc "back link + h1 + one paragraph" with one consistent shape, per the shared
 * Archive component architecture - not a giant hero, just enough context before the explorer
 * below it takes over the page.
 */
export function ArchiveEntityHeader({
  backHref,
  backLabel,
  name,
  photoUrl,
  photoShape = "circle",
  subtitle,
  stats,
  favoriteButton,
}: {
  backHref: string;
  backLabel: string;
  name: string;
  photoUrl: string | null;
  photoShape?: "circle" | "square";
  subtitle: string;
  stats: { label: string; value: string | number }[];
  favoriteButton?: React.ReactNode;
}) {
  return (
    <header className="shrink-0">
      <Link href={backHref} className="text-xs text-neutral-500 transition hover:text-neutral-300">
        ← {backLabel}
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <EntityAvatar imageUrl={photoUrl} name={name} size={44} shape={photoShape} fit={photoShape === "square" ? "contain" : "cover"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold text-white sm:text-3xl">{name}</h1>
            {favoriteButton}
          </div>
          <p className="text-sm text-neutral-500">{subtitle}</p>
        </div>
      </div>
      {stats.length > 0 && (
        <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-8">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">{s.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
