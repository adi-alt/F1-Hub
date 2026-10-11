/**
 * Colour contrast for marks that carry meaning: a team's bar beside a driver, a segment in a probability
 * meter, a line in a chart. WCAG 2.2 (1.4.11) asks 3:1 for non-text marks, and some team colours are too dark
 * to see on the app's surfaces (historical ones especially: Tyrrell's #002d62 is barely 1.3:1 on surface-1).
 * `ensureVisible` lightens a colour in OKLCH, keeping its hue, until it reaches the ratio (design system
 * spec §2.3). Pure functions, no DOM: safe on the server and in tests.
 */

/** The surface most marks sit on (`--surface-1` in globals.css). */
export const SURFACE_1 = "#16161a";

type Rgb = [number, number, number]; // 0..1, sRGB

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** "#rgb", "#rrggbb", "rgb(r, g, b)" or "hsl(h, s%, l%)" (teamColors' fallback). Null when unreadable. */
export function parseColor(input: string): Rgb | null {
  const value = input.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255) as Rgb;
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  const hsl = value.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (hsl) {
    const h = Number(hsl[1]) / 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t: number) => {
      const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
  }
  return null;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** The WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// sRGB <-> OKLab (Björn Ottosson's matrices). OKLCH is OKLab with the a/b plane in polar form; raising L
// alone keeps the hue and, as far as the gamut allows, the chroma.
function rgbToOklab([r, g, b]: Rgb): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function oklabToRgb([L, a, b]: [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp01(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/**
 * `color`, lightened in OKLCH just enough to reach `minRatio` against `surface` (3:1 by default, the
 * non-text contrast minimum). A colour that already passes comes back unchanged (as given); one that can't
 * be read comes back unchanged too, since guessing a replacement colour would misattribute a team.
 */
export function ensureVisible(color: string, surface: string = SURFACE_1, minRatio = 3): string {
  const rgb = parseColor(color);
  if (!rgb || contrastRatio(color, surface) >= minRatio) return color;
  const [L, a, b] = rgbToOklab(rgb);
  for (let next = L + 0.02; next <= 1; next += 0.02) {
    const candidate = toHex(oklabToRgb([next, a, b]));
    if (contrastRatio(candidate, surface) >= minRatio) return candidate;
  }
  return "#ffffff";
}
