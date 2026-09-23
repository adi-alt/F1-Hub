"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { InviteRole } from "@/lib/supabase/invites";
import { MAX_BULK_INVITES } from "../_utils/inviteLimits";
import { useSendInvites } from "../_hooks/useInvites";
import type { InviteOutcome } from "../_service/invites.client";
import { parseInviteFile, type BulkParseError, type ParsedInviteRow } from "../_utils/parseBulkInvites";
import { RoleSelect, roleLabel } from "./RoleSelect";

type Mode = "single" | "bulk";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Segmented({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex gap-1 rounded-full border border-[var(--f1-line)] bg-black/20 p-1">
      {(["single", "bulk"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
            mode === m ? "bg-white/[0.08] text-white" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/** Per-address outcomes from the last send. Deliberately lists every failure rather than the
 * first three: the whole point of reporting per address is that an admin can fix exactly the
 * rows that didn't go through, and a truncated list makes that guesswork again. */
function Results({ results, onDismiss }: { results: InviteOutcome[]; onDismiss: () => void }) {
  const sent = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok) as Extract<InviteOutcome, { ok: false }>[];

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {sent.length} sent
        </span>
        {failed.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {failed.length} skipped
          </span>
        )}
      </div>

      {failed.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--f1-line)] bg-black/20 p-3 text-xs scrollbar-hide">
          {failed.map((f) => (
            <li key={f.email} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-neutral-300">{f.email}</span>
              <span className="text-neutral-500">— {f.reason}</span>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onDismiss} className="text-xs text-neutral-400 transition hover:text-white">
        Invite more people
      </button>
    </motion.div>
  );
}

export function InvitePanel() {
  const [mode, setMode] = useState<Mode>("single");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>(null);
  const [rows, setRows] = useState<ParsedInviteRow[]>([]);
  const [parseErrors, setParseErrors] = useState<BulkParseError[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<InviteOutcome[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const send = useSendInvites();
  const emailValid = EMAIL_RE.test(email.trim());

  function resetBulk() {
    setRows([]);
    setParseErrors([]);
    setFileName(null);
    setResults(null);
  }

  async function readFile(file: File) {
    const parsed = parseInviteFile(file.name, await file.text());
    setFileName(file.name);
    setRows(parsed.rows);
    setParseErrors(parsed.errors);
    setResults(null);
  }

  async function submitSingle() {
    if (!emailValid) return;
    const result = await send.mutateAsync([{ email: email.trim(), role }]);
    setResults(result.results);
    // Only clear the field on success — leaving a rejected address in place means the admin can
    // correct a typo rather than retype the whole thing.
    if (result.sent > 0) setEmail("");
  }

  async function submitBulk() {
    if (rows.length === 0) return;
    const result = await send.mutateAsync(rows);
    setResults(result.results);
    setRows([]);
    setFileName(null);
  }

  const overLimit = rows.length > MAX_BULK_INVITES;

  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Invite people</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Anyone can sign up on their own — an invite reserves the role they land on and emails them a link.
          </p>
        </div>
        <Segmented
          mode={mode}
          onChange={(m) => {
            setMode(m);
            setResults(null);
          }}
        />
      </div>

      {send.isError && (
        <p className="mb-3 rounded-lg border border-[var(--f1-red)]/35 bg-[var(--f1-red)]/[0.08] px-3 py-2 text-sm text-red-300">
          {send.error instanceof Error ? send.error.message : "Couldn't send those invitations."}
        </p>
      )}

      <AnimatePresence mode="wait">
        {results ? (
          <Results key="results" results={results} onDismiss={() => setResults(null)} />
        ) : mode === "single" ? (
          <motion.div
            key="single"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && emailValid && !send.isPending) void submitSingle();
              }}
              placeholder="name@example.com"
              aria-label="Email address to invite"
              className="h-9 flex-1 rounded-lg border border-[var(--f1-line)] bg-white/[0.02] px-3 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
            />
            <div className="w-full sm:w-44">
              <RoleSelect value={role} onChange={setRole} />
            </div>
            <button
              type="button"
              onClick={() => void submitSingle()}
              disabled={!emailValid || send.isPending}
              className="h-9 shrink-0 rounded-lg bg-[var(--f1-red)] px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {send.isPending ? "Sending…" : "Send invite"}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            {rows.length === 0 && parseErrors.length === 0 ? (
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
                className={`rounded-lg border border-dashed px-4 py-8 text-center transition ${
                  dragging ? "border-[var(--f1-red)]/60 bg-[var(--f1-red)]/[0.06]" : "border-[var(--f1-line)]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readFile(file);
                    // Lets the same file be picked twice in a row — without this, re-choosing an
                    // identical filename fires no change event and looks broken.
                    e.target.value = "";
                  }}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-medium text-white underline-offset-4 hover:underline">
                  Choose a CSV or JSON file
                </button>
                <span className="text-sm text-neutral-500"> or drop one here</span>
                <p className="mt-2 text-xs text-neutral-600">
                  Columns: <code className="text-neutral-400">email</code> (required),{" "}
                  <code className="text-neutral-400">role</code> — admin, moderator, or blank for member.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-neutral-300">
                    {rows.length} {rows.length === 1 ? "person" : "people"} ready
                    {fileName && <span className="text-neutral-500"> · {fileName}</span>}
                  </p>
                  <button type="button" onClick={resetBulk} className="text-xs text-neutral-400 transition hover:text-white">
                    Choose a different file
                  </button>
                </div>

                {rows.length > 0 && (
                  <ul className="max-h-36 divide-y divide-[var(--f1-line)] overflow-y-auto rounded-lg border border-[var(--f1-line)] bg-black/20 text-xs scrollbar-hide">
                    {rows.map((row) => (
                      <li key={row.email} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span className="truncate text-neutral-300">{row.email}</span>
                        <span className="shrink-0 text-neutral-500">{roleLabel(row.role)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {parseErrors.length > 0 && (
                  <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-200 scrollbar-hide">
                    {parseErrors.map((err, i) => (
                      <li key={`${err.line}-${i}`}>
                        Line {err.line}: {err.reason}
                      </li>
                    ))}
                  </ul>
                )}

                {overLimit && (
                  <p className="text-xs text-amber-300">
                    That file has {rows.length} people — invite up to {MAX_BULK_INVITES} at a time.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void submitBulk()}
                  disabled={rows.length === 0 || overLimit || send.isPending}
                  className="w-full rounded-lg bg-[var(--f1-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {send.isPending ? `Sending ${rows.length}…` : `Send ${rows.length} ${rows.length === 1 ? "invitation" : "invitations"}`}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
