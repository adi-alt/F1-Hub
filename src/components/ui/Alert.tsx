import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AlertTone = "info" | "warning" | "danger" | "success";

/** Lucide's current names for the spec's Info, AlertTriangle, AlertCircle and CheckCircle2 (the same
 * icons). The tints are 10%, the strength of the spec's --danger-subtle alert background. */
const TONES: Record<AlertTone, { icon: LucideIcon; tint: string; iconColor: string }> = {
  info: { icon: Info, tint: "bg-info/10", iconColor: "text-info" },
  warning: { icon: TriangleAlert, tint: "bg-warning/10", iconColor: "text-warning" },
  danger: { icon: CircleAlert, tint: "bg-danger-subtle", iconColor: "text-danger" },
  success: { icon: CircleCheck, tint: "bg-success/10", iconColor: "text-success" },
};

/** Danger interrupts (role="alert", assertive); every other tone waits its turn (role="status", polite). */
export function alertRole(tone: AlertTone): "alert" | "status" {
  return tone === "danger" ? "alert" : "status";
}

/** A title, a body (children), or both. */
type AlertContent = { title: string; children?: ReactNode } | { title?: string; children: ReactNode };

export type AlertProps = AlertContent & {
  tone: AlertTone;
  /** Replaces the tone's own icon; keep one whose meaning matches the tone. */
  icon?: LucideIcon;
  /** One action for the message, usually a Retry button. */
  action?: ReactNode;
  /** Layout only: margin, width, grid placement. */
  className?: string;
};

/**
 * An inline message in the region it is about (spec §4.9): info, warning, danger or success, each
 * with its own icon so the tone never rests on colour alone. Danger uses the danger coral on
 * danger-subtle, never brand red. Replaces RetryBanner and the red error banners: the message goes
 * in title/children and the Retry button in `action`.
 */
export function Alert({ tone, title, children, icon, action, className }: AlertProps) {
  const { icon: toneIcon, tint, iconColor } = TONES[tone];
  const Icon = icon ?? toneIcon;
  return (
    <div
      role={alertRole(tone)}
      className={["flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-card p-4", tint, className].filter(Boolean).join(" ")}
    >
      <div className="flex min-w-0 grow basis-64 items-start gap-3">
        <Icon size={20} strokeWidth={1.75} aria-hidden className={`shrink-0 ${iconColor}`} />
        <div className="min-w-0 text-body-sm">
          {title && <p className="font-medium text-primary">{title}</p>}
          {children ? <div className={title ? "mt-1 text-secondary" : "text-primary"}>{children}</div> : null}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
