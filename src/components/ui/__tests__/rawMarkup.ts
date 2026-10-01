// Helpers over raw opening-tag strings, for the Dialog, Toast and Skeleton markup tests: there is no
// DOM here, so they read the HTML string renderToStaticMarkup produces.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compile } from "@tailwindcss/node";

/** The first opening tag matching `pattern`; fails the test if there is none. */
export function openingTag(html: string, pattern: RegExp): string {
  const found = html.match(pattern);
  assert.ok(found, `no element matches ${pattern}`);
  return found[0];
}

/** An attribute's value on an opening tag, or undefined when it isn't there. */
export function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

export function classesOf(tag: string): string[] {
  return attr(tag, "class")?.split(/\s+/) ?? [];
}

/** Fails unless `tag` carries every one of `expected`. */
export function assertClasses(tag: string, expected: string[]) {
  const classes = classesOf(tag);
  for (const cls of expected) assert.ok(classes.includes(cls), `missing ${cls} in ${tag}`);
}

const APP_DIR = path.join(process.cwd(), "src/app");
const compiler = () => compile(fs.readFileSync(path.join(APP_DIR, "globals.css"), "utf8"), { base: APP_DIR, onDependency: () => {} });

/**
 * Every class in `html` that Tailwind, compiled against the real globals.css, generates no CSS
 * for. Tailwind silently ignores a class it doesn't know, so a mistyped token (rounded-overly) would
 * otherwise only show up as a missing style in the browser. lucide's own marker classes are skipped.
 */
export async function classesWithoutCss(html: string): Promise<string[]> {
  const classes = new Set(
    [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((cls) => cls && !cls.startsWith("lucide")),
  );
  // A fresh compiler: build() accumulates, so it reports a class as new only once.
  const tailwind = await compiler();
  let size = tailwind.build([]).length;
  const missing: string[] = [];
  for (const cls of classes) {
    const next = tailwind.build([cls]).length;
    if (next === size) missing.push(cls);
    size = next;
  }
  return missing;
}

/** The CSS Tailwind generates for these classes, to assert on what a class really does. */
export async function cssFor(classes: string[]): Promise<string> {
  return (await compiler()).build(classes);
}
