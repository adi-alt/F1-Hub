/**
 * Renders page 1 of a PDF to a PNG, in the browser, at the moment the file is picked.
 *
 * Why here and not on the server: rasterising a PDF server-side needs a native toolchain (poppler
 * via libvips, or node-canvas) that this deployment doesn't have - `sharp` is installed but cannot
 * rasterise PDFs. Why at upload and not at render: the alternative is every reader re-rendering
 * every PDF in the feed, which is exactly the "fifty posts must not download fifty PDFs" problem.
 * Rendering once, uploading the PNG beside the file, and serving that image afterwards costs one
 * render per attachment for the whole lifetime of the post.
 *
 * pdfjs is imported dynamically so its ~1MB of worker and font data never enters the main bundle -
 * it loads only when someone actually attaches a PDF.
 *
 * Every failure path returns null. A missing thumbnail is a supported state (the attachment falls
 * back to its typed card), so a malformed, encrypted or oversized PDF must never block the upload.
 */
export type PdfPreview = { thumbnail: Blob; pages: number };

/** Wide enough to read a scanned page at card width on a high-DPI screen, small enough that the
 * PNG stays well inside the image upload cap. */
const TARGET_WIDTH = 640;
const RENDER_TIMEOUT_MS = 8000;

export async function renderPdfFirstPage(file: File): Promise<PdfPreview | null> {
  try {
    return await withTimeout(render(file), RENDER_TIMEOUT_MS);
  } catch {
    return null;
  }
}

async function render(file: File): Promise<PdfPreview | null> {
  const pdfjs = await import("pdfjs-dist");
  // The worker ships with the package; pointing at it via import.meta.url keeps the URL correct
  // under the bundler's own asset handling rather than hardcoding a public path.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = doc.numPages;

  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(TARGET_WIDTH / base.width, 2) });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return null;

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const thumbnail = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  void doc.cleanup();
  if (!thumbnail) return null;
  return { thumbnail, pages };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("pdf render timeout")), ms))]);
}
