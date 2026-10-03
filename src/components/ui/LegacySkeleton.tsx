import type { CSSProperties } from "react";

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  // The Skeleton primitive's pulse and fill, so legacy and new skeletons look and move the same.
  return <div className={`animate-[pulse_1.6s_ease-in-out_infinite] rounded-md bg-primary/10 motion-reduce:animate-none ${className}`} style={style} />;
}
