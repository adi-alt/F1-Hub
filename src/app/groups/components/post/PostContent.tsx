"use client";

import { useState } from "react";

const TRUNCATE_AT = 500;

/** The complete post, not a preview - the whole point of removing "View in group ->" is that the
 * feed itself is where a post gets read. Only genuinely long posts get a "Show more" expansion
 * (in place, no navigation) rather than every post being cut short. */
export function PostContent({ title, content }: { title: string | null; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > TRUNCATE_AT;
  const shown = isLong && !expanded ? `${content.slice(0, TRUNCATE_AT).trimEnd()}…` : content;

  return (
    // 13.5px, not 15: the body stays the strongest text in the card (every other string around it
    // is 9.5-13px now) without being the thing that made a three-line post occupy a screenful.
    <div className="mt-1">
      {title && <p className="text-[13.5px] font-semibold text-white">{title}</p>}
      <p className={`whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-neutral-300 ${title ? "mt-0.5" : ""}`}>{shown}</p>
      {isLong && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-[11px] font-medium text-neutral-500 hover:text-white">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
