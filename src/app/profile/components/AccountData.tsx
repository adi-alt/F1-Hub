"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/Field";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { useAuth } from "@/providers/AuthProvider";

const CONFIRMATION = "DELETE";

/**
 * Settings › Account (audit R-53): download everything you own as JSON, read the privacy notice and terms, and
 * delete the account for good behind a typed confirmation.
 */
export function AccountData() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/users/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed.trim() }) }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Your account couldn't be deleted. Nothing has been lost; try again.");
      setDeleting(false);
      return;
    }
    await signOut();
    window.location.assign("/");
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="your-data" className={`p-5 ${PANEL}`}>
        <h2 id="your-data" className={EYEBROW}>
          Your data
        </h2>
        <p className="mt-3 text-body-sm text-secondary">
          A copy of everything Apex F1 Hub stores about you: your profile and settings, picks, prediction entries, points, notifications, community memberships, posts,
          comments, votes and the files you uploaded.
        </p>
        <Button asChild variant="secondary" size="sm" iconStart={Download} className="mt-4">
          <a href="/api/users/me/export" download>
            Download my data (JSON)
          </a>
        </Button>
        <p className="mt-4 text-caption text-tertiary">
          How it&apos;s used: <Link href="/privacy" className="text-secondary underline-offset-4 hover:underline">Privacy notice</Link> ·{" "}
          <Link href="/terms" className="text-secondary underline-offset-4 hover:underline">Terms</Link>
        </p>
      </section>

      <section aria-labelledby="delete-account" className={`p-5 ${PANEL}`}>
        <h2 id="delete-account" className={EYEBROW}>
          Delete account
        </h2>
        <p className="mt-3 text-body-sm text-secondary">
          Deletes your account and everything in it, for good: your profile, picks, prediction entries and points, notifications, memberships, and every post and comment
          you wrote (replies to them go too). A community you run passes to its longest-standing member; one with nobody else in it is deleted.
        </p>
        <Button variant="danger" size="sm" iconStart={Trash2} className="mt-4" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </section>

      <Dialog
        open={open}
        onClose={() => {
          if (deleting) return;
          setOpen(false);
          setTyped("");
          setError(null);
        }}
        title="Delete your account?"
        description="This can't be undone. Download your data first if you want a copy."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={() => void remove()} disabled={typed.trim() !== CONFIRMATION} loading={deleting}>
              Delete forever
            </Button>
          </>
        }
      >
        <TextInput label={`Type ${CONFIRMATION} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} error={error ?? undefined} />
      </Dialog>
    </div>
  );
}
