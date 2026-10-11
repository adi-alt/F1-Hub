// Design lint (audit DS-02; design system spec §12). Counts the class patterns the design tokens
// replace, and fails when any count grows past the recorded baseline. The counts start where the
// codebase is today and are only meant to go down: as components move onto the tokens and the
// primitives, run with --update to record the lower numbers.
//
//   node scripts/design-lint.mjs            report; exit 1 if any count is above the baseline
//   node scripts/design-lint.mjs --update   record the current counts (refuses to raise one)
//
// Deliberately a counter, not a set of ESLint errors: ~1,400 existing uses can't all be fixed in
// one change, and a ratchet stops new ones from being added while the migration happens.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = path.join(ROOT, "scripts/design-lint-baseline.json");

/** Per rule: what it replaces it with, and how one occurrence is found in a source file. */
const RULES = {
  arbitraryFontSize: {
    label: "arbitrary font size, text-[Npx] (use text-caption ... text-display-lg)",
    count: (text) => text.match(/\btext-\[\d/g)?.length ?? 0,
  },
  varClass: {
    label: "arbitrary [var(--x)] class (use the token's utility, e.g. bg-surface-1)",
    count: (text) => text.match(/\[var\(--/g)?.length ?? 0,
  },
  hexClass: {
    label: "hex colour inside a class's [...] value, e.g. bg-[#111] or shadow-[0_0_8px_#e10600] (use a colour token)",
    // One per bracketed arbitrary value that contains a hex colour anywhere in it.
    count: (text) => text.match(/\[[^\]\s"'`]*#[0-9a-fA-F]{3,8}\b[^\]\s"'`]*\]/g)?.length ?? 0,
  },
  outlineNone: {
    label: "outline-none in a class string with no focus-visible: replacement",
    // Judged per string literal, so a className split over several lines is read as one.
    count: (text) =>
      (text.match(/(["'`])(?:(?!\1)[\s\S])*?\boutline-none\b(?:(?!\1)[\s\S])*?\1/g) ?? []).filter((cls) => !cls.includes("focus-visible:")).length,
  },
};

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") out.push(...sourceFiles(full));
    } else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const totals = Object.fromEntries(Object.keys(RULES).map((rule) => [rule, 0]));
const byFile = Object.fromEntries(Object.keys(RULES).map((rule) => [rule, []]));
for (const file of sourceFiles(path.join(ROOT, "src"))) {
  const text = fs.readFileSync(file, "utf8");
  for (const [rule, { count }] of Object.entries(RULES)) {
    const n = count(text);
    if (n) {
      totals[rule] += n;
      byFile[rule].push([path.relative(ROOT, file), n]);
    }
  }
}

const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) : {};
const grown = Object.keys(RULES).filter((rule) => baseline[rule] !== undefined && totals[rule] > baseline[rule]);

if (process.argv.includes("--update")) {
  if (grown.length) {
    console.error(`Not updating: these counts are above the baseline: ${grown.join(", ")}`);
    process.exit(1);
  }
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(totals, null, 2)}\n`);
  console.log(`Baseline updated: ${JSON.stringify(totals)}`);
  process.exit(0);
}

for (const [rule, { label }] of Object.entries(RULES)) {
  const was = baseline[rule];
  const delta = was === undefined ? "no baseline" : totals[rule] === was ? "=" : totals[rule] < was ? `${totals[rule] - was} (run --update)` : `+${totals[rule] - was}`;
  console.log(`${String(totals[rule]).padStart(5)}  ${label}  [baseline ${was ?? "-"}, ${delta}]`);
}
if (grown.length) {
  for (const rule of grown) {
    const top = byFile[rule].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([file, n]) => `${file} (${n})`).join(", ");
    console.error(`\n${RULES[rule].label}: ${totals[rule]} now, ${baseline[rule]} allowed. Most in: ${top}`);
  }
  console.error("\nUse the design tokens in src/app/globals.css (spec §2) instead of adding new ones of these.");
  process.exit(1);
}
