"use client";

import { Flag, MapPin, User, X } from "lucide-react";
import { teamColor } from "@/lib/teamColors";
import type { F1Tag } from "@/lib/communities";

export function F1TagChip({
  tag,
  size = "sm",
  onRemove,
  onClick,
  active = false,
}: {
  tag: F1Tag;
  size?: "xs" | "sm" | "md";
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
}) {
  const isTeam = tag.category === "team";
  const isDriver = tag.category === "driver";
  const isSession = tag.category === "session";
  const isGp = tag.category === "grand_prix" || tag.category === "circuit";

  const color = isTeam ? teamColor(tag.label) : null;

  const sizeClasses =
    size === "xs"
      ? "text-caption h-5 px-1.5 gap-1"
      : size === "sm"
        ? "text-caption h-6 px-2 gap-1.5"
        : "text-body h-7 px-2.5 gap-2";

  return (
    <span
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`inline-flex items-center rounded-control border font-medium transition-colors select-none ${sizeClasses} ${
        active
          ? "border-brand bg-brand/15 text-primary shadow-sm"
          : onClick
            ? "border-white/12 bg-white/[0.05] text-secondary hover:border-white/25 hover:bg-white/[0.10] hover:text-primary cursor-pointer"
            : "border-white/10 bg-white/[0.04] text-secondary"
      }`}
    >
      {isTeam && color && (
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      {isDriver && <User className="size-3 text-secondary shrink-0" aria-hidden="true" />}
      {isSession && <Flag className="size-3 text-brand shrink-0" aria-hidden="true" />}
      {isGp && <MapPin className="size-3 text-secondary shrink-0" aria-hidden="true" />}

      <span className="truncate max-w-[140px]">{tag.label}</span>

      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 -mr-0.5 rounded-full p-0.5 text-secondary hover:bg-white/15 hover:text-primary transition-colors"
          aria-label={`Remove ${tag.label}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

