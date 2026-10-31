"use client";

import { useState } from "react";
import type { PredictorFlair as PredictorFlairType } from "@/lib/communities";
import { getFlairToneClasses } from "@/lib/predictorFlairs";

export function PredictorFlairBadge({
  flair,
  size = "sm",
}: {
  flair: PredictorFlairType;
  size?: "sm" | "md";
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const toneClasses = getFlairToneClasses(flair.tone);

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip((prev) => !prev);
        }}
        aria-label={`${flair.label}: ${flair.description}`}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium transition-all duration-fast focus-visible:outline-2 focus-visible:outline-focus-ring ${
          toneClasses.bg
        } ${toneClasses.text} ${toneClasses.border} ${toneClasses.glow} ${
          size === "sm" ? "text-[11px] h-5" : "text-caption h-6 px-2.5"
        }`}
      >
        <span>{flair.label}</span>
      </button>

      {/* Explanatory Tooltip / Card */}
      {showTooltip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-control border border-white/12 bg-surface-2 px-2.5 py-1 text-caption text-primary shadow-xl animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{flair.label}</span>
            <span className="text-tertiary">·</span>
            <span className="text-secondary">{flair.description}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function PredictorFlairsList({
  flairs,
  size = "sm",
}: {
  flairs: PredictorFlairType[] | null | undefined;
  size?: "sm" | "md";
}) {
  if (!flairs || flairs.length === 0) return null;

  return (
    <div className="inline-flex items-center gap-1.5">
      {flairs.map((flair) => (
        <PredictorFlairBadge key={flair.id} flair={flair} size={size} />
      ))}
    </div>
  );
}
