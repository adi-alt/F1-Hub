// .env.example is the env reference (audit R-73): every variable the app reads must be listed there, so a
// new one can't ship undocumented.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
// Set by the platform or the test runner, never configured by hand.
const PLATFORM = new Set(["NODE_ENV", "CI", "TZ", "PATH", "VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"]);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

test("every environment variable the app reads is in .env.example", () => {
  const listed = new Set([...fs.readFileSync(path.join(ROOT, ".env.example"), "utf8").matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const read = new Set<string>();
  for (const file of [...walk(path.join(ROOT, "src")), path.join(ROOT, "next.config.ts")]) {
    for (const m of fs.readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) read.add(m[1]);
  }
  assert.deepEqual([...read].filter((v) => !PLATFORM.has(v) && !listed.has(v)).sort(), []);
});
