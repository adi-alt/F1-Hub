"use client";

import { useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";

export function SpoilerShield({
  isSpoiler,
  children,
  className = "",
}: {
  isSpoiler?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!isSpoiler) {
    return <>{children}</>;
  }

  if (revealed) {
    return (
      <div className={`relative group ${className}`}>
        <div className="flex items-center justify-between pb-1 text-caption text-secondary">
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-300">
            <ShieldAlert className="size-3.5 text-amber-400" />
            Spoiler
          </span>
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="inline-flex items-center gap-1 text-caption text-tertiary hover:text-primary transition-colors"
          >
            <EyeOff className="size-3.5" />
            <span>Hide</span>
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={`relative rounded-lg overflow-hidden ${className}`}>
      {/* Blurred background content */}
      <div className="filter blur-md select-none pointer-events-none transition-all duration-300 opacity-40">
        {children}
      </div>

      {/* Floating Spoiler Barrier */}
      <div
        onClick={() => setRevealed(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setRevealed(true);
          }
        }}
        className="absolute inset-0 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] cursor-pointer group"
        aria-label="Spoiler shield active. Click to reveal content."
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-surface-1/90 px-4 py-2 text-caption font-semibold text-primary shadow-xl backdrop-blur-md transition-transform duration-fast group-hover:scale-105">
          <Eye className="size-4 text-amber-400" />
          <span>Spoiler</span>
          <span className="font-normal text-secondary">· Click to reveal</span>
        </div>
      </div>
    </div>
  );
}

