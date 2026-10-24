// The command palette's cheap, AI-free query understanding: what a typed query asks for (a command, a
// year, a driver code, a team nickname, a question for Apex) and how well a text matches it, typos
// included. Pure and client-safe: the palette and the search route read queries the same way.

import type { AvatarConfig } from "@/lib/avatar";

export type SearchKind = "action" | "section" | "driver" | "team" | "circuit" | "race" | "season" | "community" | "person";

/** One palette row. Everything but kind/label/href is optional decoration the row draws if present. */
export type SearchResult = {
  kind: SearchKind;
  label: string;
  detail?: string;
  href: string;
  /** Opens in a new tab (off-site). */
  external?: boolean;
  /** A headshot, team logo or community avatar. */
  image?: string | null;
  /** The team colour, as a CSS colour. */
  color?: string | null;
  /** A short right-aligned figure: "P1 · 412 pts", "Next 7 Nov", "24 members". */
  meta?: string;
  /** A track outline thumbnail. */
  shape?: { path: string; viewBox: string } | null;
  /** A person's built avatar (PersonAvatar). */
  person?: { id: string; avatar: AvatarConfig | null };
};

/** The palette's groups, in the order they're shown. */
export const KIND_ORDER: SearchKind[] = ["action", "race", "driver", "team", "circuit", "season", "community", "person", "section"];
export const KIND_HEADING: Record<SearchKind, string> = {
  action: "Actions",
  section: "Go to",
  driver: "Drivers",
  team: "Teams",
  circuit: "Circuits",
  race: "Races",
  season: "Seasons",
  community: "Communities",
  person: "People",
};

/** Nicknames people actually type for teams, to the text of the team's name. */
export const TEAM_ALIASES: Record<string, string> = {
  rbr: "red bull",
  redbull: "red bull",
  bulls: "red bull",
  mercs: "mercedes",
  merc: "mercedes",
  silver: "mercedes",
  scuderia: "ferrari",
  sf: "ferrari",
  macca: "mclaren",
  papaya: "mclaren",
  amr: "aston martin",
  aston: "aston martin",
  vcarb: "racing bulls",
  tororosso: "toro rosso",
  str: "toro rosso",
  kick: "sauber",
};

export type ParsedQuery = {
  /** The query as typed, trimmed. */
  raw: string;
  /** "actions" when it starts with ">", "empty" when there's nothing to search yet. */
  mode: "empty" | "actions" | "search";
  /** What to match against names: the query without its year and ">", with a team nickname expanded. */
  text: string;
  /** A four-digit year in the query, 1950-2099. */
  year: number | null;
  /** The query is exactly a three-letter driver code ("VER", "nor"). */
  code: string | null;
  /** It reads as a question for Apex rather than a name to look up. */
  question: boolean;
};

const QUESTION_START = /^(who|what|when|where|why|how|which|whose|is|are|was|were|does|did|do|can|could|will|would|should|has|have|tell me|explain)\b/i;

/** A question, not a lookup: ends with "?", or starts like one and is at least three words long. */
export function looksLikeQuestion(query: string): boolean {
  const q = query.trim();
  if (q.length < 6) return false;
  if (q.endsWith("?")) return true;
  return QUESTION_START.test(q) && q.split(/\s+/).length >= 3;
}

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim();
  if (raw.startsWith(">")) return { raw, mode: "actions", text: raw.slice(1).trim(), year: null, code: null, question: false };
  const yearMatch = raw.match(/\b(19[5-9]\d|20\d\d)\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  let text = (yearMatch ? raw.replace(yearMatch[0], " ") : raw).replace(/\s+/g, " ").trim();
  const alias = TEAM_ALIASES[normalise(text).replace(/\s+/g, "")];
  if (alias) text = alias;
  const code = /^[a-z]{3}$/i.test(raw) ? raw.toUpperCase() : null;
  const mode = raw.length === 0 || (text.length < 2 && year === null) ? "empty" : "search";
  return { raw, mode, text, year, code, question: looksLikeQuestion(raw) };
}

export const normalise = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Levenshtein distance, giving up (returning max + 1) once it can't be within `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for a query word: none under 4 letters, one up to 6, two beyond. */
const typoBudget = (word: string) => (word.length < 4 ? 0 : word.length <= 6 ? 1 : 2);

/** A query word within its typo budget of a word, or of the start of one (a typo in a half-typed name). */
function nearWord(queryWord: string, words: string[]): boolean {
  const budget = typoBudget(queryWord);
  if (budget === 0) return false;
  return words.some((w) => editDistance(queryWord, w, budget) <= budget || (w.length > queryWord.length && editDistance(queryWord, w.slice(0, queryWord.length), budget) <= budget));
}

/**
 * 0: the text starts with the query, 1: a word in it does, 2: it contains it, 3: every query word is a typo away from
 * a word in it ("verstapen", "hamiltn"); null: no match. Accents and case are ignored.
 */
export function matchScore(query: string, ...texts: (string | null | undefined)[]): number | null {
  const q = normalise(query);
  if (!q) return null;
  const qWords = q.split(/\s+/);
  let best: number | null = null;
  for (const text of texts) {
    if (!text) continue;
    const t = normalise(text);
    const words = t.split(/[\s\-/]+/);
    let score: number | null = t.startsWith(q) ? 0 : words.some((w) => w.startsWith(q)) ? 1 : t.includes(q) ? 2 : null;
    if (score === null && qWords.every((qw) => nearWord(qw, words))) score = 3;
    if (score !== null && (best === null || score < best)) best = score;
  }
  return best;
}

/** The best `limit` matches of one kind, best first, then shortest label. */
export function rankMatches<T>(query: string, items: readonly T[], texts: (item: T) => (string | null | undefined)[], toResult: (item: T) => SearchResult, limit = 5): SearchResult[] {
  return items
    .map((item) => ({ item, score: matchScore(query, ...texts(item)) }))
    .filter((m): m is { item: T; score: number } => m.score !== null)
    .sort((a, b) => a.score - b.score || toResult(a.item).label.length - toResult(b.item).label.length)
    .slice(0, limit)
    .map((m) => toResult(m.item));
}

/** Results grouped for the palette, in KIND_ORDER, each group's rows in the order given. */
export function groupResults(results: SearchResult[]): { kind: SearchKind; heading: string; items: SearchResult[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, heading: KIND_HEADING[kind], items: results.filter((r) => r.kind === kind) })).filter((g) => g.items.length > 0);
}
