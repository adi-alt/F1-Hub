"use client";

import { useState, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, fieldControlClass } from "@/components/ui/Field";
import { Picker } from "@/components/ui/Picker";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { DESCRIPTION_MAX, PROBLEM_KINDS, screenshotError, validateReport, type ProblemContext, type ProblemKind } from "@/lib/problemReports";

// The last error an error boundary caught in this tab, so a report sent afterwards carries it.
let lastClientError: string | null = null;

/** An error as one line for a report: its message, and its digest when the server sent one. */
export function errorSummary(error: unknown): string {
  const e = error as { message?: unknown; digest?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : String(error);
  return (typeof e?.digest === "string" ? `${message} (digest ${e.digest})` : message).slice(0, 500);
}

/** Called by the error boundaries: remembers what went wrong for the next report. */
export function recordClientError(error: unknown) {
  lastClientError = errorSummary(error);
}

function gatherContext(): ProblemContext {
  return {
    url: window.location.href,
    section: new URLSearchParams(window.location.search).get("section") ?? undefined,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
    version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || undefined,
    error: lastClientError ?? undefined,
  };
}

const KIND_OPTIONS = PROBLEM_KINDS.map((k) => ({ value: k.value, label: k.label }));

/** The "Report a problem" dialog. `error` pre-fills it from an error boundary. */
export function ReportProblemDialog({ open, onClose, error }: { open: boolean; onClose: () => void; error?: string }) {
  const [kind, setKind] = useState<ProblemKind>(error ? "broken" : "other");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function close() {
    onClose();
    setSent(false);
    setDescription("");
    setFile(null);
    setProblem(null);
  }

  async function send() {
    const context = { ...gatherContext(), ...(error ? { error } : {}) };
    const checked = validateReport({ kind, description, context });
    if ("error" in checked) return setProblem(checked.error);
    setSending(true);
    setProblem(null);
    const form = new FormData();
    form.set("kind", kind);
    form.set("description", checked.description);
    form.set("context", JSON.stringify(checked.context));
    if (file) form.set("screenshot", file);
    try {
      const res = await fetch("/api/problem-reports", { method: "POST", body: form });
      if (res.ok) setSent(true);
      else setProblem(res.status === 401 ? "Sign in to send a report." : ((await res.json().catch(() => null))?.error ?? "Couldn't send the report."));
    } catch {
      setProblem("Couldn't send the report. Check your connection.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Report a problem"
      description={sent ? undefined : "The page you're on and your browser are attached, so we can see what you saw."}
      size="md"
      footer={
        sent ? (
          <Button variant="primary" size="md" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="md" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" size="md" loading={sending} onClick={() => void send()}>
              Send report
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Icon icon={CircleCheck} size={24} className="text-success" />
          <p className="text-body font-semibold text-primary">Thanks, we got it</p>
          <p className="text-body-sm text-secondary">An admin will look at it soon.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {error && <p className="rounded-control bg-surface-2 px-3 py-2 font-mono text-caption text-secondary">{error}</p>}
          <Field label="What kind of problem?">
            {({ id, describedBy }) => <Picker id={id} describedBy={describedBy} options={KIND_OPTIONS} value={kind} onChange={(v) => setKind(v as ProblemKind)} />}
          </Field>
          <Field label="What happened?" hint={`${description.trim().length}/${DESCRIPTION_MAX}, at least 10 characters`}>
            {({ id, describedBy, invalid }) => (
              <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} rows={5} maxLength={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} className={fieldControlClass(invalid)} />
            )}
          </Field>
          <Field label="Screenshot (optional)" hint="PNG, JPEG or WebP, up to 1 MB">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  const bad = picked && screenshotError(picked);
                  setProblem(bad || null);
                  setFile(bad ? null : picked);
                  if (bad) e.target.value = "";
                }}
                className="text-body-sm text-secondary"
              />
            )}
          </Field>
          {problem && <Alert tone="danger" title={problem} />}
        </div>
      )}
    </Dialog>
  );
}

/** A button that opens the dialog. `children` is the trigger's content; `className` styles it. */
export function ReportProblemButton({ className, error, children = "Report a problem", onOpen }: { className?: string; error?: string; children?: ReactNode; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
        className={className}
      >
        {children}
      </button>
      <ReportProblemDialog open={open} onClose={() => setOpen(false)} error={error} />
    </>
  );
}
