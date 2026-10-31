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
        <div className="flex items-center justify-between pb-1 text-[11px] text-amber-300/80">
          <span className="inline-flex items-center gap-1 font-medium">
            <ShieldAlert className="size-3 text-amber-400" />
            Spoiler content revealed
          </span>
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="inline-flex items-center gap-1 hover:text-amber-200 transition-colors opacity-70 group-hover:opacity-100"
          >
            <EyeOff className="size-3" />
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
        <div className="flex flex-col sm:flex-row items-center gap-3 rounded-control border border-amber-500/35 bg-surface-1/95 px-4 py-3 shadow-2xl backdrop-blur-xl transition-transform group-hover:scale-[1.02] max-w-sm text-center sm:text-left">
          <div className="rounded-full bg-amber-500/15 p-2 text-amber-400 shrink-0">
            <ShieldAlert className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-caption font-semibold text-primary">Spoiler Shield Active</p>
            <p className="text-[12px] text-secondary">May contain race or session outcomes</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
            className="sm:ml-auto inline-flex items-center gap-1.5 rounded-control border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-caption font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors shrink-0"
          >
            <Eye className="size-3.5" />
            <span>Reveal</span>
          </button>
        </div>
      </div>
    </div>
  );
}

