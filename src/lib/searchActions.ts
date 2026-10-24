// The command palette's actions: things to do, not just places to go. Pure, so the registry and the
// "<driver> vs <driver>" reading can be tested; the search route fills in the context.
import { matchScore, normalise, rankMatches, type SearchResult } from "./searchQuery";

export type ActionContext = {
  season: number;
  nextRace: { name: string; href: string } | null;
  communities: { id: string; name: string; href: string }[];
  /** Current drivers, for "Compare A vs B". */
  drivers: { code: string; name: string }[];
  hrefs: {
    season: string;
    archive: string;
    circuits: string;
    communities: string;
    profile: string;
    notifications: string;
    predictions: string;
    account: string;
    reportProblem: string;
    /** The season compare panel with two drivers selected. */
    compare: (a: string, b: string) => string;
  };
};

/** The two drivers in "VER vs NOR", "compare norris and piastri", "hamilton v leclerc"; null otherwise. */
export function parseCompare(query: string, drivers: ActionContext["drivers"]): [ActionContext["drivers"][number], ActionContext["drivers"][number]] | null {
  const q = normalise(query).replace(/^compare\s+/, "");
  const parts = q.split(/\s+(?:vs\.?|v|versus|and|with|&)\s+/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const find = (text: string) => drivers.find((d) => d.code.toLowerCase() === text) ?? drivers.find((d) => matchScore(text, d.name) !== null && matchScore(text, d.name)! <= 1);
  const a = find(parts[0].trim());
  const b = find(parts[1].trim());
  return a && b && a.code !== b.code ? [a, b] : null;
}

/** Every action the viewer can take right now, before any query filters them. */
export function buildActions(ctx: ActionContext): SearchResult[] {
  const action = (label: string, href: string, detail?: string, external?: boolean): SearchResult => ({ kind: "action", label, href, detail, ...(external ? { external } : {}) });
  return [
    ...(ctx.nextRace ? [action(`Make your picks for the ${ctx.nextRace.name}`, ctx.nextRace.href, "Predict the podium")] : []),
    ...ctx.communities.map((c) => action(`Open ${c.name}`, c.href, "Community")),
    action("Turn on race reminders", ctx.hrefs.notifications, "Emails before qualifying and when results are in"),
    action("See my predictions", ctx.hrefs.predictions, "Your season scorecard"),
    action("Export my data", ctx.hrefs.account, "Download everything Apex holds about you"),
    action("Report a problem", ctx.hrefs.reportProblem, "Tell us what went wrong", true),
    action("Compare two drivers", ctx.hrefs.compare("", ""), `The ${ctx.season} compare panel`),
    action("Go to Season", ctx.hrefs.season, `${ctx.season} standings and races`),
    action("Go to Circuits", ctx.hrefs.circuits, "Every track on the calendar"),
    action("Go to Archive", ctx.hrefs.archive, "Every race since 1950"),
    action("Go to Communities", ctx.hrefs.communities, "Feeds, predictions and leagues"),
    action("Go to Profile", ctx.hrefs.profile, "Your account and favourites"),
  ];
}

/** The actions a query asks for: a "<driver> vs <driver>" compare first, then the actions whose label matches. */
export function matchActions(query: string, ctx: ActionContext, limit = 6): SearchResult[] {
  const all = buildActions(ctx);
  const pair = parseCompare(query, ctx.drivers);
  const compare: SearchResult[] = pair ? [{ kind: "action", label: `Compare ${pair[0].name} vs ${pair[1].name}`, detail: `The ${ctx.season} compare panel`, href: ctx.hrefs.compare(pair[0].code, pair[1].code) }] : [];
  if (!query.trim()) return [...compare, ...all].slice(0, limit);
  const matched = rankMatches(query, all, (a) => [a.label, a.label.replace(/^(Go to|Open|Make your|Turn on|See|Export|Report)\s+/i, "")], (a) => a, limit);
  return [...compare, ...matched].slice(0, limit);
}
