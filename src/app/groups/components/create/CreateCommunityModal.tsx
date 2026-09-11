"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Picker } from "@/components/ui/Picker";
import {
  COMMUNITY_TOPICS,
  COMMUNITY_TYPES,
  MODULE_DESCRIPTIONS,
  MODULE_LABELS,
  VISIBILITY_OPTIONS,
  communityTypeMeta,
  resolveModules,
  toggleableModules,
  type CommunityFeatures,
  type CommunityType,
  type CommunityVisibility,
} from "@/lib/communities";
import { GroupBanner } from "../GroupBanner";
import { ImageDropzone } from "./ImageDropzone";
import { SelectionCard, SelectionCardGroup } from "./SelectionCard";
import { TypeIcon, VisibilityIcon } from "./icons";

/** One object URL per file, revoked when the file changes or the modal unmounts. ImageDropzone
 * makes its own for its own preview; the review step needs a second, independently-scoped one
 * rather than calling URL.createObjectURL() inline during render, which leaked a blob per render. */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

const MAX_AVATAR_BYTES = 500 * 1024;
const MAX_BANNER_BYTES = 3 * 1024 * 1024; // matches the group-banners bucket's own file_size_limit
// Same shape the server validates with (inviteByEmail in groups.ts) - this is a courtesy check so
// a typo is caught before submit, never the actual gate.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_NAME = 3;
const MAX_NAME = 40;
const MAX_DESCRIPTION = 280;

const STEPS = ["type", "identity", "visual", "privacy", "features", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_TITLES: Record<Step, { eyebrow: string; title: string }> = {
  type: { eyebrow: "Step 1 of 6", title: "What are you creating?" },
  identity: { eyebrow: "Step 2 of 6", title: "Name it." },
  visual: { eyebrow: "Step 3 of 6", title: "Give it a look." },
  privacy: { eyebrow: "Step 4 of 6", title: "Who can see it?" },
  features: { eyebrow: "Step 5 of 6", title: "What does it do?" },
  review: { eyebrow: "Last look", title: "Ready to create." },
};

/**
 * The create flow, replacing the single long form CreateGroupModal used to be.
 *
 * Six steps rather than one scroll: the first choice (what kind of community) genuinely changes
 * what the later steps offer - an F1 community is asked about predictions, a Photography community
 * never is - so collapsing them back into one page would mean showing every user every field and
 * hiding the irrelevant ones, which is the thing this is replacing.
 *
 * Everything except the name is optional, and the flow says so: Next is always enabled past step 2.
 *
 * Uploads and invites still happen as follow-up calls after creation (both are keyed by a community
 * id that doesn't exist until the POST returns), and a failure in either still lands the user in
 * their real, already-created community rather than discarding the whole thing.
 */
export function CreateCommunityModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("type");
  const [communityType, setCommunityType] = useState<CommunityType>("general");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [chosenVisibility, setVisibility] = useState<CommunityVisibility>("public");
  const [features, setFeatures] = useState<CommunityFeatures>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const bannerPreview = useObjectUrl(bannerFile);
  const avatarPreview = useObjectUrl(avatarFile);

  // A Private Circle is invite-only by definition, so Public is never a valid pairing. Derived
  // rather than "corrected" in an effect: the displayed value and the submitted value are the same
  // expression, so there's no frame where the UI shows Public for a community that will be created
  // Private, and no cascading re-render.
  const visibility: CommunityVisibility = communityType === "private_circle" && chosenVisibility === "public" ? "private" : chosenVisibility;

  const meta = communityTypeMeta(communityType);
  const stepIndex = STEPS.indexOf(step);
  const trimmedName = name.trim();

  // Live, honest validation. Deliberately no "is this name taken" lookup: the only search endpoint
  // returns PUBLIC communities, so a client-side duplicate check would confidently clear a name
  // that's actually taken by a private one. The real case-insensitive unique index raises a 409 on
  // submit and that message is shown verbatim instead of a guess.
  const nameError = useMemo(() => {
    if (trimmedName.length === 0) return null; // not yet an error, just incomplete
    if (trimmedName.length < MIN_NAME) return `At least ${MIN_NAME} characters.`;
    if (trimmedName.length > MAX_NAME) return `At most ${MAX_NAME} characters.`;
    return null;
  }, [trimmedName]);

  const canAdvance = step !== "identity" || (trimmedName.length >= MIN_NAME && !nameError);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // Focus moves to the panel on each step change so a screen reader announces the new step rather
  // than leaving focus on a button that no longer exists.
  useEffect(() => {
    panelRef.current?.focus();
  }, [step]);

  const [emailError, setEmailError] = useState("");

  function addEmail() {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError(`"${trimmed}" isn't a valid email address.`);
      return;
    }
    setEmailError("");
    setEmails((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setEmailInput("");
  }

  function go(delta: number) {
    const next = STEPS[stepIndex + delta];
    if (next) setStep(next);
  }

  const enabledModules = resolveModules(communityType, features);
  const availableToggles = toggleableModules(communityType);

  async function submit() {
    if (submitting) return; // the one guard against a double-submit creating two communities
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        description: description.trim() || undefined,
        visibility,
        communityType,
        topic: topic || null,
        features,
      }),
    }).catch(() => null);

    const body = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res?.ok || !body?.id) {
      setError(body?.error ?? "Could not create community. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    // Best-effort follow-ups. A failed image upload must not discard a community that already
    // exists - the user lands in it and can set the image from Manage.
    if (bannerFile) {
      const form = new FormData();
      form.append("banner", bannerFile);
      await fetch(`/api/groups/${body.id}/banner`, { method: "POST", body: form }).catch(() => {});
    }
    if (avatarFile) {
      const form = new FormData();
      form.append("avatar", avatarFile);
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
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={() => !submitting && onClose()}
    >
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Create a community"
        initial={{ opacity: 0, y: 24, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.99 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        // Full-height sheet on mobile, centred panel on desktop - not one squeezed into the other.
        className="flex h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl focus:outline-none sm:h-auto sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl"
      >
        <header className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{STEP_TITLES[step].eyebrow}</p>
              <h2 className="mt-0.5 text-lg font-bold text-white">{STEP_TITLES[step].title}</h2>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white disabled:opacity-40"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
                <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {/* Real progress, not decoration - one segment per step, filled up to where you are. */}
          <div className="mt-3 flex gap-1" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-0.5 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-[var(--f1-red)]" : "bg-white/10"}`} />
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
              {step === "type" && (
                <SelectionCardGroup label="Community type" className="grid gap-2.5">
                  {COMMUNITY_TYPES.map((t) => (
                    <SelectionCard
                      key={t.value}
                      selected={communityType === t.value}
                      onSelect={() => setCommunityType(t.value)}
                      title={t.label}
                      description={t.tagline}
                      icon={<TypeIcon type={t.value} />}
                      footnote={t.examples.join(" · ")}
                    />
                  ))}
                </SelectionCardGroup>
              )}

              {step === "identity" && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="community-name" className="block text-xs font-medium text-neutral-400">
                      Community name
                    </label>
                    <input
                      id="community-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={MAX_NAME}
                      autoFocus
                      placeholder={meta.value === "f1" ? "Ferrari Tifosi India" : "Photography Society"}
                      aria-invalid={!!nameError}
                      aria-describedby={nameError ? "community-name-error" : undefined}
                      className={`mt-1 w-full rounded-lg border bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none ${
                        nameError ? "border-[var(--f1-red)]/60" : "border-[var(--f1-line)] focus:border-white/30"
                      }`}
                    />
                    <div className="mt-1 flex items-start justify-between gap-3 text-[11px]">
                      <span id="community-name-error" className={nameError ? "text-[var(--f1-red)]" : "text-neutral-600"}>
                        {nameError ?? "This is how people will find you."}
                      </span>
                      {/* Shown only once it's actually relevant, not a permanent 0/40 counter. */}
                      {trimmedName.length > MAX_NAME - 10 && (
                        <span className="shrink-0 tabular-nums text-neutral-600">
                          {trimmedName.length}/{MAX_NAME}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="community-description" className="block text-xs font-medium text-neutral-400">
                      Description <span className="text-neutral-600">(optional)</span>
                    </label>
                    <textarea
                      id="community-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={MAX_DESCRIPTION}
                      rows={3}
                      placeholder="What is this community about?"
                      className="mt-1 w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                    />
                  </div>

                  <div>
                    <span className="block text-xs font-medium text-neutral-400">
                      Topic <span className="text-neutral-600">(optional)</span>
                    </span>
                    <Picker
                      options={COMMUNITY_TOPICS.map((t) => ({ value: t, label: t }))}
                      value={topic}
                      onChange={setTopic}
                      placeholder="Choose or type a topic"
                      searchPlaceholder="Search topics..."
                      ariaLabel="Community topic"
                      allowCustomValue
                      clearable
                      className="mt-1"
                    />
                    <p className="mt-1 text-[11px] text-neutral-600">Not in the list? Type your own.</p>
                  </div>
                </div>
              )}

              {step === "visual" && (
                <div className="space-y-5">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-neutral-400">Banner</p>
                    <ImageDropzone
                      file={bannerFile}
                      onPick={setBannerFile}
                      onClear={() => setBannerFile(null)}
                      maxBytes={MAX_BANNER_BYTES}
                      label="Drop an image, or click to upload"
                      hint="PNG, JPEG or WEBP · max 3MB"
                      surfaceClassName="aspect-[16/5] w-full"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-neutral-400">Avatar</p>
                    <div className="flex items-start gap-4">
                      <ImageDropzone
                        file={avatarFile}
                        onPick={setAvatarFile}
                        onClear={() => setAvatarFile(null)}
                        maxBytes={MAX_AVATAR_BYTES}
                        label="Upload"
                        hint="max 500KB"
                        surfaceClassName="h-20 w-20"
                        rounded
                      />
                      <p className="pt-1 text-[11px] leading-relaxed text-neutral-600">
                        Both are optional. Without them your community gets a generated banner and avatar derived from its name, which looks
                        deliberate rather than empty.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {step === "privacy" && (
                <SelectionCardGroup label="Visibility" className="grid gap-2.5">
                  {VISIBILITY_OPTIONS.map((v) => {
                    const blocked = communityType === "private_circle" && v.value === "public";
                    return (
                      <SelectionCard
                        key={v.value}
                        selected={visibility === v.value}
                        onSelect={() => setVisibility(v.value)}
                        title={v.label}
                        description={v.description}
                        icon={<VisibilityIcon visibility={v.value} />}
                        disabled={blocked}
                        footnote={blocked ? "Not available for a Private Circle." : undefined}
                      />
                    );
                  })}
                </SelectionCardGroup>
              )}

              {step === "features" && (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-neutral-500">
                    Sensible defaults for a {meta.label.toLowerCase()} are already on. You can change any of this later.
                  </p>
                  <div className="space-y-2">
                    {/* Required modules are shown, not hidden - "why can't I turn off Feed" is a
                        better question to answer up front than to leave the user hunting for. */}
                    {enabledModules
                      .filter((m) => !availableToggles.includes(m))
                      .map((m) => (
                        <div key={m} className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-3.5 py-2.5">
                          <span>
                            <span className="block text-sm text-neutral-300">{MODULE_LABELS[m]}</span>
                            <span className="block text-[11px] text-neutral-600">{MODULE_DESCRIPTIONS[m]}</span>
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Always on</span>
                        </div>
                      ))}

                    {availableToggles.map((m) => {
                      const on = enabledModules.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() => setFeatures((prev) => ({ ...prev, [m]: !on }))}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition ${
                            on ? "border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.05]" : "border-[var(--f1-line)] hover:border-white/20"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-white">{MODULE_LABELS[m]}</span>
                            <span className="block text-[11px] text-neutral-500">{MODULE_DESCRIPTIONS[m]}</span>
                          </span>
                          <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-[var(--f1-red)]" : "bg-white/10"}`} aria-hidden>
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {!meta.f1 && (
                    <p className="text-[11px] leading-relaxed text-neutral-600">
                      Race predictions and leaderboards are F1-specific, so they aren&apos;t offered here. Switch the type to an F1 Community or
                      Prediction League if you want them.
                    </p>
                  )}
                </div>
              )}

              {step === "review" && (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
                    {bannerPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={bannerPreview} alt="" className="aspect-[16/5] w-full object-cover" />
                    ) : (
                      <GroupBanner bannerUrl={null} seed={trimmedName || "preview"} />
                    )}
                    <div className="px-4 pb-4">
                      <div className="-mt-6 flex items-end">
                        <span className="rounded-full ring-4 ring-zinc-900">
                          {avatarPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarPreview} alt="" width={48} height={48} className="rounded-full object-cover" style={{ width: 48, height: 48 }} />
                          ) : (
                            <EntityAvatar imageUrl={null} name={trimmedName || "?"} size={48} />
                          )}
                        </span>
                      </div>
                      <p className="mt-2.5 text-base font-semibold text-white">{trimmedName}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {meta.label} · {VISIBILITY_OPTIONS.find((v) => v.value === visibility)?.label}
                        {topic ? ` · ${topic}` : ""}
                      </p>
                      {description.trim() && <p className="mt-2 text-xs leading-relaxed text-neutral-400">{description.trim()}</p>}
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--f1-line)] pt-3">
                        {enabledModules.map((m) => (
                          <span key={m} className="rounded-full border border-[var(--f1-line)] px-2 py-0.5 text-[10px] text-neutral-400">
                            {MODULE_LABELS[m]}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="community-invite" className="block text-xs font-medium text-neutral-400">
                      Invite people <span className="text-neutral-600">(optional)</span>
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id="community-invite"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addEmail();
                          }
                        }}
                        type="email"
                        placeholder="person@email.com"
                        className="flex-1 rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={addEmail}
                        className="shrink-0 rounded-lg border border-[var(--f1-line)] px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:border-white/30"
                      >
                        Add
                      </button>
                    </div>
                    {emailError && <p className="mt-1 text-[11px] text-[var(--f1-red)]">{emailError}</p>}
                    {emails.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {emails.map((email) => (
                          <span key={email} className="flex items-center gap-1.5 rounded-full border border-[var(--f1-line)] bg-black/20 px-2.5 py-1 text-[11px] text-neutral-300">
                            {email}
                            <button type="button" onClick={() => setEmails((prev) => prev.filter((e) => e !== email))} aria-label={`Remove ${email}`} className="text-neutral-500 hover:text-white">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-600">You&apos;ll be the admin. Everything here can be changed later from Manage.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/[0.07] px-3 py-2 text-xs text-[var(--f1-red)]">
              {error}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => (stepIndex === 0 ? onClose() : go(-1))}
            disabled={submitting}
            className="text-sm text-neutral-400 transition hover:text-white disabled:opacity-40"
          >
            {stepIndex === 0 ? "Cancel" : "Back"}
          </button>

          {step === "review" ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create Community"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(1)}
              disabled={!canAdvance}
              className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              Next
            </button>
          )}
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
