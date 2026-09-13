// Real brand colors for teams that still exist (or existed recently enough to have a well-known
// one) — everything else (most of the 1950s-80s grid) falls back to a deterministic hash, which
// is at least *consistent* per team without pretending to know a color history that isn't
// documented anywhere reliable.
const KNOWN_TEAM_COLORS: Record<string, string> = {
  Ferrari: "#e8002d",
  Mercedes: "#27f4d2",
  "Red Bull": "#3671c6",
  McLaren: "#ff8000",
  Williams: "#64c4ff",
  "Alpine F1 Team": "#2293d1",
  Alpine: "#2293d1",
  "Aston Martin": "#229971",
  "Haas F1 Team": "#b6babd",
  Haas: "#b6babd",
  "Alfa Romeo": "#c92d4b",
  AlphaTauri: "#5e8faa",
  "RB F1 Team": "#6692ff",
  Sauber: "#52c41a",
  Lotus: "#ffb800",
  Brabham: "#0a5c36",
  Tyrrell: "#002d62",
  Benetton: "#00a651",
  Jordan: "#f7e017",
  Renault: "#ffcc00",
  "BMW Sauber": "#0e5aa7",
  "Toro Rosso": "#0032ff",
  "Force India": "#f596c8",
  "Racing Point": "#f596c8",
  Brawn: "#b8ff9f",
  Honda: "#fff200",
  Toyota: "#cc0000",
  Jaguar: "#046a38",
  Stewart: "#e6e6e6",
  Arrows: "#fc4c02",
  Ligier: "#0057b8",
  March: "#ff0000",
  Wolf: "#9a9a9a",
  BRM: "#004225",
};

function hashColor(name: string): string {
  // FNV-1a — its avalanche behavior (a one-character difference flips roughly half the output
  // bits) spreads unrelated short names across the hue wheel much better than a naive
  // hash*31+char polynomial did in practice: every backmarker team from the early-2010s grid
  // (Virgin, HRT, Lotus, ...) landed within the same narrow teal band under the old hash, because
  // short, similarly-structured strings produced similarly-clustered sums.
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 58%, 56%)`;
}

export function teamColor(constructor: string): string {
  return KNOWN_TEAM_COLORS[constructor] ?? hashColor(constructor);
}
