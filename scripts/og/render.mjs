// Renders the share card and the icons from their sources in this folder:
//   og-image.html -> public/og-image.png (1200x630, the link-preview picture; lib/seo.ts)
//   icon.svg      -> src/app/icon.svg, src/app/favicon.ico (16/32/48), src/app/apple-icon.png (180),
//                    public/icon-192.png and public/icon-512.png (app/manifest.ts)
// Run after editing either source: node scripts/og/render.mjs
import { chromium } from "playwright";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const iconSvg = readFileSync(join(here, "icon.svg"), "utf8");

/** An .ico holding PNG images (supported by every browser since IE Vista-era): a 6-byte header, a 16-byte entry
 * per image, then the PNGs themselves. */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const browser = await chromium.launch();

// The share card, with its web font loaded before the shot.
const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await card.goto("file://" + join(here, "og-image.html"), { waitUntil: "networkidle" });
await card.evaluate(() => document.fonts.ready);
await card.screenshot({ path: join(root, "public", "og-image.png") });

// The icon at each size. The Apple icon is full-bleed (iOS rounds the corners itself).
async function iconPng(size, { square = false } = {}) {
  const svg = square ? iconSvg.replace('rx="7"', 'rx="0"') : iconSvg;
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  const data = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return data;
}

writeFileSync(join(root, "src", "app", "favicon.ico"), ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await iconPng(size) })))));
writeFileSync(join(root, "src", "app", "apple-icon.png"), await iconPng(180, { square: true }));
writeFileSync(join(root, "public", "icon-192.png"), await iconPng(192));
writeFileSync(join(root, "public", "icon-512.png"), await iconPng(512));
copyFileSync(join(here, "icon.svg"), join(root, "src", "app", "icon.svg"));

await browser.close();
console.log("Rendered public/og-image.png, src/app/{icon.svg,favicon.ico,apple-icon.png}, public/icon-{192,512}.png");
