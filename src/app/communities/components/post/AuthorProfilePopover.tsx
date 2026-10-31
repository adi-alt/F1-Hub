"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { groupHref } from "@/lib/routes";
import { computePredictorFlairs } from "@/lib/predictorFlairs";
import { PredictorFlairsList } from "./PredictorFlair";
import type { AvatarConfig } from "@/lib/avatar";
import type { GroupRole } from "@/lib/supabase/groups";
import type { AuthorRecord } from "@/lib/supabase/postCalls";
import { useAuth } from "@/providers/AuthProvider";
import { Compass, ExternalLink, Target } from "lucide-react";

const CARD_WIDTH = 288; // w-72 = 18rem = 288px
const OPEN_DELAY_MS = 160;
const CLOSE_DELAY_MS = 220;

type RectPos = {
  top?: number;
  bottom?: number;
  left: number;
  isAbove: boolean;
};

export function AuthorProfilePopover({
  userId,
  authorName,
  authorAvatar,
  authorRole,
  authorRecord,
  groupId,
  groupName,
  children,
}: {
  userId: string;
  authorName: string;
  authorAvatar?: AvatarConfig | null;
  authorRole?: GroupRole | null;
  authorRecord?: AuthorRecord | null;
  groupId?: string | null;
  groupName?: string | null;
  children: (props: { ref: React.Ref<HTMLButtonElement>; toggle: () => void; open: boolean }) => ReactNode;
}) {
  const { user } = useAuth();
  const isMe = Boolean(user && (user.uid === userId || (!userId && authorName === "You")));
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<RectPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  function clearTimers() {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spacing = 8;
    const estimatedHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const isAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    const left = Math.max(12, Math.min(rect.left, window.innerWidth - CARD_WIDTH - 12));
    if (isAbove) {
      setPos({ bottom: window.innerHeight - rect.top + spacing, left, isAbove: true });
    } else {
      setPos({ top: rect.bottom + spacing, left, isAbove: false });
    }
  }

  function handleOpen() {
    clearTimers();
    updatePosition();
    setOpen(true);
  }

  const handleClose = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, []);

  function handleMouseEnter() {
    clearTimers();
    if (open) return;
    openTimerRef.current = setTimeout(() => {
      handleOpen();
    }, OPEN_DELAY_MS);
  }

  function handleMouseLeave() {
    clearTimers();
    if (!open) return;
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }

  function toggle() {
    clearTimers();
    if (open) {
      setOpen(false);
    } else {
      handleOpen();
    }
  }

  useEffect(() => {
    return () => clearTimers();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || cardRef.current?.contains(target)) {
        return;
      }
      handleClose();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, handleClose]);

  const totalCalls = authorRecord ? authorRecord.settled : 0;
  const winRate = totalCalls > 0 && authorRecord ? Math.round((authorRecord.correct / totalCalls) * 100) : null;

  return (
    <span
      className="inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children({ ref: triggerRef, toggle, open })}

      {isClient &&
        open &&
        pos &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={cardRef}
              role="dialog"
              aria-label={`About ${authorName}`}
              onMouseEnter={() => clearTimers()}
              onMouseLeave={handleMouseLeave}
              initial={{ opacity: 0, scale: 0.96, y: pos.isAbove ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top !== undefined ? pos.top : undefined,
                bottom: pos.bottom !== undefined ? pos.bottom : undefined,
                width: CARD_WIDTH,
                zIndex: 60,
              }}
              className="overflow-hidden rounded-xl border border-white/12 bg-surface-1/95 shadow-overlay backdrop-blur-md"
            >
              {/* Header banner gradient accent */}
              <div className="relative h-11 w-full border-b border-white/[0.06] bg-gradient-to-r from-brand/25 via-surface-2/60 to-brand/10">
                <div className="absolute right-3 top-2.5 flex items-center gap-1.5">
                  {authorRole && authorRole !== "member" ? (
                    <Badge tone="neutral">{authorRole === "admin" ? "Admin" : "Moderator"}</Badge>
                  ) : isMe ? (
                    <Badge tone="neutral">You</Badge>
                  ) : null}
                </div>
              </div>

              <div className="px-3.5 pb-3.5 pt-0">
                {/* Avatar overlapping banner */}
                <div className="flex items-end justify-between">
                  <div className="-mt-6 rounded-full bg-surface-1 p-0.5 shadow-md ring-1 ring-white/10">
                    <PersonAvatar id={(isMe ? user?.uid : userId) || authorName} avatar={authorAvatar ?? null} size={42} />
                  </div>
                  {isMe && (
                    <Link
                      href="/profile"
                      onClick={handleClose}
                      className="inline-flex items-center gap-1 rounded-control border border-white/10 bg-white/[0.04] px-2 py-0.5 text-caption font-medium text-secondary transition-colors hover:border-white/20 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <span>Edit profile</span>
                      <Icon icon={ExternalLink} size={16} className="size-3 text-tertiary" />
                    </Link>
                  )}
                </div>

                {/* Name & Title */}
                <div className="mt-2 min-w-0">
                  <p className="truncate text-body-sm font-semibold text-primary">{authorName}</p>
                  <p className="text-caption text-tertiary">Apex Community Member</p>
                </div>

                {/* Verified Predictor Flairs (Level 3.3) */}
                {authorRecord && (
                  <div className="mt-2">
                    <PredictorFlairsList flairs={computePredictorFlairs({ authorRecord })} size="md" />
                  </div>
                )}

                {/* Season Call / Prediction stats if present */}
                {authorRecord && totalCalls > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-control border border-white/[0.08] bg-surface-2/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Icon icon={Target} size={16} className="text-brand" />
                      <div>
                        <p className="text-caption font-semibold leading-none text-primary">
                          {authorRecord.correct} of {authorRecord.settled} calls
                        </p>
                        <p className="mt-0.5 text-caption text-tertiary">Season calls</p>
                      </div>
                    </div>
                    {winRate !== null && (
                      <div className="text-right">
                        <span className="text-caption font-semibold tabular-nums text-success">{winRate}%</span>
                        <p className="mt-0.5 text-caption text-tertiary">Accuracy</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Community context */}
                {groupId && groupName && (
                  <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                    <span className="text-caption font-medium uppercase tracking-wider text-tertiary">Community</span>
                    <Link
                      href={groupHref(groupId)}
                      onClick={handleClose}
                      className="mt-1 flex items-center gap-2 rounded-control border border-white/[0.06] bg-surface-2/40 px-2.5 py-1.5 transition-colors hover:border-white/15 hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <EntityAvatar imageUrl={null} name={groupName} seed={groupId} size={18} shape="square" />
                      <span className="truncate text-caption font-medium text-secondary">{groupName}</span>
                      <Icon icon={Compass} size={16} className="ml-auto size-3 text-tertiary" />
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}
