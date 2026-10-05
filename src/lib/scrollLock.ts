/**
 * Freezes the page's scroll while a blocking modal is open, and gives it back afterwards.
 *
 * The document scrolls (audit R-31), so this locks `<html>`. `html { scrollbar-gutter: stable }`
 * (globals.css) keeps the scrollbar's width reserved, so locking does not shift the layout sideways.
 * Counted, so two modals open at once (a dialog opened from a sheet) release it only when the last
 * one closes, and each caller can simply call the returned function on cleanup.
 */
let locks = 0;
let previous = "";

export function lockDocumentScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;
  if (locks === 0) {
    previous = root.style.overflow;
    root.style.overflow = "hidden";
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0) root.style.overflow = previous;
  };
}
