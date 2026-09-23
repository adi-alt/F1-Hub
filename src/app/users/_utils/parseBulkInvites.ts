import type { InviteRole } from "@/lib/supabase/invites";

export type ParsedInviteRow = { email: string; role: InviteRole };
export type BulkParseError = { line: number; reason: string };
export type BulkParseResult = { rows: ParsedInviteRow[]; errors: BulkParseError[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Spellings an admin might reasonably put in a spreadsheet for each tier. A blank role column is
 * the common case (invite as an ordinary member) and is accepted rather than flagged. */
const ROLE_ALIASES: Record<string, InviteRole> = {
  "": null,
  member: null,
  members: null,
  user: null,
  users: null,
  none: null,
  admin: "admin",
  admins: "admin",
  administrator: "admin",
  moderator: "moderator",
  moderators: "moderator",
  mod: "moderator",
};

export function normalizeRole(value: string): { ok: true; role: InviteRole } | { ok: false } {
  const key = value.trim().toLowerCase();
  if (key in ROLE_ALIASES) return { ok: true, role: ROLE_ALIASES[key] };
  return { ok: false };
}

/**
 * Splits one CSV line, honouring double-quoted fields.
 *
 * A plain `line.split(",")` — which is what the reference implementation this was modelled on
 * does — corrupts any row whose quoted field contains a comma, and display names with a comma in
 * them ("Doe, John") are exactly the sort of thing that ends up in an exported user CSV. Handles
 * the doubled-quote escape (`""`) inside a quoted field, which is how every spreadsheet writes a
 * literal quote.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function validateRow(email: string, roleRaw: string, line: number): { row?: ParsedInviteRow; error?: BulkParseError } {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { error: { line, reason: "Missing email" } };
  if (!EMAIL_RE.test(cleanEmail)) return { error: { line, reason: `"${email.trim()}" is not a valid email` } };

  const role = normalizeRole(roleRaw);
  if (!role.ok) return { error: { line, reason: `Unknown role "${roleRaw.trim()}"` } };
  return { row: { email: cleanEmail, role: role.role } };
}

/** CSV with a header row naming at least an `email` column. `role` (or `type`, which is what the
 * reference platform's exports call it) is optional — absent means everyone in the file is
 * invited as a member. */
export function parseInviteCsv(text: string): BulkParseResult {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.trim());
  if (headerIndex === -1) return { rows: [], errors: [{ line: 1, reason: "File is empty" }] };

  const headers = splitCsvLine(lines[headerIndex]).map((h) => h.toLowerCase().replace(/^["']|["']$/g, ""));
  const emailIndex = headers.indexOf("email");
  const roleIndex = headers.findIndex((h) => h === "role" || h === "type");

  if (emailIndex === -1) {
    return { rows: [], errors: [{ line: headerIndex + 1, reason: `No "email" column. Found: ${headers.join(", ") || "nothing"}` }] };
  }

  const rows: ParsedInviteRow[] = [];
  const errors: BulkParseError[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitCsvLine(lines[i]);
    const { row, error } = validateRow(values[emailIndex] ?? "", roleIndex === -1 ? "" : (values[roleIndex] ?? ""), i + 1);
    if (row) rows.push(row);
    if (error) errors.push(error);
  }
  return { rows, errors };
}

/** A JSON array of `{ email, role }` (or `type`) objects — the shape the Users table's own export
 * produces, so a file exported from this page can be fed straight back in. */
export function parseInviteJson(text: string): BulkParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rows: [], errors: [{ line: 1, reason: "Not valid JSON" }] };
  }
  if (!Array.isArray(parsed)) return { rows: [], errors: [{ line: 1, reason: "Expected an array of objects" }] };

  const rows: ParsedInviteRow[] = [];
  const errors: BulkParseError[] = [];
  parsed.forEach((entry, i) => {
    const line = i + 1;
    if (!entry || typeof entry !== "object") {
      errors.push({ line, reason: "Not an object" });
      return;
    }
    const { email, role, type } = entry as Record<string, unknown>;
    if (typeof email !== "string") {
      errors.push({ line, reason: "Missing email" });
      return;
    }
    const roleRaw = typeof role === "string" ? role : typeof type === "string" ? type : "";
    const { row, error } = validateRow(email, roleRaw, line);
    if (row) rows.push(row);
    if (error) errors.push(error);
  });
  return { rows, errors };
}

/** Dispatches on the file's extension, then dedupes by address — last entry wins, matching what
 * the server does with a batch containing the same address twice. */
export function parseInviteFile(filename: string, text: string): BulkParseResult {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "json") {
    return { rows: [], errors: [{ line: 1, reason: "Unsupported file type — use .csv or .json" }] };
  }
  const { rows, errors } = extension === "csv" ? parseInviteCsv(text) : parseInviteJson(text);

  const byEmail = new Map<string, ParsedInviteRow>();
  for (const row of rows) byEmail.set(row.email, row);
  return { rows: [...byEmail.values()], errors };
}
