"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { GroupVisibility } from "@/lib/supabase/groups";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ICON_BYTES = 500 * 1024;
const MAX_BANNER_BYTES = 3 * 1024 * 1024; // matches the group-banners bucket's own file_size_limit
const ICON_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Icon upload/invite emails both need a real group id to attach to (the avatar route is keyed by
 * groupId, invites need it to build the join link) - so both happen as follow-up calls right after
 * the group itself is created, not staged into the create-POST body. A failure in either follow-up
 * still lands the user on their new (real, already-created) group rather than losing the whole
 * thing - same "don't let a secondary step's failure undo the primary action" reasoning as
 * createGroup's own paired-insert comment in groups.ts. */
export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<GroupVisibility>("private");
  const [moderationEnabled, setModerationEnabled] = useState(false);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconError, setIconError] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  const trimmedName = name.trim();
  const canCreate = trimmedName.length >= 3 && trimmedName.length <= 40 && status !== "saving";

  function pickIcon(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIconError("");
    if (!ICON_TYPES[file.type]) {
      setIconError("PNG, JPEG, or WEBP only.");
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setIconError("Image must be under 500KB.");
      return;
    }
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  }

  function pickBanner(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBannerError("");
    if (!ICON_TYPES[file.type]) {
      setBannerError("PNG, JPEG, or WEBP only.");
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setBannerError("Image must be under 3MB.");
      return;
    }
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  }

  function addEmail() {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_RE.test(trimmed)) {
      setError(`"${trimmed}" isn't a valid email address.`);
      return;
    }
    if (!emails.includes(trimmed)) setEmails((prev) => [...prev, trimmed]);
    setEmailInput("");
    setError("");
  }

  function onEmailKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail();
    }
  }

  async function submit() {
    if (!canCreate) return;
    setStatus("saving");
    setError("");

    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName, description: description.trim() || undefined, visibility, moderationEnabled }),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res.ok || !body?.id) {
      setError(body?.error ?? "Could not create group.");
      setStatus("error");
      return;
    }

    if (bannerFile) {
      const form = new FormData();
      form.append("banner", bannerFile);
      await fetch(`/api/groups/${body.id}/banner`, { method: "POST", body: form }).catch(() => {});
    }
    if (iconFile) {
      const form = new FormData();
      form.append("avatar", iconFile);
      await fetch(`/api/groups/${body.id}/avatar`, { method: "POST", body: form }).catch(() => {});
    }
    if (emails.length > 0) {
      await fetch(`/api/groups/${body.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      }).catch(() => {});
    }

    router.push(`/groups/${body.id}`);
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/35 px-4 py-8" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur-xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
            <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Create a group</p>
        <h2 className="mt-1 text-xl font-bold text-white">Build your own F1 community and prediction league.</h2>

        <div className="mt-5 space-y-4">
          <div>
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="relative block h-20 w-full overflow-hidden rounded-lg border border-dashed border-[var(--f1-line)] bg-black/20 transition hover:border-white/30"
            >
              {bannerPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-xs text-neutral-500">Upload banner</span>
              )}
            </button>
            <div className="mt-1.5 text-xs">
              <button type="button" onClick={() => bannerInputRef.current?.click()} className="font-medium text-neutral-300 hover:text-white">
                {bannerPreview ? "Replace banner" : "Upload banner"}
              </button>
              {bannerPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setBannerFile(null);
                    setBannerPreview(null);
                  }}
                  className="ml-3 text-neutral-500 hover:text-neutral-300"
                >
                  Remove
                </button>
              )}
              <p className="mt-0.5 text-neutral-500">PNG, JPEG, or WEBP - max 3MB. No banner uses a generated color instead.</p>
              {bannerError && <p className="text-[var(--f1-red)]">{bannerError}</p>}
            </div>
            <input ref={bannerInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickBanner} />
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="shrink-0">
              {iconPreview ? (
                // Plain <img>, not next/image (EntityAvatar's own choice for a real Storage URL) -
                // a local createObjectURL() blob is exactly what Next's image optimizer can't
                // process (no remote host, no build-time static import), so there's nothing for it
                // to optimize here regardless.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconPreview} alt="" width={48} height={48} className="rounded-full object-cover" style={{ width: 48, height: 48 }} />
              ) : (
                <EntityAvatar imageUrl={null} name={trimmedName || "?"} size={48} />
              )}
            </button>
            <div className="text-xs">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="font-medium text-neutral-300 hover:text-white">
                {iconPreview ? "Replace icon" : "Upload icon"}
              </button>
              {iconPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setIconFile(null);
                    setIconPreview(null);
                  }}
                  className="ml-3 text-neutral-500 hover:text-neutral-300"
                >
                  Remove
                </button>
              )}
              <p className="mt-0.5 text-neutral-500">PNG, JPEG, or WEBP - max 500KB.</p>
              {iconError && <p className="text-[var(--f1-red)]">{iconError}</p>}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickIcon} />
          </div>

          <label className="block text-sm text-neutral-400">
            Group name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="F1 Championship League"
              className="mt-1 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
            />
          </label>

          <label className="block text-sm text-neutral-400">
            Description <span className="text-neutral-600">(optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Tell people what your group is about..."
              className="mt-1 w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
            />
          </label>

          <div className="text-sm text-neutral-400">
            Group visibility
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {(
                [
                  { value: "private" as const, title: "Private", desc: "Members can only join through an invite." },
                  { value: "public" as const, title: "Public", desc: "Anyone can discover and join this group." },
                ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVisibility(opt.value)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs transition ${
                    visibility === opt.value ? "border-[var(--f1-red)] bg-[var(--f1-red)]/10" : "border-[var(--f1-line)] hover:border-white/20"
                  }`}
                >
                  <p className="font-semibold text-white">{opt.title}</p>
                  <p className="mt-0.5 text-neutral-500">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between text-sm text-neutral-300">
            Require approval for member posts
            <button
              type="button"
              onClick={() => setModerationEnabled((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${moderationEnabled ? "bg-[var(--f1-red)]" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${moderationEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </label>

          <label className="block text-sm text-neutral-400">
            Invite by email <span className="text-neutral-600">(optional)</span>
            <div className="mt-1 flex gap-2">
              <input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={onEmailKeyDown}
                placeholder="person@email.com"
                type="email"
                className="flex-1 rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
              />
              <button type="button" onClick={addEmail} className="shrink-0 rounded-lg border border-[var(--f1-line)] px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-white/30">
                + Add
              </button>
            </div>
          </label>
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {emails.map((email) => (
                <span key={email} className="flex items-center gap-1.5 rounded-full border border-[var(--f1-line)] bg-black/20 px-2.5 py-1 text-xs text-neutral-300">
                  {email}
                  <button type="button" onClick={() => setEmails((prev) => prev.filter((e) => e !== email))} className="text-neutral-500 hover:text-white">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-xs text-[var(--f1-red)]">
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-sm text-neutral-400 hover:text-white">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canCreate}
            className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {status === "saving" ? "Creating…" : "Create Group →"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
