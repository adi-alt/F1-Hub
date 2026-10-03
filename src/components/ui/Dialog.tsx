"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";

export type DialogSize = "sm" | "md" | "lg";

export type DialogProps = {
  open: boolean;
  /** Called by Escape, a scrim click and the close button. The caller owns `open`. */
  onClose: () => void;
  /** Names the dialog (aria-labelledby). Sentence case. */
  title: string;
  /** Read out with the title (aria-describedby). */
  description?: string;
  children?: ReactNode;
  /** Actions, right-aligned under the body. They stay in view while the body scrolls. */
  footer?: ReactNode;
  /** Max width. Dialog: sm 384px, md 512px (default), lg 672px. Sheet from md up: sm 320px, md 384px, lg 512px. */
  size?: DialogSize;
  /** Default true. When false, Escape and the scrim do nothing and there is no close button, so the footer must offer the way out. */
  dismissible?: boolean;
  /**
   * Focused on open instead of the first focusable element (the close button). Use this rather
   * than autoFocus or focusing from an effect: both run before the focus trap records the trigger,
   * so focus could not go back to it on close.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Artwork beside the content from md up, such as the sign-in scene. Hidden on phones and from
   * assistive tech, so it must hold no controls and say nothing the content doesn't. It doubles the
   * panel's md-up width: the content column keeps `size`'s width and the aside takes the same again.
   */
  aside?: ReactNode;
};

/** A sheet has no room for an aside. */
export type SheetProps = Omit<DialogProps, "aside">;

type Variant = "dialog" | "sheet";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
const hasContent = (node: ReactNode) => node != null && typeof node !== "boolean" && node !== "";

/** How long a closing overlay stays mounted: duration-slow, the length of its exit transition. */
const EXIT_MS = 320;

const BACKDROP = "absolute inset-0 bg-surface-0/70 transition-opacity duration-slow ease-standard starting:opacity-0 motion-reduce:transition-none";
const PANEL =
  "relative flex w-full flex-col gap-4 overflow-hidden bg-surface-3 py-6 shadow-overlay transition-[opacity,translate] duration-slow ease-standard motion-reduce:transition-none";
// With an aside, the panel is a row from md up: the artwork, then a column that takes the padding.
const PANEL_WITH_ASIDE = "md:flex-row md:gap-0 md:py-0";
const ASIDE = "hidden md:block md:w-1/2 md:shrink-0";
const CONTENT_COLUMN = "flex min-h-0 min-w-0 flex-1 flex-col gap-4 md:py-6";
const ASIDE_WIDTH: Record<DialogSize, string> = { sm: "max-w-sm md:max-w-3xl", md: "max-w-lg md:max-w-4xl", lg: "max-w-2xl md:max-w-5xl" };
const CLOSE_BUTTON =
  "-mr-2 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-control text-secondary hover:bg-primary/8 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const VARIANTS: Record<Variant, { root: string; panel: string; closed: string; width: Record<DialogSize, string> }> = {
  dialog: {
    // p-4 on every side is the 32px the panel's max height leaves free.
    root: "fixed inset-0 z-dialog flex items-center justify-center p-4",
    panel: "max-h-[calc(100dvh-32px)] rounded-overlay starting:translate-y-2 starting:opacity-0",
    closed: "translate-y-2 opacity-0",
    width: { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" },
  },
  sheet: {
    root: "fixed inset-0 z-dialog flex items-end md:items-stretch md:justify-end",
    panel:
      "max-h-[calc(100dvh-32px)] rounded-t-overlay md:max-h-none md:rounded-tr-none md:rounded-l-overlay starting:translate-y-full md:starting:translate-x-full md:starting:translate-y-0",
    closed: "translate-y-full md:translate-x-full md:translate-y-0",
    width: { sm: "md:max-w-xs", md: "md:max-w-sm", lg: "md:max-w-lg" },
  },
};

const subscribeNothing = () => () => {};

/** Whether the overlay is in the DOM: from the render that opens it until its exit transition ends. */
function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  // Adjusted while rendering, not in an effect, so the panel exists in the same commit that opens
  // it: the focus trap's open effect looks for it straight away.
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);
  return mounted;
}

function Overlay({ variant, open, onClose, dismissible = true, initialFocusRef, ...content }: DialogProps & { variant: Variant }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = usePresence(open);
  // There is no document.body on the server, so the portal waits for a client render.
  const isClient = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  // The trap re-runs (focus fallback included) whenever the function it is given changes, so it
  // gets a stable one that reads the latest props. An inline onClose would otherwise re-run it on
  // every render and could pull focus back to the first element.
  const latest = useRef({ onClose, dismissible });
  useLayoutEffect(() => {
    latest.current = { onClose, dismissible };
  });
  const requestClose = useCallback(() => {
    if (latest.current.dismissible) latest.current.onClose();
  }, []);
  useModalFocusTrap(panelRef, open, requestClose);

  // Declared after the trap, so it runs once the trap has recorded the trigger. isClient covers a
  // dialog that is already open when the page hydrates: its panel mounts one render later.
  useEffect(() => {
    if (open && isClient) initialFocusRef?.current?.focus();
  }, [open, isClient, initialFocusRef]);

  if (!isClient || !mounted) return null;
  return createPortal(<DialogLayer {...content} variant={variant} open={open} onClose={onClose} dismissible={dismissible} panelRef={panelRef} />, document.body);
}

/**
 * A modal dialog: a centred panel over a scrim, portalled to document.body on z-dialog.
 *
 * useModalFocusTrap supplies the behaviour: focus moves in on open (to the first focusable element,
 * or `initialFocusRef`), Tab stays inside, Escape closes, focus returns to the trigger, and the
 * page behind stops scrolling. A scrim click closes too. The body scrolls inside a panel capped
 * at the viewport height minus 32px; the header and footer stay put.
 */
export function Dialog(props: DialogProps) {
  return <Overlay variant="dialog" {...props} />;
}

/**
 * Dialog's contract as a sheet: a full-width bottom sheet on phones, a full-height right-hand
 * panel from md up. For Apex, the mobile nav and filters.
 */
export function Sheet(props: SheetProps) {
  return <Overlay variant="sheet" {...props} />;
}

/**
 * What Dialog and Sheet render into the portal (container, scrim and panel) with none of their
 * behaviour: no portal, focus trap, Escape handling or exit timing. Exported so the markup can be
 * rendered on the server and asserted in tests; in the app, use Dialog or Sheet. `open={false}` is
 * the closing state: inert, ignoring the pointer, and transitioning out.
 */
export function DialogLayer({
  variant = "dialog",
  open = true,
  onClose,
  dismissible = true,
  panelRef,
  title,
  description,
  children,
  footer,
  size = "md",
  aside,
}: Omit<DialogProps, "open" | "initialFocusRef"> & { variant?: Variant; open?: boolean; panelRef?: Ref<HTMLDivElement> }) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const styles = VARIANTS[variant];
  const closing = !open;
  const withAside = variant === "dialog" && hasContent(aside);

  const content = (
    <>
      <div className="flex shrink-0 items-start gap-4 px-6">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="break-words text-title-md text-primary">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-body-sm text-secondary">
              {description}
            </p>
          )}
        </div>
        {dismissible && (
          <button type="button" aria-label="Close" onClick={() => onClose()} className={CLOSE_BUTTON}>
            <X aria-hidden size={20} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {/* -my-1 py-1 keeps the 16px gap but gives focus rings at the scroll edges room to show. */}
      {hasContent(children) && <div className="-my-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1 text-body-sm text-primary">{children}</div>}
      {hasContent(footer) && <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 px-6 pt-2">{footer}</div>}
    </>
  );

  return (
    <div className={cx(styles.root, closing && "pointer-events-none")} inert={closing}>
      <div aria-hidden="true" onClick={dismissible ? () => onClose() : undefined} className={cx(BACKDROP, closing && "opacity-0")} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cx(PANEL, withAside && PANEL_WITH_ASIDE, styles.panel, withAside ? ASIDE_WIDTH[size] : styles.width[size], closing && styles.closed)}
      >
        {withAside ? (
          <>
            <div aria-hidden="true" className={ASIDE}>
              {aside}
            </div>
            <div className={CONTENT_COLUMN}>{content}</div>
          </>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
