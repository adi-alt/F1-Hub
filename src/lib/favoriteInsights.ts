// Which of Apex's insights belongs on which favourite's card (home page, "Your drivers and teams"). Pure: tested
// without the AI.

type Intelligence = {
  favoriteInsights?: Array<{ name: string; insight: string }> | null;
  favoriteDriverInsight?: string | null;
  favoriteTeamInsight?: string | null;
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const surname = (s: string) => norm(s).split(" ").at(-1) ?? "";
const mentions = (text: string, word: string) => word.length > 2 && new RegExp(`\\b${word}\\b`).test(norm(text));

/**
 * The insight for one card: the model's own entry for that name (exactly, else by surname, since a name can be
 * written "Kimi Antonelli" or "Andrea Kimi Antonelli"). A response from before favoriteInsights existed had only one
 * driver and one team insight, about whichever favourite the model chose: that one shows only on the card it is
 * about (the text names it), never on another card by position.
 */
export function insightFor(intel: Intelligence | null | undefined, kind: "driver" | "team", name: string): string | null {
  if (!intel) return null;
  const list = intel.favoriteInsights ?? [];
  if (list.length) {
    const exact = list.find((e) => norm(e.name) === norm(name));
    if (exact) return exact.insight;
    const last = surname(name);
    const bySurname = list.find((e) => surname(e.name) === last);
    return bySurname?.insight ?? null;
  }
  const legacy = kind === "driver" ? intel.favoriteDriverInsight : intel.favoriteTeamInsight;
  if (!legacy) return null;
  const key = kind === "driver" ? surname(name) : norm(name).split(" ")[0];
  return mentions(legacy, key) ? legacy : null;
}
