// A pure, dependency-free lookup (client-safe - see groupPredictionTypes.ts's own comment on why
// that matters for anything a client component imports).
//
// The pipeline stores FastF1's own `Country` string on each race row. This turns that real value
// into its flag, and returns null for anything it doesn't recognise rather than guessing - a wrong
// flag next to a Grand Prix is worse than no flag, and a missing one just renders nothing.

const FLAG_BY_COUNTRY: Record<string, string> = {
  australia: "🇦🇺",
  austria: "🇦🇹",
  azerbaijan: "🇦🇿",
  bahrain: "🇧🇭",
  belgium: "🇧🇪",
  brazil: "🇧🇷",
  canada: "🇨🇦",
  china: "🇨🇳",
  france: "🇫🇷",
  germany: "🇩🇪",
  hungary: "🇭🇺",
  india: "🇮🇳",
  italy: "🇮🇹",
  japan: "🇯🇵",
  korea: "🇰🇷",
  malaysia: "🇲🇾",
  mexico: "🇲🇽",
  monaco: "🇲🇨",
  morocco: "🇲🇦",
  netherlands: "🇳🇱",
  portugal: "🇵🇹",
  qatar: "🇶🇦",
  russia: "🇷🇺",
  singapore: "🇸🇬",
  spain: "🇪🇸",
  sweden: "🇸🇪",
  switzerland: "🇨🇭",
  turkey: "🇹🇷",
  "united arab emirates": "🇦🇪",
  "united kingdom": "🇬🇧",
  "united states": "🇺🇸",
  usa: "🇺🇸",
  vietnam: "🇻🇳",
  argentina: "🇦🇷",
  "saudi arabia": "🇸🇦",
  "south africa": "🇿🇦",
};

/** Real country in, its flag out. `null` for an unmapped or missing country - callers render
 * nothing rather than a placeholder glyph. */
export function countryFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  return FLAG_BY_COUNTRY[country.trim().toLowerCase()] ?? null;
}
