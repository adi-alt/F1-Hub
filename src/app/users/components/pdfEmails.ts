import { extractEmails } from "@/lib/emailImport";

/**
 * Every email address in a PDF, read in the browser at the moment the file is picked.
 *
 * Same dynamic-import shape as pdfThumbnail.ts one directory over (and the same reason: pdfjs's
 * ~1MB of worker and font data must not enter the main bundle for a dialog most people never
 * open). The difference is what it asks each page for - getTextContent() instead of a render -
 * since nothing here needs pixels.
 *
 * Text layer only, deliberately: a scanned PDF is a picture of a list, and reading that would mean
 * OCR. Such a file returns no addresses, which the caller reports honestly as "found none" rather
 * than pretending the file was unreadable.
 */
const PAGE_CAP = 50;
const TIMEOUT_MS = 15000;

export async function extractEmailsFromPdf(file: File): Promise<string[]> {
  return withTimeout(read(file), TIMEOUT_MS);
}

async function read(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  // Capped rather than unbounded: an address list is a handful of pages, and a 900-page document
  // dropped in here by accident shouldn't lock the tab up parsing all of it.
  for (let i = 1; i <= Math.min(doc.numPages, PAGE_CAP); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Joined with spaces, not "": pdfjs emits one item per text run, and an address split across
    // runs is already broken - but two adjacent runs concatenated blindly can *invent* an address
    // that isn't in the document ("...ada" + "@example.com" from different columns).
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }

  void doc.cleanup();
  return extractEmails(pages.join("\n"));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("pdf read timeout")), ms))]);
}
