// Design tokens (audit DS-01; design system spec §2): every token exists with the spec's value and
// works as a Tailwind utility. Compiles the real src/app/globals.css with Tailwind's own compiler,
// so a renamed variable or a broken @theme mapping fails here instead of silently generating no CSS
// (Tailwind only emits a class it finds in use, so an unused broken token is otherwise invisible).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compile } from "@tailwindcss/node";

const APP_DIR = path.join(process.cwd(), "src/app");
const css = fs.readFileSync(path.join(APP_DIR, "globals.css"), "utf8");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Spec §2.1, §2.2 and §2.6 values. */
const SPEC_VALUES: Record<string, string> = {
  "--surface-0": "#09090b",
  "--surface-1": "#16161a",
  "--surface-2": "#212126",
  "--surface-3": "#2c2c32",
  "--surface-inverse": "#f4f4f5",
  "--border-subtle": "#303037",
  "--border-strong": "#72727d",
  "--border-strong-raised": "#84848f",
  "--text-primary": "#f4f4f5",
  "--text-secondary": "#a9a9b2",
  "--text-tertiary": "#9a9aa4",
  "--text-disabled": "#5c5c66",
  "--brand": "#e10600",
  "--brand-hover": "#c80500",
  "--brand-text": "#ff5c52",
  "--danger": "#ff6b63",
  "--danger-fill": "#b3261e",
  "--danger-subtle": "rgb(255 107 99 / 0.1)",
  "--success": "#3fcf8e",
  "--warning": "#f2b53a",
  "--info": "#6aa9ff",
  "--focus-ring": "#f4f4f5",
  "--duration-fast": "120ms",
  "--duration-base": "200ms",
  "--duration-slow": "320ms",
};

const value = (name: string) => css.match(new RegExp(`${escapeRe(name)}:\\s*([^;]+);`))?.[1].trim();

test("every spec token is defined with the spec's value", () => {
  for (const [name, expected] of Object.entries(SPEC_VALUES)) assert.equal(value(name), expected, name);
  assert.match(css, /color-scheme:\s*dark;/);
});

test("nothing changes visually: only the old variables that had a token's exact value point at it", () => {
  assert.equal(value("--background"), "var(--surface-0)");
  assert.equal(SPEC_VALUES["--surface-0"], "#09090b", "what --background was");
  assert.equal(value("--f1-red"), "var(--brand)");
  assert.equal(SPEC_VALUES["--brand"], "#e10600", "what --f1-red was");
  for (const old of ["--foreground", "--f1-red-dim", "--f1-carbon", "--f1-carbon-2", "--f1-line"]) {
    assert.match(value(old) ?? "", /^#[0-9a-f]{6}$/, `${old} keeps its own value until its users migrate`);
  }
});

/** Each token's utility and the declaration it must produce. */
const UTILITIES: Record<string, RegExp> = {
  "bg-surface-0": /background-color: var\(--surface-0\)/,
  "bg-surface-1": /background-color: var\(--surface-1\)/,
  "bg-surface-2": /background-color: var\(--surface-2\)/,
  "bg-surface-3": /background-color: var\(--surface-3\)/,
  "bg-surface-inverse": /background-color: var\(--surface-inverse\)/,
  "border-subtle": /border-color: var\(--border-subtle\)/,
  "border-strong": /border-color: var\(--border-strong\)/,
  "border-strong-raised": /border-color: var\(--border-strong-raised\)/,
  "text-primary": /color: var\(--text-primary\)/,
  "text-secondary": /color: var\(--text-secondary\)/,
  "text-tertiary": /color: var\(--text-tertiary\)/,
  "text-disabled": /color: var\(--text-disabled\)/,
  "bg-brand": /background-color: var\(--brand\)/,
  "bg-brand-hover": /background-color: var\(--brand-hover\)/,
  "text-brand-text": /color: var\(--brand-text\)/,
  "text-danger": /color: var\(--danger\)/,
  "bg-danger-fill": /background-color: var\(--danger-fill\)/,
  "bg-danger-subtle": /background-color: var\(--danger-subtle\)/,
  "text-success": /color: var\(--success\)/,
  "text-warning": /color: var\(--warning\)/,
  "text-info": /color: var\(--info\)/,
  "outline-focus-ring": /outline-color: var\(--focus-ring\)/,
  "text-display-lg": /font-size: var\(--text-display-lg\)/,
  "text-display-md": /font-size: var\(--text-display-md\)/,
  "text-title-lg": /font-size: var\(--text-title-lg\)/,
  "text-title-md": /font-size: var\(--text-title-md\)/,
  "text-body": /font-size: var\(--text-body\)/,
  "text-body-sm": /font-size: var\(--text-body-sm\)/,
  "text-caption": /font-size: var\(--text-caption\)/,
  "rounded-control": /border-radius: var\(--radius-control\)/,
  "rounded-card": /border-radius: var\(--radius-card\)/,
  "rounded-overlay": /border-radius: var\(--radius-overlay\)/,
  "shadow-overlay": /0 12px 32px/,
  "ease-standard": /transition-timing-function: var\(--ease-standard\)/,
  "z-base": /z-index: 0/,
  "z-sticky": /z-index: 10/,
  "z-header": /z-index: 20/,
  "z-popover": /z-index: 30/,
  "z-dialog": /z-index: 40/,
  "z-toast": /z-index: 50/,
  "duration-fast": /transition-duration: var\(--duration-fast\)/,
  "duration-base": /transition-duration: var\(--duration-base\)/,
  "duration-slow": /transition-duration: var\(--duration-slow\)/,
  tabular: /font-variant-numeric: tabular-nums/,
  // The opaque fallback Tailwind emits ahead of color-mix(); the frosted value is checked below.
  "surface-glass": /background-color: var\(--surface-1\)/,
};

test("every token works as a Tailwind utility", async () => {
  const compiler = await compile(css, { base: APP_DIR, onDependency: () => {} });
  const out = compiler.build(Object.keys(UTILITIES));
  for (const [cls, expected] of Object.entries(UTILITIES)) {
    const selector = escapeRe(`.${cls}`);
    const rule = out.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`))?.[1];
    assert.ok(rule, `${cls} generates no CSS`);
    assert.match(rule, expected, cls);
  }
});

test("surface-glass is frosted: translucent surface-1 over a blur, with a hairline edge", async () => {
  const compiler = await compile(css, { base: APP_DIR, onDependency: () => {} });
  const out = compiler.build(["surface-glass"]);
  assert.match(out, /background-color: color-mix\(in srgb, var\(--surface-1\) 70%, transparent\)/);
  assert.match(out, /-webkit-backdrop-filter: blur\(24px\) saturate\(160%\)/);
  assert.match(out, /\sbackdrop-filter: blur\(24px\) saturate\(160%\)/);
  assert.match(out, /border: 1px solid rgb\(255 255 255 \/ 0\.12\)/);
});

test("the type scale carries its line heights and weights", async () => {
  const compiler = await compile(css, { base: APP_DIR, onDependency: () => {} });
  const out = compiler.build(["text-display-lg", "text-caption"]);
  assert.match(out, /--text-display-lg--line-height: 2\.75rem/);
  assert.match(out, /--text-display-lg--font-weight: 700/);
  assert.match(out, /--text-caption--line-height: 1rem/);
});

test("the header and the Apex launcher sit on the token scale, below dialogs and sheets", () => {
  // At z-50 the header covered a dialog's top edge on a short phone and stayed undimmed behind its
  // scrim; at z-[90] the Apex launcher sat on top of the mobile menu sheet.
  const read = (file: string) => fs.readFileSync(path.join(APP_DIR, "..", file), "utf8");
  const header = read("components/Header.tsx");
  assert.match(header, /<header className="relative z-header /);
  const apex = read("components/apex/ApexLauncher.tsx");
  assert.equal((apex.match(/\bz-popover\b/g) ?? []).length >= 2, true);
  for (const [name, source] of [["Header", header], ["ApexLauncher", apex]] as const) {
    assert.doesNotMatch(source, /\bz-\[\d+\]|\bz-50\b/, `${name} uses a hard-coded z-index`);
  }
});
