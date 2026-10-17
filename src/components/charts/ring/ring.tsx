"use client";

// Adapted from Bklit UI (MIT, see LICENSE.md): one ring of a ring chart. It grows in, then draws its progress arc;
// once both are done it renders plain paths (no per-frame motion values). Hovering lifts it and fades the others.

import { arc as arcGenerator } from "@visx/shape";
import { type MotionValue, motion, useTransform } from "motion/react";
import { memo, useCallback } from "react";
import { getRingHitRadii, RING_TRACK, useRingHover, useRingStable } from "./ring-context";
import { useEnterComplete, useMountProgress } from "./motion";

function arcPath(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number, cornerRadius: number): string {
  return arcGenerator<unknown>({ innerRadius, outerRadius, cornerRadius })({ startAngle, endAngle } as unknown as null) || "";
}

function ProgressPath({ complete, path, animatedPath, color }: { complete: boolean; path: string; animatedPath: MotionValue<string>; color: string }) {
  if (complete) return path ? <path d={path} fill={color} /> : null;
  return <motion.path d={animatedPath} fill={color} />;
}

export const Ring = memo(function Ring({ index, color: colorProp, animate = true }: { index: number; color?: string; animate?: boolean }) {
  const { data, getColor, getRingRadii, startAngle, endAngle, enterTransition, enterStaggerScale, animationKey, baseInnerRadius, strokeWidth, ringGap } = useRingStable();
  const { hoveredIndex, setHoveredIndex } = useRingHover();

  const expandProgress = useMountProgress(enterTransition, index * 0.08 * enterStaggerScale, `${animationKey}-expand-${index}`);
  const expandComplete = useEnterComplete(expandProgress);
  const progressMount = useMountProgress(enterTransition, (0.6 + index * 0.1) * enterStaggerScale, `${animationKey}-progress-${index}`);
  const progressComplete = useEnterComplete(progressMount);

  const ringData = data[index];
  const progress = ringData ? Math.min(1, ringData.value / Math.max(ringData.maxValue, 1e-9)) : 0;
  const arcRange = endAngle - startAngle;

  const animatedPath = useTransform(progressMount, (v) => {
    if (!ringData) return "";
    const end = startAngle + arcRange * progress * v;
    if (end <= startAngle + 0.01) return "";
    const r = getRingRadii(index);
    return arcPath(r.innerRadius, r.outerRadius, startAngle, end, (r.outerRadius - r.innerRadius) / 2);
  });
  const enterScale = useTransform(expandProgress, [0, 1], [0, 1]);

  const onEnter = useCallback(() => setHoveredIndex(index), [index, setHoveredIndex]);
  const onLeave = useCallback(() => setHoveredIndex(null), [setHoveredIndex]);

  if (!ringData) return null;

  const { innerRadius, outerRadius } = getRingRadii(index);
  const color = colorProp || getColor(index);
  const corner = (outerRadius - innerRadius) / 2;
  const trackPath = arcPath(innerRadius, outerRadius, startAngle, endAngle, corner);
  const progressEnd = startAngle + arcRange * progress;
  const progressPath = progressEnd <= startAngle + 0.01 ? "" : arcPath(innerRadius, outerRadius, startAngle, progressEnd, corner);

  const isHovered = hoveredIndex === index;
  const isFaded = hoveredIndex !== null && hoveredIndex !== index;
  const hoverScale = isHovered ? 1.03 : hoveredIndex !== null && hoveredIndex < index ? 1.02 : 1;
  const opacity = isFaded ? 0.35 : 1;
  const enterDone = !animate || (expandComplete && progressComplete);
  const groupStyle = { transformOrigin: "0px 0px", filter: isHovered ? `drop-shadow(0 0 10px ${color})` : "none" };

  const hit = getRingHitRadii(index, baseInnerRadius, strokeWidth, ringGap);
  const hitbox = <path d={arcPath(hit.innerRadius, hit.outerRadius, startAngle, endAngle, 0)} fill="transparent" onMouseEnter={onEnter} onMouseLeave={onLeave} />;
  const hoverTransition = { scale: { type: "spring" as const, stiffness: 400, damping: 25 }, opacity: { duration: 0.15 } };

  if (!enterDone && !expandComplete) {
    return (
      <g>
        {hitbox}
        <motion.g pointerEvents="none" style={{ ...groupStyle, scale: enterScale, opacity }}>
          <path d={trackPath} fill={RING_TRACK} />
        </motion.g>
      </g>
    );
  }
  return (
    <g>
      {hitbox}
      <motion.g animate={{ scale: hoverScale, opacity }} pointerEvents="none" style={groupStyle} transition={hoverTransition}>
        <path d={trackPath} fill={RING_TRACK} />
        <ProgressPath complete={enterDone || progressComplete} path={progressPath} animatedPath={animatedPath} color={color} />
      </motion.g>
    </g>
  );
});

Ring.displayName = "Ring";
