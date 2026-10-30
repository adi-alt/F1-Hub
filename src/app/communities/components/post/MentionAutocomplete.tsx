"use client";

import { useEffect, useState } from "react";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import type { MentionUser } from "@/app/users/services/users.service";

export function MentionAutocomplete({
  query,
  groupId,
  onSelect,
  onClose,
}: {
  query: string;
  groupId?: string | null;
  onSelect: (username: string) => void;
  onClose: () => void;
}) {
  const [candidates, setCandidates] = useState<MentionUser[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const clean = query.trim().replace(/^@/, "");
  const displayedCandidates = candidates;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });

    const url = `/api/users?mention=1&q=${encodeURIComponent(clean)}${groupId ? `&groupId=${encodeURIComponent(groupId)}` : ""}`;
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ users: MentionUser[] }>) : Promise.reject(new Error("failed"))))
      .then((body) => {
        if (!controller.signal.aborted) {
          setCandidates(body.users ?? []);
          setActiveIndex(0);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCandidates([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [clean, groupId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (displayedCandidates.length === 0) {
        if (loading && (e.key === "Enter" || e.key === "Tab")) {
          // Prevent submitting while autocomplete is loading candidates
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setActiveIndex((i) => (i + 1) % displayedCandidates.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setActiveIndex((i) => (i - 1 + displayedCandidates.length) % displayedCandidates.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (displayedCandidates[activeIndex]) {
          onSelect(displayedCandidates[activeIndex].username);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [displayedCandidates, activeIndex, loading, onSelect, onClose]);

  if (displayedCandidates.length === 0 && !loading) return null;

  return (
    <div
      role="listbox"
      aria-label="Mention user"
      className="absolute bottom-full left-0 z-popover mb-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-white/[0.12] bg-surface-1/95 p-1 shadow-overlay backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-tertiary">
        <span>{groupId ? "Community members" : "Suggested users"}</span>
        <span className="text-[10px] normal-case lowercase tracking-normal text-tertiary/75">Enter / Tab to select</span>
      </div>
      {loading && displayedCandidates.length === 0 && (
        <p className="px-2.5 py-2 text-caption text-tertiary">Searching users…</p>
      )}
      {displayedCandidates.map((user, idx) => {
        const isSelected = idx === activeIndex;
        return (
          <button
            key={user.uid}
            type="button"
            role="option"
            aria-selected={isSelected}
            onMouseDown={(e) => {
              // Prevent textarea from blurring before click completes
              e.preventDefault();
            }}
            onClick={() => onSelect(user.username)}
            onMouseEnter={() => setActiveIndex(idx)}
            className={`flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left transition-colors duration-fast ${
              isSelected ? "bg-white/[0.1] text-primary" : "text-secondary hover:bg-white/[0.04] hover:text-primary"
            }`}
          >
            <PersonAvatar id={user.uid} avatar={user.avatar ?? null} size={24} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium leading-tight text-primary">{user.displayName}</p>
              <p className="truncate text-caption text-tertiary">@{user.username}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

