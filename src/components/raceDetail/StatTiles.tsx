/** Shared shape for a compact "label / value" stat - the actual rendering now lives in
 * RaceStorySection.tsx's own CompactStatGrid (a flat, divided 2x2 grid, not this file's old
 * bordered-card tiles, which is why the render function itself is gone from here - the type is
 * the only part of this file anything still imports). */
export type StatTile = { label: string; value: string; sub?: string };
