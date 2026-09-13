import { useEffect, type RefObject } from "react";

/** Calls `handler` on any mousedown outside `ref`'s element — only listens while `enabled` is
 * true, so a closed menu/dropdown doesn't pay for a document-wide listener it doesn't need. */
export function useOnClickOutside(ref: RefObject<HTMLElement | null>, enabled: boolean, handler: () => void) {
  useEffect(() => {
    if (!enabled) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [ref, enabled, handler]);
}
