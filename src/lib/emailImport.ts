/**
 * Pulling email addresses out of whatever file someone happens to have.
 *
 * One text pass rather than a parser per format. A CSV row, a JSON object, a TSV export and a
 * pasted block of text all differ in the punctuation *between* addresses, not in the addresses
 * themselves - so scanning the raw text for things shaped like an address handles every one of
 * them identically, and handles the messy real cases (a "Name <a@b.com>" column, a trailing
 * semicolon, a JSON key literally called "email") without a format-specific branch. The formats
 * that genuinely need decoding first - PDF, and anything binary - hand their extracted text to
 * this same function (see pdfEmails.ts).
 *
 * Deliberately not a validator. Anything that reaches the server is validated there again, by the
 * same rule the community-invite path uses (groups.ts's own EMAIL_RE) - this is about finding
 * candidates in a blob of text, not about deciding what's deliverable.
 */

/** Intentionally excludes the characters that *delimit* addresses in real files - whitespace,
 * quotes, commas, semicolons, angle brackets, brackets and parentheses - so "Ada <a@b.com>," and
 * `"a@b.com",` yield the address and nothing around it. The TLD tail has to be letters, which is
 * what stops a trailing period or comma being swallowed into the match. */
const EMAIL_IN_TEXT = /[^\s<>(),;:"'\[\]]+@[^\s<>(),;:"'\[\]]+\.[A-Za-z]{2,}/g;

/**
 * Every address in `text`, lowercased and de-duplicated, in first-seen order.
 *
 * Order matters for the UI: the preview list shows the first few, and "the first few" should mean
 * the first few in the file the person actually picked, not an arbitrary Set iteration order.
 */
export function extractEmails(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(EMAIL_IN_TEXT)) {
    const email = match[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** What the picker advertises and this app can genuinely read: plain text formats here, PDF
 * through pdfjs (pdfEmails.ts), and the ZIP-of-XML family - .xlsx and friends - through zipText.ts. */
export const IMPORT_ACCEPT_ATTR =
  ".csv,.tsv,.txt,.json,.pdf,.xlsx,.xlsm,.docx,text/csv,text/plain,application/json,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
