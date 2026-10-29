"use client";

import { useEffect, useRef, useState } from "react";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import type { MentionUser } from "@/app/users/services/users.service";

export function MentionAutocomplete({
  query,
  onSelect,
  onClose,
}: {
  query: string;
  onSelect: (username: string) => void;
  onClose: () => void;
}) {
  const [candidates, setCandidates] = useState<MentionUser[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const clean = query.trim().replace(/^@/, "");
    if (!clean) {
      setCandidates([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/users?mention=1&q=${encodeURIComponent(clean)}`, { signal: controller.signal })
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

    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (candidates.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % candidates.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (candidates[activeIndex]) {
          e.preventDefault();
          onSelect(candidates[activeIndex].username);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [candidates, activeIndex, onSelect, onClose]);

  if (candidates.length === 0 && !loading) return null;

  return (
    <div
      role="listbox"
      aria-label="Mention user"
      className="absolute bottom-full left-0 z-popover mb-1.5 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-white/[0.12] bg-surface-1/95 p-1 shadow-overlay backdrop-blur-md"
    >
      {loading && candidates.length === 0 && (
        <p className="px-2.5 py-1.5 text-caption text-tertiary">Searching users…</p>
      )}
      {candidates.map((user, idx) => {
        const isSelected = idx === activeIndex;
        return (
          <button
            key={user.uid}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(user.username)}
            onMouseEnter={() => setActiveIndex(idx)}
            className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-fast ${
              isSelected ? "bg-white/[0.08] text-primary" : "text-secondary hover:bg-white/[0.04] hover:text-primary"
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

