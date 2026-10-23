#!/usr/bin/env node
// Fails when a source file under src/ has no importers (audit R-35): dead files pile up silently because
// nothing type-checks or lints a file nobody imports. Every import, re-export, dynamic import() and
// mockModule("...") specifier in src/, scripts/ and e2e/ is resolved ('@/' is src/); a file under src/ that
// none of them reaches, and that isn't an entry point Next or the test runner loads by name, is reported.
//
//   node scripts/unused-files.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXTS = [".ts", ".tsx", ".mjs", ".js", ".json", ".css"];

// Loaded by name, not by import: Next's file conventions, its instrumentation and proxy, and tests.
const ENTRY = [
  /^src\/app\/(.+\/)?(page|layout|route|loading|error|global-error|not-found|template|default|manifest|sitemap|robots|opengraph-image|twitter-image|icon|apple-icon)\.(ts|tsx)$/,
  /^src\/(instrumentation|instrumentation-client|proxy)\.ts$/,
  /\.test\.tsx?$/,
  /^src\/app\/globals\.css$/,
];
// Kept on purpose though nothing imports them. Each needs a reason.
const ALLOW = new Map([]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return EXTS.includes(path.extname(e.name)) ? [p] : [];
  });
}

function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  // `import x from "./a.mjs"` written as .js, or a .ts file imported as .js
  const noExt = base.replace(/\.(m?js)$/, "");
  for (const e of [".ts", ".tsx"]) if (fs.existsSync(noExt + e)) return noExt + e;
  return null;
}

const SPEC = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*|mockModule\s*\(\s*)["']([^"']+)["']/g;
const sources = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts")), ...walk(path.join(ROOT, "e2e")), path.join(ROOT, "next.config.ts"), path.join(ROOT, "playwright.config.ts")];
const imported = new Set();
for (const file of sources) {
  if (![".ts", ".tsx", ".mjs", ".js"].includes(path.extname(file))) continue;
  for (const [, spec] of fs.readFileSync(file, "utf8").matchAll(SPEC)) {
    const target = resolve(file, spec);
    if (target && target !== file) imported.add(target);
  }
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const unused = walk(path.join(ROOT, "src"))
  .filter((f) => [".ts", ".tsx"].includes(path.extname(f)))
  .map(rel)
  .filter((f) => !imported.has(path.join(ROOT, f)) && !ENTRY.some((re) => re.test(f)) && !ALLOW.has(f))
  .sort();

const staleAllow = [...ALLOW.keys()].filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (staleAllow.length) console.log(`allowlisted but gone (remove from ALLOW): ${staleAllow.join(", ")}`);
if (unused.length) {
  console.log(`${unused.length} file(s) under src/ have no importers. Delete them, or add them to ALLOW in scripts/unused-files.mjs with a reason:`);
  for (const f of unused) console.log(`  ${f}`);
}
if (unused.length || staleAllow.length) process.exit(1);
console.log("every file under src/ is imported or an entry point");
