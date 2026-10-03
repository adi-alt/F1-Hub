// Shared by the ui primitive tests: build elements, read the static markup they render, and check
// that every class in it is a real Tailwind utility. Not a test file itself (no .test.ts suffix).

import fs from "node:fs";
import path from "node:path";
import { createElement, type Attributes, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import { compile } from "@tailwindcss/node";

/** createElement for a component whose props require `children`: they go in as arguments (as
 * react/no-children-prop wants) while the other props stay type-checked. */
export function withChildren<P extends object>(type: (props: P) => ReactNode, props: Omit<P, "children"> & Attributes, ...children: unknown[]): ReactElement {
  return createElement(type as FunctionComponent<P>, props as unknown as P & Attributes, ...(children as ReactNode[]));
}

export type Tag = { name: string; attrs: Record<string, string> };

/** Every opening tag in renderToStaticMarkup output, in document order (React always double-quotes
 * attribute values and escapes < and > inside them). */
export function tags(html: string): Tag[] {
  return [...html.matchAll(/<([a-z][a-z0-9-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*\/?>/g)].map((match) => ({
    name: match[1],
    attrs: Object.fromEntries([...match[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)].map((attr) => [attr[1], attr[2] ?? ""])),
  }));
}

export function byRole(html: string, role: string): Tag[] {
  return tags(html).filter((tag) => tag.attrs.role === role);
}

export function classesOf(tag: Tag | undefined): string[] {
  return (tag?.attrs.class ?? "").split(/\s+/).filter(Boolean);
}

const APP_DIR = path.join(process.cwd(), "src/app");
/** Classes that only mark an element for another's variant (group, peer), and lucide's icon names. */
const NOT_UTILITIES = /^(group|peer)(\/[\w-]+)?$|^lucide(-|$)/;

/** The classes in `html` that Tailwind generates no CSS for. A misspelt utility or a token that
 * doesn't exist otherwise fails silently: Tailwind just emits nothing for it. */
export async function classesWithoutCss(html: string): Promise<string[]> {
  const css = fs.readFileSync(path.join(APP_DIR, "globals.css"), "utf8");
  const compiler = await compile(css, { base: APP_DIR, onDependency: () => {} });
  const classes = new Set([...html.matchAll(/\bclass="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)).filter((cls) => cls && !NOT_UTILITIES.test(cls)));
  // build() is incremental: a candidate that adds no CSS returns the previous output unchanged.
  let output = compiler.build([]);
  const missing: string[] = [];
  for (const cls of classes) {
    const next = compiler.build([cls]);
    if (next === output) missing.push(cls);
    output = next;
  }
  return missing;
}
