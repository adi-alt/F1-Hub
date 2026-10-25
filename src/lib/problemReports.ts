/** "Report a problem": the kinds, the limits and the checks, shared by the dialog and the API. Pure. */

export const PROBLEM_KINDS = [
  { value: "broken", label: "Something's broken" },
  { value: "data", label: "Wrong data" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Other" },
] as const;

export type ProblemKind = (typeof PROBLEM_KINDS)[number]["value"];
export type ProblemStatus = "open" | "resolved";

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;
export const SCREENSHOT_MAX_BYTES = 1024 * 1024;
export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** What the browser attaches on its own. Every value is display text for an admin, never trusted. */
export type ProblemContext = Partial<Record<"url" | "section" | "viewport" | "userAgent" | "version" | "error", string>>;
const CONTEXT_KEYS = ["url", "section", "viewport", "userAgent", "version", "error"] as const;

export function problemKindLabel(kind: string): string {
  return PROBLEM_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function isProblemKind(value: unknown): value is ProblemKind {
  return PROBLEM_KINDS.some((k) => k.value === value);
}

/** Known keys only, strings only, each capped at 500 characters. */
export function cleanContext(input: unknown): ProblemContext {
  const out: ProblemContext = {};
  if (!input || typeof input !== "object") return out;
  for (const key of CONTEXT_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 500);
  }
  return out;
}

/** The page as a site path ("/season"), from the context's URL; null when it isn't one of ours. */
export function pageFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, "http://local");
    return (u.pathname + u.search).slice(0, 500);
  } catch {
    return null;
  }
}

export type ReportInput = { kind: ProblemKind; description: string; context: ProblemContext };

/** The report, checked, or the reason it can't be sent. */
export function validateReport(raw: { kind: unknown; description: unknown; context: unknown }): ReportInput | { error: string } {
  if (!isProblemKind(raw.kind)) return { error: "Choose what kind of problem it is." };
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (description.length < DESCRIPTION_MIN) return { error: `Describe it in at least ${DESCRIPTION_MIN} characters.` };
  if (description.length > DESCRIPTION_MAX) return { error: `Keep it under ${DESCRIPTION_MAX} characters.` };
  return { kind: raw.kind, description, context: cleanContext(raw.context) };
}

/** A screenshot's problem, or null when it's fine to keep. */
export function screenshotError(file: { type: string; size: number }): string | null {
  if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type)) return "Screenshots can be PNG, JPEG or WebP.";
  if (file.size > SCREENSHOT_MAX_BYTES) return "Screenshots are limited to 1 MB.";
  return null;
}
