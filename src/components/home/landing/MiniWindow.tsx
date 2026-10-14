import type { CSSProperties, ReactNode } from "react";

/**
 * A small floating "app window" for the signed-out home's showcase: frosted glass, a title bar with the three window
 * dots and a name, and a miniature live piece of the product inside. It drifts on its own slow wave (globals.css
 * .float-bob); `active` lifts it and lights its edge when the matching feature is pointed at in the list beside it.
 */
export function MiniWindow({
  title,
  children,
  className = "",
  float = { x: 4, y: 12, dur: 9, delay: 0 },
  active = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  float?: { x: number; y: number; dur: number; delay: number };
  active?: boolean;
}) {
  const style = { "--float-x": `${float.x}px`, "--float-y": `${float.y}px`, "--float-dur": `${float.dur}s`, "--float-delay": `-${float.delay}s` } as CSSProperties;
  return (
    <div className={`float-bob ${className}`} style={style}>
      <div
        className={`surface-glass overflow-hidden rounded-card border shadow-overlay transition-[transform,border-color,box-shadow] duration-base ${
          active ? "scale-[1.04] border-white/30 shadow-[0_24px_60px_-20px_rgb(225_6_0/0.45)]" : "border-white/10"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-danger/80" />
            <span className="size-2.5 rounded-full bg-warning/80" />
            <span className="size-2.5 rounded-full bg-success/80" />
          </span>
          <span className="ml-1 truncate text-caption text-secondary">{title}</span>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}
