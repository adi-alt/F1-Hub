/** Lets one Lenis instance defer to a *specific* nested one, rather than the all-or-nothing
 * `data-lenis-prevent` (which every instance treats as "never smooth-scroll here at all" —
 * checked against a wheel event's full composedPath, so it can't distinguish "the page's own
 * instance should ignore this" from "but the table's own nested instance still should").
 *
 * Any container mounting its own `useLenisContainer` with `registerAsNestedRegion: true` adds
 * itself here; the page's root instance (`SmoothScroll.tsx`, `deferToNestedRegions: true`) checks
 * this registry in its own `prevent` callback and bails when a wheel event's target lives inside
 * one — letting that region's own nested Lenis instance handle the scroll instead of fighting it,
 * without disabling Lenis smoothing inside that region entirely. */
const registeredRegions = new Set<HTMLElement>();

export function registerNestedLenisRegion(el: HTMLElement): () => void {
  registeredRegions.add(el);
  return () => registeredRegions.delete(el);
}

export function isRegisteredNestedLenisRegion(node: HTMLElement): boolean {
  return registeredRegions.has(node);
}
