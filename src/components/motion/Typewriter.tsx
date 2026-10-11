"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Types `text` out once it scrolls into view, the way Apex would say it. Screen readers get the whole sentence
 * at once (the typed copy is aria-hidden); reduced motion shows it complete.
 */
export function Typewriter({ text, msPerChar = 22 }: { text: string; msPerChar?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number | undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      let n = 0;
      setShown(0);
      timer = window.setInterval(() => {
        n += 1;
        setShown(n);
        if (n >= text.length) window.clearInterval(timer);
      }, msPerChar);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [text, msPerChar]);

  const typing = shown !== null && shown < text.length;
  return (
    <span ref={ref}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {shown === null ? text : text.slice(0, shown)}
        {typing && <span className="type-caret" />}
      </span>
    </span>
  );
}
