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
    <div className="mt-1">
      {title && <p className="font-semibold text-white">{title}</p>}
      <p className={`whitespace-pre-wrap text-sm text-neutral-300 ${title ? "mt-1" : ""}`}>{shown}</p>
      {isLong && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs font-medium text-neutral-500 hover:text-white">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
