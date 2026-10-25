"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { fieldControlClass } from "@/components/ui/Field";
import { extractEmails, IMPORT_ACCEPT_ATTR, isPdf } from "@/lib/emailImport";
import { extractTextFromZip, isZipContainer } from "@/lib/zipText";
import { extractEmailsFromPdf } from "./pdfEmails";

type Result = { sent: string[]; alreadyMembers: string[] };
type Mode = "single" | "many";

/** Server-side cap (userInvites.ts) - mirrored here so the dialog can say so before someone pastes
 * a 400-row export and waits for a rejection. */
const MAX_PER_BATCH = 10;

/**
 * Invite dialog: a real floating panel over the page, opened from the ⋮ menu rather than a
 * standing button in the toolbar - inviting is an occasional administrative act, not something
 * that needs permanent shelf space next to the filters.
 *
 * Two modes, because the two jobs are genuinely different shapes: one address typed by hand, or a
 * list that already exists somewhere as a file. The list path reads CSV/TSV/TXT/JSON as text and
 * PDF through pdfjs (see pdfEmails.ts), and in every case it does the same thing - find the
 * addresses, show them back, let them be removed before anything is sent. Nothing is emailed until
 * the person has seen exactly who is about to be emailed.
 */
export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("single");
  const [single, setSingle] = useState("");
  const [pasted, setPasted] = useState("");
  const [fileEmails, setFileEmails] = useState<string[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Everything the dialog is currently holding, as one de-duplicated list. Single and Many are
  // separate inputs but one outgoing set, so the count on the button is always the real count.
  const candidates = (() => {
    const source = mode === "single" ? single : `${pasted}\n${fileEmails.join("\n")}`;
    return extractEmails(source).filter((e) => !removed.has(e));
  })();
  const overCap = candidates.length > MAX_PER_BATCH;

  function reset() {
    setSingle("");
    setPasted("");
    setFileEmails([]);
    setFileNote(null);
    setRemoved(new Set());
    setError(null);
    setResult(null);
  }

  function close() {
    onClose();
    reset();
    setMode("single");
  }

  async function readFile(file: File) {
    setReading(true);
    setError(null);
    setFileNote(null);
    try {
      const found = isPdf(file)
        ? await extractEmailsFromPdf(file)
        : isZipContainer(file)
          ? extractEmails(await extractTextFromZip(await file.arrayBuffer()))
          : extractEmails(await file.text());
      if (found.length === 0) {
        // A real outcome, not a failure: the file was read, it just had no addresses in it (an
        // empty export, or a scanned PDF with no text layer).
        setFileNote(`No email addresses found in ${file.name}.`);
        return;
      }
      setFileEmails((prev) => [...new Set([...prev, ...found])]);
      setFileNote(`Found ${found.length} ${found.length === 1 ? "address" : "addresses"} in ${file.name}.`);
    } catch {
      setError(`Couldn't read ${file.name}. Try a CSV, XLSX, JSON, TXT or PDF export.`);
    } finally {
      setReading(false);
    }
  }

  async function send() {
    if (candidates.length === 0 || sending || overCap) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: candidates }),
      });
      const body = (await res.json().catch(() => null)) as (Result & { error?: string }) | null;
      if (!res.ok) {
        setError(body?.error ?? "Couldn't send that invite.");
        return;
      }
      setResult({
        sent: body?.sent ?? [],
        alreadyMembers: body?.alreadyMembers ?? [],
      });
      setSingle("");
      setPasted("");
      setFileEmails([]);
      setFileNote(null);
      setRemoved(new Set());
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Invite people"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-caption text-tertiary">They&apos;ll get a link to sign up.</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={() => void send()} loading={sending} disabled={candidates.length === 0 || overCap}>
              {candidates.length > 1 ? `Send ${candidates.length} invites` : "Send invite"}
            </Button>
          </div>
        </div>
      }
    >
      <div>
        {/* Same segmented-control language as the page's own role filter, one size down. */}
        <div className="flex gap-1 rounded-control bg-surface-2 p-1">
          {(["single", "many"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setResult(null);
              }}
              aria-pressed={mode === m}
              className={`min-h-8 flex-1 rounded-control px-3 text-body-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-focus-ring ${mode === m ? "bg-surface-3 text-primary" : "text-secondary hover:text-primary"}`}
            >
              {m === "single" ? "One person" : "Several people"}
            </button>
          ))}
        </div>

        <div className="mt-3.5">
          {mode === "single" ? (
            <input
              type="email"
              autoFocus
              value={single}
              onChange={(e) => setSingle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
              placeholder="name@example.com"
              aria-label="Email address"
              className={fieldControlClass(false)}
            />
          ) : (
            <div className="space-y-3">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={3}
                placeholder="Paste addresses - commas, spaces or one per line"
                aria-label="Email addresses"
                className={`${fieldControlClass(false)} resize-y`}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void readFile(file);
                }}
                className={`rounded-card border border-dashed px-3 py-4 text-center transition ${dragging ? "border-strong bg-surface-2" : "border-subtle"}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMPORT_ACCEPT_ATTR}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={reading}
                  className="text-body-sm font-medium text-primary underline-offset-2 hover:underline disabled:text-disabled"
                >
                  {reading ? "Reading file…" : "Choose a file"}
                </button>
                <p className="mt-1 text-caption text-tertiary">or drag one here — CSV, XLSX, JSON, TXT or PDF</p>
                {fileNote && <p className="mt-1.5 text-caption text-secondary">{fileNote}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Exactly who is about to be emailed, before anything is sent - and removable, since
            a file import is a guess about someone else's spreadsheet. */}
        {candidates.length > 0 && (
          <div className="mt-3">
            <p className="text-caption text-tertiary">
              {candidates.length} {candidates.length === 1 ? "recipient" : "recipients"}
              {overCap && <span className="text-brand-text"> — {MAX_PER_BATCH} at a time is the limit</span>}
            </p>
            <div className="mt-1.5 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto scrollbar-subtle">
              {candidates.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 rounded-control bg-surface-2 py-0.5 pl-2 pr-1 text-caption text-secondary">
                  {email}
                  <button
                    type="button"
                    onClick={() => setRemoved((prev) => new Set(prev).add(email))}
                    aria-label={`Remove ${email}`}
                    className="rounded-control p-0.5 text-tertiary hover:text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
                  >
                    <X aria-hidden size={12} strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-body-sm text-danger">{error}</p>}

        {result && (
          <div className="mt-3 space-y-1 text-body-sm">
            {result.sent.length > 0 && (
              <p className="text-success">Invite sent to {result.sent.length === 1 ? result.sent[0] : `${result.sent.length} people`}.</p>
            )}
            {result.alreadyMembers.length > 0 && (
              <p className="text-tertiary">
                {result.alreadyMembers.length === 1 ? `${result.alreadyMembers[0]} already has` : `${result.alreadyMembers.length} of those already have`} an
                account — not emailed again.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
