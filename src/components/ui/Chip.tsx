import { Check, X } from "lucide-react";
import { Icon } from "./Icon";

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

type CommonProps = {
  /** The category or filter, sentence case. Also names the remove button: "Remove <label>". */
  children: string;
  /** Adds a remove button beside the label. The chip and its focused button go away, so the caller
   * should move focus somewhere sensible (the next chip, or the filter's input). */
  onRemove?: () => void;
  /** Layout only: margin, alignment, grid placement. */
  className?: string;
};

/** A filter toggle: the label is a button with aria-pressed. */
type ToggleProps = { onClick: () => void; selected?: boolean };

/** A plain tag. `selected` needs `onClick`: a selected look with nothing to press would be invisible
 * to assistive technology. */
type TagProps = { onClick?: never; selected?: never };

export type ChipProps = CommonProps & (ToggleProps | TagProps);

/**
 * A user-facing category or filter: outlined and fully rounded, so it never reads as a status (that
 * is a Badge). With `onClick` it is a toggle button; selected fills it and adds a check mark, so the
 * state doesn't depend on colour. `onRemove` adds a separate 24px remove button, never nested inside
 * the toggle.
 */
export function Chip({ children, selected = false, onClick, onRemove, className }: ChipProps) {
  const toggle = onClick !== undefined;
  const labelPadding = onRemove ? "pl-3 pr-1" : "px-3";
  const classes = [
    "inline-flex h-8 items-center rounded-full border border-strong text-body-sm transition duration-fast ease-standard",
    selected ? "bg-surface-2 text-primary" : "text-secondary",
    toggle && (selected ? "hover:bg-surface-3" : "hover:bg-surface-2 hover:text-primary"),
    className,
  ];

  return (
    <span className={classes.filter(Boolean).join(" ")}>
      {toggle ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onClick}
          className={`inline-flex cursor-pointer items-center gap-1.5 self-stretch rounded-full ${labelPadding} ${FOCUS_RING}`}
        >
          {selected && <Icon icon={Check} size={16} />}
          {children}
        </button>
      ) : (
        <span className={`inline-flex items-center ${labelPadding}`}>{children}</span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${children}`}
          onClick={onRemove}
          className={`mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-secondary transition duration-fast ease-standard hover:bg-surface-3 hover:text-primary ${FOCUS_RING}`}
        >
          <Icon icon={X} size={16} />
        </button>
      )}
    </span>
  );
}
