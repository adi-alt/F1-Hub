import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { Icon, type IconSize } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type CommonProps = {
  variant: ButtonVariant;
  /** Heights 32 / 40 / 48. */
  size: ButtonSize;
  /** Shows a spinner and sets aria-busy; also disables the button, without changing its width. */
  loading?: boolean;
  disabled?: boolean;
  /** Layout only: margin, width, flex or grid placement. Colour, type, padding and radius come from
   * `variant` and `size`. */
  className?: string;
};

/** A visible label, with optional decorative icons either side. */
type LabelledProps = {
  iconOnly?: false;
  iconStart?: LucideIcon;
  iconEnd?: LucideIcon;
  /** Only to extend the visible label; it must contain the label's words. */
  "aria-label"?: string;
};

/** No visible label, so the accessible name is required. */
type IconOnlyProps = {
  iconOnly: true;
  iconStart: LucideIcon;
  iconEnd?: never;
  "aria-label": string;
};

/** A native <button>. Every native prop passes through except `style` (and aria-busy, which
 * `loading` sets). */
type NativeProps = Omit<ComponentProps<"button">, "className" | "style" | "children" | "disabled" | "aria-label" | "aria-busy"> & { asChild?: false };

/** The single child element (a Next <Link>, an <a>) is rendered as the button. Its href, onClick and
 * ref stay on it. */
type SlotProps = { asChild: true; children: ReactElement };

export type ButtonProps = CommonProps &
  (
    | (NativeProps & LabelledProps & { children: ReactNode })
    | (NativeProps & IconOnlyProps & { children?: never })
    | (SlotProps & (LabelledProps | IconOnlyProps))
  );

type SlotChildProps = {
  className?: string;
  children?: ReactNode;
  tabIndex?: number;
  "aria-label"?: string;
  "aria-disabled"?: boolean | "true" | "false";
  "aria-busy"?: boolean;
};

const BASE =
  "relative inline-flex cursor-pointer select-none items-center justify-center whitespace-nowrap font-medium transition duration-fast ease-standard motion-safe:active:scale-98 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 rounded-control px-3 text-body-sm",
  md: "h-10 rounded-card px-4 text-body-sm",
  lg: "h-12 rounded-card px-5 text-body",
};

const ICON_ONLY_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "size-8 rounded-control",
  md: "size-10 rounded-card",
  lg: "size-12 rounded-card",
};

const GAP_CLASSES: Record<ButtonSize, string> = { sm: "gap-1.5", md: "gap-2", lg: "gap-2" };

const ICON_SIZES: Record<ButtonSize, { labelled: IconSize; iconOnly: IconSize }> = {
  sm: { labelled: 16, iconOnly: 16 },
  md: { labelled: 16, iconOnly: 20 },
  lg: { labelled: 20, iconOnly: 24 },
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-strong bg-surface-2 text-primary hover:bg-surface-3",
  ghost: "text-secondary hover:bg-surface-2 hover:text-primary",
  danger: "bg-danger-fill text-white hover:bg-danger-fill/85",
};

// A disabled button drops its tone as well as its text colour: text-disabled on a red fill would
// still read as the view's main action.
const DISABLED_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-surface-2 text-disabled",
  secondary: "border border-subtle bg-surface-2 text-disabled",
  ghost: "text-disabled",
  danger: "bg-surface-2 text-disabled",
};

/** What `disabled` and `loading` do. Both make the button inert; only disabled greys it out, since a
 * loading button is busy, not unavailable. */
export function buttonState({ disabled = false, loading = false }: { disabled?: boolean; loading?: boolean }) {
  return { inert: disabled || loading, busy: loading, dimmed: disabled && !loading };
}

/**
 * The app's button. One primary per view region; secondary beside it; ghost for toolbars and quiet
 * actions such as Cancel; danger for destructive confirmations only. `iconOnly` needs an
 * `aria-label` (the types enforce it). `asChild` renders the single child element, such as a Next
 * <Link>, with the button's look; a link cannot be disabled natively, so a disabled or loading one
 * gets aria-disabled and leaves the tab order.
 */
export function Button({
  variant,
  size,
  loading = false,
  disabled = false,
  className,
  iconOnly = false,
  iconStart,
  iconEnd,
  asChild = false,
  children,
  "aria-label": ariaLabel,
  ...native
}: ButtonProps) {
  const { inert, busy, dimmed } = buttonState({ disabled, loading });
  const classes = [
    BASE,
    iconOnly ? ICON_ONLY_SIZE_CLASSES[size] : SIZE_CLASSES[size],
    dimmed ? DISABLED_CLASSES[variant] : VARIANT_CLASSES[variant],
    inert && "pointer-events-none",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const iconSize = ICON_SIZES[size][iconOnly ? "iconOnly" : "labelled"];

  // The label stays in the layout (only made transparent) while loading, so the button keeps its
  // width and its accessible name; the spinner sits on top of it.
  const content = (label: ReactNode) => (
    <>
      <span className={`inline-flex items-center justify-center ${GAP_CLASSES[size]}${busy ? " opacity-0" : ""}`}>
        {iconStart && <Icon icon={iconStart} size={iconSize} />}
        {!iconOnly && label}
        {!iconOnly && iconEnd && <Icon icon={iconEnd} size={iconSize} />}
      </span>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex animate-spin motion-reduce:animate-none">
            <Icon icon={LoaderCircle} size={iconSize} />
          </span>
        </span>
      )}
    </>
  );

  if (asChild) {
    if (!isValidElement<SlotChildProps>(children)) throw new Error("Button asChild needs exactly one element child, such as a <Link>.");
    const slotProps: SlotChildProps = { ...native, className: children.props.className ? `${classes} ${children.props.className}` : classes };
    if (ariaLabel !== undefined) slotProps["aria-label"] = ariaLabel;
    if (inert) {
      slotProps["aria-disabled"] = true;
      slotProps.tabIndex = -1;
    }
    if (busy) slotProps["aria-busy"] = true;
    return cloneElement(children, slotProps, content(children.props.children));
  }

  return (
    <button type="button" {...native} disabled={inert} aria-busy={busy || undefined} aria-label={ariaLabel} className={classes}>
      {content(children)}
    </button>
  );
}
