"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
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

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      setResult({ sent: body?.sent ?? [], alreadyMembers: body?.alreadyMembers ?? [] });
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

  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Invite people to F1 Hub"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="my-auto w-full max-w-lg overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--f1-line)] px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Invite people</h2>
              <button type="button" onClick={close} aria-label="Close" className="rounded p-1 text-neutral-500 transition hover:text-white">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-3.5 w-3.5">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-4">
              {/* Same segmented-control language as the page's own role filter, one size down. */}
              <div className="flex gap-1 rounded-lg border border-[var(--f1-line)] bg-black/20 p-1">
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
                    className="relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition"
                  >
                    {mode === m && (
                      <motion.div layoutId="invite-mode" className="absolute inset-0 rounded-md bg-[var(--f1-red)]" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />
                    )}
                    <span className={`relative z-10 ${mode === m ? "text-white" : "text-neutral-400 hover:text-white"}`}>
                      {m === "single" ? "One person" : "Several people"}
                    </span>
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
                    className="h-9 w-full rounded-lg border border-[var(--f1-line)] bg-white/[0.02] px-3 text-sm text-white placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
                  />
                ) : (
                  <div className="space-y-3">
                    <textarea
                      value={pasted}
                      onChange={(e) => setPasted(e.target.value)}
                      rows={3}
                      placeholder="Paste addresses - commas, spaces or one per line"
                      aria-label="Email addresses"
                      className="w-full resize-y rounded-lg border border-[var(--f1-line)] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
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
                      className={`rounded-lg border border-dashed px-3 py-4 text-center transition ${
                        dragging ? "border-[var(--f1-red)]/60 bg-[var(--f1-red)]/[0.06]" : "border-[var(--f1-line)]"
                      }`}
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
                        className="text-sm font-medium text-neutral-200 transition hover:text-white disabled:opacity-50"
                      >
                        {reading ? "Reading file…" : "Choose a file"}
                      </button>
                      <p className="mt-1 text-[11px] text-neutral-500">or drag one here — CSV, XLSX, JSON, TXT or PDF</p>
                      {fileNote && <p className="mt-1.5 text-[11px] text-neutral-400">{fileNote}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Exactly who is about to be emailed, before anything is sent - and removable, since
                  a file import is a guess about someone else's spreadsheet. */}
              {candidates.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] text-neutral-500">
                    {candidates.length} {candidates.length === 1 ? "recipient" : "recipients"}
                    {overCap && <span className="text-[var(--f1-red)]"> — {MAX_PER_BATCH} at a time is the limit</span>}
                  </p>
                  <div className="mt-1.5 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {candidates.map((email) => (
                      <span key={email} className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] py-0.5 pl-2 pr-1 text-[11px] text-neutral-300">
                        {email}
                        <button
                          type="button"
                          onClick={() => setRemoved((prev) => new Set(prev).add(email))}
                          aria-label={`Remove ${email}`}
                          className="rounded p-0.5 text-neutral-500 transition hover:text-white"
                        >
                          <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-2.5 w-2.5">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="mt-3 text-xs text-[var(--f1-red)]">{error}</p>}

              {result && (
                <div className="mt-3 space-y-1 text-xs">
                  {result.sent.length > 0 && (
                    <p className="text-emerald-400">Invite sent to {result.sent.length === 1 ? result.sent[0] : `${result.sent.length} people`}.</p>
                  )}
                  {result.alreadyMembers.length > 0 && (
                    <p className="text-neutral-500">
                      {result.alreadyMembers.length === 1 ? `${result.alreadyMembers[0]} already has` : `${result.alreadyMembers.length} of those already have`} an
                      account — not emailed again.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--f1-line)] px-4 py-3">
              <p className="text-[11px] text-neutral-500">They&apos;ll get a link to sign up.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-400 transition hover:text-white">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={candidates.length === 0 || sending || overCap}
                  className="rounded-lg bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  {sending ? "Sending…" : candidates.length > 1 ? `Send ${candidates.length} invites` : "Send invite"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
