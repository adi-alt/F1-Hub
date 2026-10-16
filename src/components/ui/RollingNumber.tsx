"use client";

import NumberFlow from "@number-flow/react";
import { Fragment, useEffect, useState } from "react";

/**
 * A number that rolls (NumberFlow, motion.dev's digit roll): from 0 to its value when it first appears, and from old
 * to new whenever it changes. NumberFlow honours "reduce motion" itself, showing the value without the roll. The first
 * paint is 0 on the server and the client alike, so hydration matches; the real value follows on the next frame.
 */
export function RollingNumber({ value, suffix, prefix, className }: { value: number; suffix?: string; prefix?: string; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <NumberFlow value={shown} suffix={suffix} prefix={prefix} className={className} />;
}

/** Text with its numbers rolling, e.g. a countdown "9d 1h" whose hour digit turns over in place each tick. Non-numeric
 * parts render as plain text. */
export function RollingText({ text }: { text: string }) {
  const parts = text.split(/(\d+)/);
  return (
    <>
      {parts.map((part, i) => (/^\d+$/.test(part) ? <NumberFlow key={i} value={Number(part)} /> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}
