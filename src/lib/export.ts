// Zero-dependency table/chart export helpers backing ExportMenu (src/components/export/ExportMenu.tsx).
// Two image strategies: a live recharts <svg> just gets rasterized (svgToCanvas); a table has no
// single node like that, and rasterizing arbitrary styled DOM without a library is fragile, so it
// draws a clean on-brand image straight from the same rows shown on screen (tableToCanvas).

export function rowsToCSV(columns: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string, mime = "text/csv"): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

// Safari/Firefox's async Clipboard API only ever accepts image/png regardless of the blob's own
// type — a caller asking for jpeg still gets a real jpeg blob, it just may land on the clipboard
// tagged as png there; ExportMenu falls back to a download if the write throws outright.
export async function copyImageBlob(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
}

/** Rasterizes a live recharts SVG at 2x for a crisp copy/download, not a blurry 1:1 screen grab.
 * JPEG has no alpha channel, so the canvas gets an explicit background fill first or a
 * transparent chart background would turn solid black. */
export async function svgToCanvas(svg: SVGSVGElement, background = "#18181b"): Promise<HTMLCanvasElement> {
  const width = svg.clientWidth || Number(svg.getAttribute("width")) || 600;
  const height = svg.clientHeight || Number(svg.getAttribute("height")) || 300;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("svg image load failed"));
      image.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.scale(scale, scale);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const TABLE_COLORS = { background: "#18181b", header: "#27272a", line: "#4a2624", headLabel: "#a3a3a3", primary: "#ffffff", secondary: "#d4d4d4" };

/** Draws a clean grid image straight from the same (columns, rows) ExportMenu's raw-data actions
 * use — not a pixel-for-pixel screenshot of the real table, but on-brand and always in sync with
 * what's on screen. */
export function tableToCanvas(columns: string[], rows: (string | number)[][]): HTMLCanvasElement {
  const scale = 2;
  const rowHeight = 32;
  const padX = 16;
  const font = "13px -apple-system, system-ui, sans-serif";
  const headerFont = "bold 11px -apple-system, system-ui, sans-serif";

  const measurer = document.createElement("canvas").getContext("2d");
  if (!measurer) throw new Error("no 2d context");
  const colWidths = columns.map((col, i) => {
    measurer.font = headerFont;
    let max = measurer.measureText(col.toUpperCase()).width;
    measurer.font = font;
    for (const row of rows) max = Math.max(max, measurer.measureText(String(row[i] ?? "")).width);
    return max + padX * 2;
  });
  const width = colWidths.reduce((a, b) => a + b, 0);
  const height = rowHeight * (rows.length + 1);

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";

  ctx.fillStyle = TABLE_COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = TABLE_COLORS.header;
  ctx.fillRect(0, 0, width, rowHeight);

  let x = 0;
  columns.forEach((col, i) => {
    ctx.fillStyle = TABLE_COLORS.headLabel;
    ctx.font = headerFont;
    ctx.fillText(col.toUpperCase(), x + padX, rowHeight / 2);
    x += colWidths[i];
  });

  rows.forEach((row, r) => {
    const y = rowHeight * (r + 1);
    ctx.strokeStyle = TABLE_COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    let cx = 0;
    row.forEach((cell, i) => {
      ctx.fillStyle = i === 0 ? TABLE_COLORS.primary : TABLE_COLORS.secondary;
      ctx.font = font;
      ctx.fillText(String(cell ?? ""), cx + padX, y + rowHeight / 2);
      cx += colWidths[i];
    });
  });

  return canvas;
}
