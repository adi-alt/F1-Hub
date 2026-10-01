import { Ban, Check, Clock, Lock, type LucideIcon } from "lucide-react";
import { Icon } from "./Icon";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "live";

// Tone text on a 12% tint of the same tone: at least 4.5:1 on surface-1 for every tone.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-secondary",
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  live: "bg-brand/12 text-brand-text",
};

export type BadgeProps = {
  tone: BadgeTone;
  /** Decorative: the label carries the meaning. */
  icon?: LucideIcon;
  /** One or two words, sentence case. */
  children: string;
  /** Layout only: margin, alignment, grid placement. */
  className?: string;
};

/**
 * A short, static status label. Status only: user-facing categories and filters are Chips. The
 * words carry the meaning and the tone reinforces it, so colour is never the only cue. The live
 * tone adds a red dot, which pulses only when the user allows motion.
 */
export function Badge({ tone, icon, children, className }: BadgeProps) {
  const classes = ["inline-flex items-center gap-1 whitespace-nowrap rounded-control px-2 py-0.5 text-caption", TONE_CLASSES[tone], className];
  return (
    <span className={classes.filter(Boolean).join(" ")}>
      {tone === "live" && <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />}
      {icon && <Icon icon={icon} size={16} />}
      {children}
    </span>
  );
}

/** Every state a StateLabel can be given: prediction rounds, race sessions and result data. */
export type DomainState = "open" | "locked" | "resolved" | "void" | "upcoming" | "live" | "preliminary" | "final" | "pending";

/** The badge one domain state shows. */
export type StateBadge = { tone: BadgeTone; icon?: LucideIcon; label: string };

/** The badge for each domain state, or null for none: open and final are the default states, and an
 * upcoming item shows its date instead. */
export const STATE_BADGES: Record<DomainState, StateBadge | null> = {
  open: null,
  locked: { tone: "warning", icon: Lock, label: "Locked" },
  resolved: { tone: "neutral", icon: Check, label: "Resolved" },
  void: { tone: "neutral", icon: Ban, label: "Void" },
  upcoming: null,
  live: { tone: "live", label: "Live" },
  preliminary: { tone: "warning", label: "Preliminary" },
  final: null,
  pending: { tone: "neutral", icon: Clock, label: "Pending" },
};

export type StateLabelProps = {
  state: DomainState;
  /** Layout only: margin, alignment, grid placement. */
  className?: string;
};

/** The one badge for a domain state, so a state reads the same everywhere. Renders nothing for the
 * states STATE_BADGES maps to null. */
export function StateLabel({ state, className }: StateLabelProps) {
  const badge = STATE_BADGES[state];
  if (!badge) return null;
  return (
    <Badge tone={badge.tone} icon={badge.icon} className={className}>
      {badge.label}
    </Badge>
  );
}
