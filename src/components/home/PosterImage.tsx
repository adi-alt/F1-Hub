import Image from "next/image";

/** A driver/track photo treated like a poster, not a thumbnail — tall aspect ratio, full-bleed
 * image, title/subtitle legible over a bottom gradient rather than sitting in a caption below it.
 * Falls back to a big initial-letter block (same "we don't have this yet" honesty as
 * EntityAvatar, just sized up) when there's no photo — a lot of pre-1970s archive drivers
 * genuinely have no free-licensed image available at all. */
export function PosterImage({
  imageUrl,
  title,
  subtitle,
  accentColor,
}: {
  imageUrl: string | null;
  title: string;
  subtitle?: string;
  accentColor?: string | null;
}) {
  const accent = accentColor ? `#${accentColor}` : "var(--f1-red)";

  if (!imageUrl) {
    return (
      <div
        className="relative flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4 text-center"
        style={accentColor ? { boxShadow: `inset 0 0 0 1px ${accent}44` } : undefined}
      >
        <span className="text-6xl font-bold" style={{ color: accent }}>
          {title.charAt(0).toUpperCase()}
        </span>
        <div>
          <p className="font-semibold text-white">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-[var(--f1-line)]">
      <Image src={imageUrl} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-lg font-bold leading-tight text-white">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-neutral-300">{subtitle}</p>}
      </div>
    </div>
  );
}
