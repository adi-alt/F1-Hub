"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Activity, BarChart2, Check, ChevronDown, Compass, Crosshair, FaceSlightlySmiling, Image, ImagePlay, Plus, ShieldAlert, Tag, Target, Trash2, X, type LucideIcon } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/providers/AuthProvider";
import { canDo, postKindsFor, type F1DataCard, type F1Tag } from "@/lib/communities";
import { PredictionComposer, type RaceOption } from "./post/PredictionComposer";
import { ComposeAssist } from "./post/ComposeAssist";
import { PostAttachment, type AttachmentView } from "./post/PostAttachment";
import { renderPdfFirstPage } from "./post/pdfThumbnail";
import { ScheduledChip, SchedulePost } from "./post/SchedulePost";
import type { PostStatus } from "@/lib/supabase/groupPosts";
import { fileNameFromUrl } from "@/lib/mediaKind";
import { PANEL } from "./panel";
import { CallBuilder, isCompleteCall, type CallDraft } from "./post/CallBuilder";
import type { CallableRace } from "@/lib/supabase/postCalls";
import { CommunitySelector } from "./post/CommunitySelector";
import { EmojiPicker } from "./post/EmojiPicker";
import { GifPicker } from "./post/GifPicker";
import { MentionAutocomplete } from "./post/MentionAutocomplete";
import { F1TagSelector } from "./post/F1TagSelector";
import { F1TagChip } from "./post/F1TagChip";
import { F1DataCardEmbed } from "./post/F1DataCardEmbed";
import { F1DataCardModal } from "./post/F1DataCardModal";

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const OTHER_MAX_BYTES = 2 * 1024 * 1024;
// mime -> max bytes for that mime - mirrors /api/posts/media/route.ts's own map exactly (client-
// side pre-check, not the real enforcement - that's still the server + the bucket's own cap).
const MEDIA_MAX_BYTES: Record<string, number> = {
"image/png": IMAGE_MAX_BYTES,
"image/jpeg": IMAGE_MAX_BYTES,
"image/webp": IMAGE_MAX_BYTES,
"image/gif": IMAGE_MAX_BYTES,
"video/mp4": OTHER_MAX_BYTES,
"video/webm": OTHER_MAX_BYTES,
"application/pdf": OTHER_MAX_BYTES,
"application/msword": OTHER_MAX_BYTES,
"application/vnd.openxmlformats-officedocument.wordprocessingml.document": OTHER_MAX_BYTES,
"application/vnd.ms-excel": OTHER_MAX_BYTES,
"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": OTHER_MAX_BYTES,
};
const FILE_ACCEPT = Object.keys(MEDIA_MAX_BYTES).join(",");
const DRAFT_PREFIX = "f1hub_post_draft:";
const POLL_DURATIONS = [
  { value: 24, label: "24 hours" },
  { value: 72, label: "3 days" },
  { value: 168, label: "7 days" },
] as const;

type SavedPostDraft = {
  title: string;
  content: string;
  groupId: string;
};

function readSavedDraft(key: string): SavedPostDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedPostDraft>;
    if (typeof parsed.title !== "string" || typeof parsed.content !== "string" || typeof parsed.groupId !== "string") return null;
    if (!parsed.title && !parsed.content) return null;
    return { title: parsed.title, content: parsed.content, groupId: parsed.groupId };
  } catch {
    return null;
  }
}

function clearSavedDraft(key: string | null) {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Draft persistence is best-effort; a blocked or full browser store must not affect posting.
  }
}

function checkMention(val: string, pos: number): { query: string; startIndex: number } | null {
  const before = val.slice(0, pos);
  const match = /(?:^|\s)@([a-zA-Z0-9_.-]*)$/.exec(before);
  if (!match) return null;
  const atPos = before.lastIndexOf("@");
  return { query: match[1], startIndex: atPos };
}

/**
 * The feed's own composer: avatar, one real input, and a row of the attachments/post-type controls
 * underneath it - always visible, not collapsed behind a placeholder row that has to be clicked
 * once before anything appears.
 *
 * Every control in that row does something real. There is deliberately no "Poll" button: no poll
 * table, endpoint or post kind exists anywhere in this app, and a control that opens nothing is
 * worse than one fewer control. "Prediction" is real - it sets the post's `kind`, which createPost
 * re-validates against the target community's own enabled modules server-side - so it only appears
 * when the community you're actually posting to offers it.
 *
 * A community is genuinely optional (CommunitySelector's own "No community" option) - selecting
 * nothing posts a real personal post, not a fake default group. `fixedGroupId` is what a caller
 * passes when the target is already known (the rail has a community selected), which hides the
 * selector rather than showing it pre-filled and disabled.
 */
/** What the composer actually needs to know about a community: enough to name it, to work out
 * which post kinds it offers, and to check the viewer's permissions in it. Structural rather than
 * GroupSummary itself, so a surface that only holds ONE community (a community's own page, which
 * has a GroupDetail and no summary rows at all) can use this composer without assembling a fake
 * GroupSummary around it. Every existing caller passes GroupSummary[], which satisfies this. */
export type ComposerCommunity = {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  communityType: string;
  features: unknown;
  permissions: unknown;
  myRole: string;
};

export function PostComposer({
  groups,
  onPosted,
  fixedGroupId,
  placeholder,
  upcomingRaces = [],
  callableRace = null,
  framed = true,
}: {
  groups: ComposerCommunity[];
  onPosted: () => void;
  /** The community this composer always posts to. The selector is replaced by a plain "posting to"
   * chip rather than hidden: on a community's own page the target is never in doubt, but it should
   * still be visible, and offering a dropdown there would invite cross-posting away from the page
   * the person is looking at. */
  fixedGroupId?: string;
  placeholder?: string;
  /** This season's un-finished rounds, for opening a prediction. Empty (the default) simply means
   * no prediction mode is offered - every other caller of this composer passes nothing. */
  upcomingRaces?: RaceOption[];
  /** This weekend's race while calls on it are still open (takes with receipts); null hides "Make a call". */
  callableRace?: CallableRace | null;
  /** False inside a dialog, whose panel is already the container (one container level). */
  framed?: boolean;
}) {
  const { user, displayName, avatar } = useAuth();
  const draftKey = user?.uid ? `${DRAFT_PREFIX}${user.uid}:${fixedGroupId ?? "any-community"}` : null;
  const [focused, setFocused] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [groupId, setGroupId] = useState(fixedGroupId ?? "");
  const [isPrediction, setIsPrediction] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  // The attachment exactly as it will be stored and rendered - so the composer preview below is
  // the same component, with the same data, that the published post will show.
  const [attachment, setAttachment] = useState<AttachmentView | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [posting, setPosting] = useState(false);
  // "Posted" (or "Scheduled") on the button for a moment after a post goes out, so the send is confirmed where it
  // was made.
  const [justPosted, setJustPosted] = useState<"Posted" | "Scheduled" | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [mode, setMode] = useState<"discussion" | "prediction">("discussion");
  // A `datetime-local` value, i.e. wall-clock time in the viewer's own timezone. Converted to a
  // real UTC instant only at submit (new Date(local).toISOString()), which is what makes "7:30 PM"
  // mean 7:30 PM where they are - the server stores and compares instants, never wall clocks.
  const [scheduledAt, setScheduledAt] = useState("");
  // A call on this weekend's race, graded against the result once it's in (takes with receipts).
  const [callOpen, setCallOpen] = useState(false);
  const [callDraft, setCallDraft] = useState<CallDraft | null>(null);
  const hasCall = !!callableRace && callOpen && isCompleteCall(callDraft, callableRace);
  // A call that's been started but isn't finished holds the post back, so it never goes out without the call meant.
  const callIncomplete = !!callableRace && callOpen && !hasCall;
  const [scheduledConfirmation, setScheduledConfirmation] = useState("");
  const [gallery, setGallery] = useState<AttachmentView[]>([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState<{ question: string; options: string[]; durationHours: number } | null>(null);
  const [durationMenuOpen, setDurationMenuOpen] = useState(false);
  const durationMenuRef = useRef<HTMLDivElement>(null);
  const [mentionState, setMentionState] = useState<{ query: string; startIndex: number } | null>(null);
  const justSelectedRef = useRef(false);
  const validPollOptions = pollDraft?.options.map((o) => o.trim()).filter(Boolean) ?? [];
  const pollIncomplete = pollOpen && validPollOptions.length < 2;
  const [f1Tags, setF1Tags] = useState<F1Tag[]>([]);
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [dataCard, setDataCard] = useState<F1DataCard | null>(null);
  const [showDataCardModal, setShowDataCardModal] = useState(false);

  // The communities this viewer can genuinely open a round in - their real role in each, against
  // that community's own permission map, through the exact helper createPrediction uses
  // server-side. Not "is signed in", and not "is an admin somewhere": a community that has opened
  // prediction creation up to all members qualifies, and one where they're only a member and it's
  // admins-only does not. When `fixedGroupId` is set (the rail has a community selected) the
  // choice is narrowed to that community, so the composer can't open a round somewhere else.
  const predictionCommunities = groups.filter(
    (g) => (!fixedGroupId || g.id === fixedGroupId) && canDo(g.permissions, "createPredictions", g.myRole),
  );
  const canOpenPrediction = upcomingRaces.length > 0 && predictionCommunities.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // What the Emoji, GIF, and Tag panels anchor to: each its own button. They're portaled out of this component (the
  // centre column's scroll container would otherwise clip them), so they measure a real element.
  const gifRef = useRef<HTMLButtonElement>(null);
  const emojiRef = useRef<HTMLButtonElement>(null);
  const tagRef = useRef<HTMLButtonElement>(null);
  const [showTags, setShowTags] = useState(false);
  const draftLoaded = useRef(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Restore text only after hydration, so localStorage never changes the server's first render.
  // Attachments, calls and prediction-round state intentionally stay out of this lightweight draft:
  // their server-side resources can expire or become invalid while a browser is closed.
  useEffect(() => {
    if (!draftKey || draftLoaded.current) return;
    const saved = readSavedDraft(draftKey);
    if (!saved) {
      draftLoaded.current = true;
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      draftLoaded.current = true;
      setTitle(saved.title);
      setContent(saved.content);
      if (!fixedGroupId && groups.some((group) => group.id === saved.groupId)) setGroupId(saved.groupId);
      setFocused(true);
      setDraftRestored(true);
      window.setTimeout(() => setDraftRestored(false), 2500);
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey, fixedGroupId, groups]);

  useEffect(() => {
    if (!draftKey || !draftLoaded.current) return;
    if (!title.trim() && !content.trim()) {
      clearSavedDraft(draftKey);
      return;
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify({ title, content, groupId: fixedGroupId ?? groupId } satisfies SavedPostDraft));
    } catch {
      // Draft persistence is best-effort; a blocked or full browser store must not affect posting.
    }
  }, [content, draftKey, fixedGroupId, groupId, title]);

  useEffect(() => {
    if (!durationMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (durationMenuRef.current && !durationMenuRef.current.contains(e.target as Node)) {
        setDurationMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [durationMenuOpen]);

  const targetGroupId = fixedGroupId ?? groupId;
  const targetGroup = targetGroupId ? groups.find((g) => g.id === targetGroupId) : undefined;
  const fixedCommunity = fixedGroupId ? targetGroup : undefined;
  // Real availability, read off that community's own type/features through the same helper the
  // server validates against - not a guess, and never shown for a personal post (createPost forces
  // "discussion" there, since there's no community whose vocabulary it could belong to).
  const canPredict = !!targetGroup && postKindsFor(targetGroup.communityType, targetGroup.features).includes("prediction");
  const isOpen = focused || content.length > 0 || !!mediaPreview || callOpen || pollOpen || gallery.length > 0 || !!dataCard;

  // A blob: URL (createObjectURL below) holds its referenced data in memory until explicitly
  // revoked or the document unloads - real, if minor, for a composer someone can attach/remove
  // several files through in one sitting without ever navigating away.
  function releasePreview() {
    if (mediaPreview?.startsWith("blob:")) URL.revokeObjectURL(mediaPreview);
  }

  function reset() {
    clearSavedDraft(draftKey);
    releasePreview();
    setFocused(false);
    setTitle("");
    setContent("");
    setGroupId(fixedGroupId ?? "");
    setIsPrediction(false);
    setMediaPreview(null);
    setAttachment(null);
    setGallery([]);
    setMediaUrl(null);
    setMediaError("");
    setNotice("");
    setConfirmDiscard(false);
    setScheduledAt("");
    setCallOpen(false);
    setCallDraft(null);
    setPollOpen(false);
    setPollDraft(null);
    setMentionState(null);
    setDraftRestored(false);
    setF1Tags([]);
    setIsSpoiler(false);
    setShowTags(false);
    setDataCard(null);
    setShowDataCardModal(false);
  }

  /** Closing with real work in the box asks first; closing an empty one just closes. Nothing the
   * viewer typed is thrown away on a single stray click. */
  function requestClose() {
    if (
      title.trim() ||
      content.trim() ||
      mediaPreview ||
      gallery.length > 0 ||
      (pollOpen && validPollOptions.length > 0) ||
      f1Tags.length > 0 ||
      isSpoiler ||
      dataCard
    ) {
      setConfirmDiscard(true);
      return;
    }
    reset();
  }

  async function uploadSingleFile(file: File): Promise<AttachmentView | null> {
    const maxBytes = MEDIA_MAX_BYTES[file.type];
    if (!maxBytes) {
      setMediaError("Images, video, audio, PDF, Word, Excel, PowerPoint, text or ZIP files only.");
      return null;
    }
    if (file.size > maxBytes) {
      const limitLabel = "2MB";
      setMediaError(`"${file.name}" exceeds the ${limitLabel} limit.`);
      return null;
    }
    const preview = file.type === "application/pdf" ? await renderPdfFirstPage(file) : null;
    const form = new FormData();
    form.append("media", file);
    if (preview) {
      form.append("thumbnail", new File([preview.thumbnail], "thumb.png", { type: "image/png" }));
      form.append("pages", String(preview.pages));
    }
    const res = await fetch("/api/posts/media", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as
      | { mediaUrl?: string; name?: string; mime?: string; size?: number; thumbUrl?: string | null; pages?: number | null; error?: string }
      | null;

    if (res?.ok && body?.mediaUrl) {
      return {
        url: body.mediaUrl,
        name: body.name ?? file.name,
        mime: body.mime ?? file.type,
        size: body.size ?? file.size,
        thumbUrl: body.thumbUrl ?? null,
        pages: body.pages ?? preview?.pages ?? null,
      };
    }
    setMediaError(body?.error ?? "Upload failed.");
    return null;
  }

  async function pickMediaFiles(files: File[]) {
    if (files.length === 0) return;
    setMediaError("");

    const isImageFile = (f: File) => f.type.startsWith("image/");
    const areAllImages = files.every(isImageFile);

    if (files.length > 1 || gallery.length > 0) {
      if (!areAllImages) {
        setMediaError("Galleries only support images (PNG, JPEG, WebP, GIF).");
        return;
      }
      const remainingSlots = 4 - gallery.length;
      if (remainingSlots <= 0) {
        setMediaError("You can attach up to 4 images.");
        return;
      }
      const toUpload = files.slice(0, remainingSlots);
      setUploadingMedia(true);
      const uploaded: AttachmentView[] = [];
      for (const f of toUpload) {
        const item = await uploadSingleFile(f);
        if (item) uploaded.push(item);
      }
      setUploadingMedia(false);
      if (uploaded.length > 0) {
        setGallery((prev) => {
          const next = [...prev, ...uploaded].slice(0, 4);
          if (next.length === 1) {
            setAttachment(next[0]);
            setMediaUrl(next[0].url);
            setMediaPreview(next[0].url);
          } else {
            setAttachment(null);
            setMediaUrl(next[0]?.url ?? null);
            setMediaPreview(null);
          }
          return next;
        });
      }
      return;
    }

    const file = files[0];
    setUploadingMedia(true);
    const item = await uploadSingleFile(file);
    setUploadingMedia(false);
    if (item) {
      if (isImageFile(file)) {
        setGallery([item]);
      } else {
        setGallery([]);
      }
      setAttachment(item);
      setMediaUrl(item.url);
      setMediaPreview(item.url);
    }
  }

  function removeMedia() {
    releasePreview();
    setGallery([]);
    setMediaPreview(null);
    setAttachment(null);
    setMediaUrl(null);
    setMediaError("");
  }

  function removeGalleryItem(index: number) {
    setGallery((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setAttachment(null);
        setMediaUrl(null);
        setMediaPreview(null);
      } else if (next.length === 1) {
        setAttachment(next[0]);
        setMediaUrl(next[0].url);
        setMediaPreview(next[0].url);
      }
      return next;
    });
  }

  function insertAtCursor(text: string) {
    const el = bodyRef.current;
    if (!el) {
      setContent((prev) => prev + text);
      return;
    }
    const val = el.value;
    const start = el.selectionStart ?? val.length;
    const end = el.selectionEnd ?? val.length;
    const next = val.slice(0, start) + text + val.slice(end);
    el.value = next;
    setContent(next);
    const newPos = start + text.length;
    el.setSelectionRange(newPos, newPos);
    el.focus();
  }

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setContent(next);
    const pos = e.target.selectionStart ?? next.length;
    // Mention autocomplete only activates when posting in a community
    if (targetGroupId) {
      setMentionState(checkMention(next, pos));
    } else {
      setMentionState(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionState) {
      if (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    if (justSelectedRef.current && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      return;
    }
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const pos = e.currentTarget.selectionStart ?? content.length;
      if (targetGroupId) {
        setMentionState(checkMention(content, pos));
      } else {
        setMentionState(null);
      }
    }
  }

  function handleSelectMention(username: string) {
    if (!mentionState) return;
    const el = bodyRef.current;
    const pos = el?.selectionStart ?? content.length;
    const before = content.slice(0, mentionState.startIndex);
    const after = content.slice(pos);
    const next = `${before}@${username} ${after}`.slice(0, 2000);
    setContent(next);
    setMentionState(null);
    justSelectedRef.current = true;
    setTimeout(() => {
      justSelectedRef.current = false;
    }, 300);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        const nextPos = Math.min(mentionState.startIndex + username.length + 2, 2000);
        el.setSelectionRange(nextPos, nextPos);
      }
    });
  }

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || uploadingMedia || callIncomplete || pollIncomplete) return;
    setPosting(true);
    setNotice("");
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: targetGroupId || null,
        title: title.trim() || undefined,
        content: trimmed,
        mediaUrl: gallery.length > 0 ? gallery[0].url : mediaUrl,
        attachment:
          gallery.length < 2 && (attachment || (gallery.length === 1 ? gallery[0] : null))
            ? {
                name: (attachment ?? gallery[0]).name,
                mime: (attachment ?? gallery[0]).mime,
                size: (attachment ?? gallery[0]).size,
                thumbUrl: (attachment ?? gallery[0]).thumbUrl,
                pages: (attachment ?? gallery[0]).pages,
              }
            : null,
        gallery:
          gallery.length >= 2
            ? gallery.map((g) => ({
                url: g.url,
                name: g.name,
                mime: g.mime,
                size: g.size,
                thumbUrl: g.thumbUrl,
              }))
            : undefined,
        poll:
          pollOpen && validPollOptions.length >= 2
            ? {
                question: pollDraft?.question.trim() || undefined,
                options: validPollOptions,
                durationHours: pollDraft?.durationHours ?? 24,
              }
            : undefined,
        kind: isPrediction && canPredict ? "prediction" : undefined,
        scheduledAt: scheduledAt && !hasCall ? new Date(scheduledAt).toISOString() : null,
        call: hasCall && callableRace && callDraft ? { raceId: callableRace.raceId, ...callDraft } : undefined,
        f1Tags: f1Tags.length > 0 ? f1Tags : undefined,
        isSpoiler: isSpoiler || undefined,
        dataCard: dataCard || undefined,
      }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { status?: PostStatus; scheduledAt?: string | null; error?: string } | null;
    if (res?.ok) {
      // A scheduled post deliberately does NOT appear in the feed yet, so say where it went -
      // otherwise a successful schedule is indistinguishable from a post that vanished.
      if (body?.status === "scheduled" && body.scheduledAt) {
        setScheduledConfirmation(new Date(body.scheduledAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }));
      }
      onPosted();
      reset();
      setJustPosted(body?.status === "scheduled" ? "Scheduled" : "Posted");
      setTimeout(() => setJustPosted(null), 2000);
    } else {
      setNotice(body?.error ?? "Couldn't post. Check your connection and try again.");
    }
    setPosting(false);
  }

  return (
    // One unit: your photo, a borderless field and the tools under it on the site's glass panel, so they read as one
    // interaction. Focus anywhere inside lifts the panel's edge. Idle and open are the same panel; opening adds the
    // title line and grows the field.
    <div className={framed ? `relative px-4 py-3 ${PANEL} transition-colors duration-fast focus-within:border-white/[0.16]` : "relative"}>
      {(isOpen || mode === "prediction") && (
        <button
          type="button"
          onClick={mode === "prediction" ? () => setMode("discussion") : requestClose}
          aria-label={mode === "prediction" ? "Cancel prediction round" : "Close composer"}
          title={mode === "prediction" ? "Cancel prediction round" : "Close composer"}
          className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full text-tertiary transition-colors duration-fast hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Icon icon={X} size={16} />
        </button>
      )}

      {confirmDiscard && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-control bg-warning/[0.08] px-3 py-2">
          <p className="min-w-0 flex-1 text-caption font-medium text-primary">Discard this draft?</p>
          <button type="button" onClick={() => setConfirmDiscard(false)} className="shrink-0 rounded-control text-caption font-medium text-secondary transition-colors duration-fast hover:text-primary">
            Keep editing
          </button>
          <button type="button" onClick={reset} className="shrink-0 rounded-control text-caption font-semibold text-danger transition-colors duration-fast hover:brightness-125">
            Discard
          </button>
        </div>
      )}

      {mode === "prediction" ? (
        <div className="flex items-start gap-3">
          <PersonAvatar id={user?.uid ?? ""} avatar={avatar} size={32} />
          <div className="min-w-0 flex-1">
            <p className="pr-8 text-body-sm font-semibold text-primary">New prediction round</p>
            <PredictionComposer
              communities={predictionCommunities}
              races={upcomingRaces}
              onCreated={() => {
                setMode("discussion");
                onPosted();
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <PersonAvatar id={user?.uid ?? ""} avatar={avatar} size={32} />
            <div className="min-w-0 flex-1 pr-8">
              {isOpen && (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (optional)"
                  maxLength={300}
                  aria-label="Post title"
                  className="block w-full bg-transparent pt-1 text-body-sm font-semibold text-primary placeholder:font-normal placeholder:text-tertiary focus:outline-none"
                />
              )}
              <textarea
                ref={bodyRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onFocus={() => setFocused(true)}
                placeholder={placeholder ?? (displayName ? `What's on your mind, ${displayName.split(" ")[0]}?` : "What's on your mind?")}
                aria-label="Post"
                rows={isOpen ? 3 : 1}
                maxLength={2000}
                // Idle it is one line and clips a long placeholder rather than wrapping it into a second line the row
                // can't show; focused it opens to three rows and wraps normally.
                className={`block w-full resize-none bg-transparent text-body-sm leading-6 text-primary placeholder:text-tertiary focus:outline-none ${
                  isOpen ? "mt-1 min-h-[4.5rem]" : "cursor-text overflow-hidden text-ellipsis whitespace-nowrap py-1"
                }`}
              />
            </div>
          </div>

          {mentionState && targetGroupId && (
            <MentionAutocomplete
              query={mentionState.query}
              groupId={targetGroupId}
              onSelect={handleSelectMention}
              onClose={() => setMentionState(null)}
            />
          )}

          {callOpen && callableRace && (
            <div className="pl-11">
              <CallBuilder
                race={callableRace}
                value={callDraft}
                onChange={setCallDraft}
                onRemove={() => {
                  setCallOpen(false);
                  setCallDraft(null);
                }}
              />
            </div>
          )}

          {pollOpen && (
            <div className="pl-11 pt-2">
              <div className="space-y-3 rounded-control border border-white/10 bg-surface-2/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-secondary">
                    <Icon icon={BarChart2} size={16} className="text-brand" />
                    Poll
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPollOpen(false);
                      setPollDraft(null);
                    }}
                    className="rounded-control text-caption text-tertiary transition-colors hover:text-primary"
                  >
                    Remove poll
                  </button>
                </div>

                <input
                  type="text"
                  value={pollDraft?.question ?? ""}
                  onChange={(e) =>
                    setPollDraft((prev) => ({
                      question: e.target.value,
                      options: prev?.options ?? ["", ""],
                      durationHours: prev?.durationHours ?? 24,
                    }))
                  }
                  placeholder="Poll question (optional, uses post text if blank)"
                  maxLength={140}
                  className="w-full rounded-control border border-white/10 bg-surface-1 px-3 py-1.5 text-body-sm text-primary placeholder:text-tertiary focus:border-white/20 focus:outline-none"
                />

                <div className="space-y-2">
                  {pollDraft?.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const next = [...(pollDraft?.options ?? ["", ""])];
                          next[idx] = e.target.value;
                          setPollDraft((prev) => ({
                            question: prev?.question ?? "",
                            options: next,
                            durationHours: prev?.durationHours ?? 24,
                          }));
                        }}
                        placeholder={`Option ${idx + 1}`}
                        maxLength={80}
                        className="flex-1 rounded-control border border-white/10 bg-surface-1 px-3 py-1.5 text-body-sm text-primary placeholder:text-tertiary focus:border-white/20 focus:outline-none"
                      />
                      {pollDraft.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = pollDraft.options.filter((_, i) => i !== idx);
                            setPollDraft((prev) => ({
                              question: prev?.question ?? "",
                              options: next,
                              durationHours: prev?.durationHours ?? 24,
                            }));
                          }}
                          className="flex size-7 items-center justify-center rounded-control text-tertiary hover:bg-white/[0.06] hover:text-danger"
                          aria-label={`Remove option ${idx + 1}`}
                        >
                          <Icon icon={Trash2} size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-1">
                  {pollDraft && pollDraft.options.length < 6 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPollDraft((prev) => ({
                          question: prev?.question ?? "",
                          options: [...(prev?.options ?? ["", ""]), ""],
                          durationHours: prev?.durationHours ?? 24,
                        }))
                      }
                      className="flex items-center gap-1 rounded-control px-2 py-1 text-caption font-medium text-secondary hover:bg-white/[0.06] hover:text-primary"
                    >
                      <Icon icon={Plus} size={16} />
                      Add option
                    </button>
                  ) : (
                    <div />
                  )}

                  <div ref={durationMenuRef} className="relative flex items-center gap-1.5 text-caption text-secondary">
                    <span>Duration:</span>
                    <button
                      type="button"
                      onClick={() => setDurationMenuOpen((v) => !v)}
                      aria-haspopup="listbox"
                      aria-expanded={durationMenuOpen}
                      className="inline-flex h-7 items-center gap-1.5 rounded-control border border-white/10 bg-surface-1 px-2 text-caption font-medium text-primary transition-colors hover:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <span>{POLL_DURATIONS.find((d) => d.value === (pollDraft?.durationHours ?? 24))?.label ?? "24 hours"}</span>
                      <Icon icon={ChevronDown} size={16} className={`size-3 text-tertiary transition-transform duration-fast ${durationMenuOpen ? "rotate-180" : ""}`} />
                    </button>
                    {durationMenuOpen && (
                      <div
                        role="listbox"
                        aria-label="Poll duration"
                        className="absolute bottom-full right-0 z-popover mb-1 min-w-[110px] overflow-hidden rounded-lg border border-white/12 bg-surface-1/95 p-1 shadow-overlay backdrop-blur-md"
                      >
                        {POLL_DURATIONS.map((dur) => {
                          const isSelected = (pollDraft?.durationHours ?? 24) === dur.value;
                          return (
                            <button
                              key={dur.value}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setPollDraft((prev) => ({
                                  question: prev?.question ?? "",
                                  options: prev?.options ?? ["", ""],
                                  durationHours: dur.value,
                                }));
                                setDurationMenuOpen(false);
                              }}
                              className={`flex w-full items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-left text-caption transition-colors duration-fast ${
                                isSelected ? "bg-white/[0.08] font-semibold text-primary" : "text-secondary hover:bg-white/[0.04] hover:text-primary"
                              }`}
                            >
                              <span>{dur.label}</span>
                              {isSelected && <Icon icon={Check} size={16} className="size-3 text-brand" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {gallery.length >= 2 && (
            <div className="space-y-1.5 pl-11 pt-2">
              <div className="flex items-center justify-between text-caption text-secondary">
                <span className="font-medium text-primary">{gallery.length} of 4 photos attached</span>
                {gallery.length < 4 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-control text-brand font-medium hover:underline"
                  >
                    + Add more photos
                  </button>
                )}
              </div>
              <div className={`grid gap-2 overflow-hidden rounded-lg ${gallery.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                {gallery.map((item, idx) => (
                  <div key={`${item.url}-${idx}`} className="group relative aspect-[4/3] overflow-hidden rounded-control border border-white/10 bg-black/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumbUrl ?? item.url} alt={item.name ?? `Photo ${idx + 1}`} className="size-full object-cover" />
                    <div className="absolute bottom-1.5 left-1.5 rounded-control bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                      {idx + 1}/{gallery.length}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGalleryItem(idx)}
                      aria-label={`Remove photo ${idx + 1}`}
                      className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/75 text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <Icon icon={X} size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {((gallery.length < 2 && attachment) || mediaError || scheduledConfirmation) && (
            <div className="space-y-2 pl-11 pt-2">
              {gallery.length < 2 && attachment && (
                // The SAME component the published post renders, so what is previewed here is literally what will
                // appear in the feed.
                <div className="max-w-full">
                  <PostAttachment attachment={attachment} onRemove={removeMedia} />
                  {attachment.mime?.startsWith("image/") && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1.5 inline-flex items-center gap-1 text-caption text-secondary hover:text-brand transition-colors"
                    >
                      <Icon icon={Plus} size={16} />
                      <span>Add another photo (turn into gallery)</span>
                    </button>
                  )}
                  {uploadingMedia && <p className="mt-1 text-caption text-tertiary">Uploading…</p>}
                </div>
              )}
              {mediaError && <p className="text-caption text-danger">{mediaError}</p>}
              {scheduledConfirmation && (
                <div className="flex flex-wrap items-center gap-2 rounded-control border border-success/25 bg-success/[0.07] px-3 py-2">
                  <p className="min-w-0 flex-1 text-caption text-primary">Scheduled for {scheduledConfirmation}. It won&apos;t appear in the feed until then.</p>
                  <button type="button" onClick={() => setScheduledConfirmation("")} className="shrink-0 rounded-control text-caption font-medium text-secondary transition-colors duration-fast hover:text-primary">
                    Got it
                  </button>
                </div>
              )}
            </div>
          )}

          {uploadingMedia && gallery.length === 0 && !attachment && (
            <div className="pl-11 pt-2">
              <div className="flex items-center gap-2 rounded-control border border-white/10 bg-white/[0.03] px-3 py-2 text-caption text-secondary">
                <span className="text-brand">⏳</span>
                <span>Uploading photo…</span>
              </div>
            </div>
          )}

          {/* Active F1 Entity Tags */}
          {f1Tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-11 pt-2 text-caption">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">Topics:</span>
              {f1Tags.map((tag) => (
                <F1TagChip
                  key={`${tag.category}-${tag.id}`}
                  tag={tag}
                  onRemove={() => setF1Tags((prev) => prev.filter((t) => !(t.category === tag.category && t.id === tag.id)))}
                />
              ))}
              {f1Tags.length < 3 && (
                <button
                  type="button"
                  onClick={() => setShowTags(true)}
                  className="inline-flex items-center gap-1 rounded-control border border-dashed border-white/20 bg-white/[0.03] px-2 py-0.5 text-caption text-secondary hover:border-white/35 hover:text-primary transition-colors"
                >
                  <Icon icon={Plus} size={16} />
                  <span>Add</span>
                </button>
              )}
            </div>
          )}

          {/* Spoiler Shield Active Explainer Banner */}
          {isSpoiler && (
            <div className="pl-11 pt-2">
              <div className="flex items-center justify-between gap-3 rounded-control border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-caption text-amber-200">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon icon={ShieldAlert} size={16} className="text-amber-400 shrink-0" />
                  <p className="min-w-0 flex-1 text-caption text-amber-200 leading-snug">
                    <strong className="font-semibold text-amber-300">Spoiler Shield ON:</strong> Blurs post content & photos in feeds with a click-to-reveal barrier to protect race & qualifying results for fans watching on replay.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSpoiler(false)}
                  className="shrink-0 rounded-control px-2 py-0.5 text-[11px] font-semibold text-amber-300 hover:text-amber-100 hover:bg-amber-500/20 transition-colors"
                >
                  Turn off
                </button>
              </div>
            </div>
          )}

          {/* Active F1 Data Card Preview (Level 3.2) */}
          {dataCard && (
            <div className="pl-11 pt-2">
              <div className="relative">
                <F1DataCardEmbed dataCard={dataCard} />
                <button
                  type="button"
                  onClick={() => setDataCard(null)}
                  title="Remove data card"
                  aria-label="Remove data card"
                  className="absolute right-2.5 top-6 flex size-6 items-center justify-center rounded-full bg-surface-2 text-secondary shadow-md hover:bg-surface-3 hover:text-primary transition-colors"
                >
                  <Icon icon={X} size={16} className="size-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* The toolbar: monochrome tools on the left, where the post goes and the Post button on the right. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-0.5 pl-9">
            <ToolButton onClick={() => fileInputRef.current?.click()} icon={Image} label="Photos (up to 4)" />
            <ToolButton ref={gifRef} onClick={() => setShowGif((v) => !v)} active={showGif} icon={ImagePlay} label="GIF" />
            <ToolButton ref={emojiRef} onClick={() => setShowEmoji((v) => !v)} active={showEmoji} icon={FaceSlightlySmiling} label="Emoji" />
            <ToolButton
              onClick={() => {
                setPollOpen((v) => {
                  if (!v && !pollDraft) {
                    setPollDraft({ question: "", options: ["", ""], durationHours: 24 });
                  }
                  return !v;
                });
              }}
              active={pollOpen}
              icon={BarChart2}
              label="Poll"
            />
            <ToolButton
              ref={tagRef}
              onClick={() => setShowTags((v) => !v)}
              active={showTags || f1Tags.length > 0}
              icon={Tag}
              label={f1Tags.length > 0 ? `F1 Topics (${f1Tags.length}/3)` : "Tag F1 topic (driver, team, session, GP)"}
            />
            <ToolButton
              onClick={() => setIsSpoiler((v) => !v)}
              active={isSpoiler}
              activeTone="amber"
              icon={ShieldAlert}
              label={
                isSpoiler
                  ? "Spoiler Shield ON (click to remove)"
                  : "Spoiler Shield: Blur post in feed to hide race results & outcomes until clicked"
              }
            />
            <ToolButton
              onClick={() => setShowDataCardModal(true)}
              active={!!dataCard}
              activeTone="cyan"
              icon={Activity}
              label={dataCard ? `F1 Data: ${dataCard.kind} attached` : "Attach F1 Data Card (Telemetry, Stints, Win Odds)"}
            />
            <ComposeAssist draft={content} onReplace={setContent} />
            {canPredict && <ToolButton onClick={() => setIsPrediction((v) => !v)} active={isPrediction} icon={Compass} label="Prediction" />}
            {/* A different thing from the tag above: that marks THIS post as prediction talk, this opens a real
                round the community can enter. Only where the viewer holds the permission; the server re-checks. */}
            {canOpenPrediction && <ToolButton onClick={() => setMode("prediction")} icon={Crosshair} label="New round" />}
            {/* Takes with receipts: claim something about this weekend's race and have it graded against the result. */}
            {callableRace && <ToolButton onClick={() => setCallOpen((v) => !v)} active={callOpen} icon={Target} label="Make a call" />}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length > 0) void pickMediaFiles(files);
              }}
            />

            <div className="ml-auto flex items-center gap-2">
              {notice && <span role="alert" className="text-caption text-danger">{notice}</span>}
              {draftRestored && <span className="text-caption text-secondary">Draft restored</span>}
              {fixedGroupId
                ? isOpen &&
                  fixedCommunity && (
                    <span className="flex h-8 min-w-0 items-center gap-2 rounded-control bg-surface-2 px-2.5 text-caption text-secondary">
                      <EntityAvatar imageUrl={fixedCommunity.avatarUrl} name={fixedCommunity.name} seed={fixedCommunity.id} size={16} shape="square" />
                      <span className="min-w-0 max-w-[10rem] truncate">{fixedCommunity.name}</span>
                    </span>
                  )
                : isOpen && (
                    <div className="w-52 max-w-[14rem]">
                      <CommunitySelector groups={groups} value={groupId} onChange={setGroupId} />
                    </div>
                  )}
              {/* Scheduling lives inside the post control: it's a choice about how this post is published, not
                  something attached to it. The caret only appears when there's a real alternative to offer. */}
              {/* Once a time is chosen it shows as its own chip beside the button, not squeezed inside it. */}
              {scheduledAt && !hasCall && <ScheduledChip value={scheduledAt} onClear={() => setScheduledAt("")} />}
              <div className="flex shrink-0 items-stretch overflow-hidden rounded-control">
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={posting || uploadingMedia || !content.trim() || callIncomplete || pollIncomplete}
                  aria-busy={posting}
                  title={
                    pollIncomplete
                      ? "Add at least 2 poll options, or remove the poll"
                      : callIncomplete
                        ? "Finish the call, or remove it"
                        : !content.trim() && !posting
                          ? "Write something to post"
                          : undefined
                  }
                  className={`flex h-8 items-center gap-1.5 px-3.5 text-body-sm font-semibold transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed ${
                    justPosted ? "bg-success/15 text-success" : "bg-brand text-white hover:bg-brand-hover disabled:bg-white/[0.08] disabled:text-tertiary"
                  }`}
                >
                  {justPosted && <Icon icon={Check} size={16} />}
                  {posting ? (scheduledAt ? "Scheduling…" : "Posting…") : (justPosted ?? (scheduledAt ? "Schedule" : "Post"))}
                </button>
                {/* A call has to go out before its session, so a post that carries one can't be scheduled. */}
                {content.trim() && !scheduledAt && !hasCall && <SchedulePost onChange={setScheduledAt} />}
              </div>
            </div>
          </div>

          {/* Each panel opens from the button that asked for it (popovers.md: point at the element that revealed
              it), portaled out of the scrolling feed so nothing clips it. */}
          <AnimatePresence>
            {showEmoji && <EmojiPicker anchorRef={emojiRef} onSelect={insertAtCursor} onClose={() => setShowEmoji(false)} />}
            {showGif && (
              <GifPicker
                anchorRef={gifRef}
                onSelect={(url) => {
                  setMediaUrl(url);
                  setMediaPreview(url);
                  setAttachment({ url, name: fileNameFromUrl(url), mime: "image/gif", size: null, thumbUrl: null, pages: null });
                  setShowGif(false);
                }}
                onClose={() => setShowGif(false)}
              />
            )}
            {showTags && (
              <F1TagSelector
                anchorRef={tagRef}
                tags={f1Tags}
                onChange={setF1Tags}
                onClose={() => setShowTags(false)}
                upcomingRaces={upcomingRaces}
              />
            )}
            <F1DataCardModal
              open={showDataCardModal}
              onClose={() => setShowDataCardModal(false)}
              onSelect={(card) => setDataCard(card)}
            />
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

/** A toolbar tool: an icon-only 28px ghost button (quieter than Post), named by its tooltip and accessible label. */
function ToolButton({
  ref,
  onClick,
  icon,
  label,
  active,
  activeTone = "default",
}: {
  ref?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  activeTone?: "default" | "amber" | "cyan";
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex size-7 shrink-0 items-center justify-center rounded-control transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        active
          ? activeTone === "amber"
            ? "border border-amber-500/40 bg-amber-500/20 text-amber-300"
            : activeTone === "cyan"
              ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
              : "bg-white/[0.1] text-primary"
          : "text-tertiary hover:bg-white/[0.07] hover:text-primary"
      }`}
    >
      <Icon icon={icon} size={16} />
    </button>
  );
}
