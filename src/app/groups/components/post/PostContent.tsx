"use client";

import { Fragment, useState } from "react";
import { motion } from "framer-motion";
import { firstUrlIn, safeHttpUrl } from "@/lib/linkPreview";
import { LinkPreview } from "./LinkPreview";

const TRUNCATE_AT = 500;
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;

/** The complete post, not a preview - the whole point of removing "View in group ->" is that the
 * feed itself is where a post gets read. Only genuinely long posts get a "Show more" expansion
 * (in place, no navigation) rather than every post being cut short. */
export function PostContent({ title, content }: { title: string | null; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > TRUNCATE_AT;
  const shown = isLong && !expanded ? `${content.slice(0, TRUNCATE_AT).trimEnd()}…` : content;
  // Previewed from the full content, not the truncated view: collapsing a long post shouldn't make
  // its link preview appear and disappear.
  const previewUrl = firstUrlIn(content);

  return (
    // Title 15px / body 14px: the body is still the strongest block of text in the card, but a
    // three-line post no longer occupies a screenful. Hierarchy comes from weight and the quieter
    // 11px metadata above it, not from making the body large.
    <div>
      {title && <p className="text-[15px] font-semibold leading-snug text-white">{title}</p>}
      {/* break-words + overflow-wrap-anywhere: a single unbroken 300-character URL or token would
          otherwise set the card's minimum width and push the whole column sideways. */}
      {/* layout: expanding a long post changes the card's height, and animating it keeps the rest
          of the feed from snapping upward under the reader. */}
      <motion.p layout="position" className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[14px] leading-[1.55] text-neutral-300 ${title ? "mt-0.5" : ""}`}>
        {linkify(shown)}
      </motion.p>
      {isLong && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-[11.5px] font-medium text-neutral-500 hover:text-white">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      {previewUrl && <LinkPreview url={previewUrl} />}
    </div>
  );
}

/**
 * Turns bare URLs in post text into real links.
 *
 * Every candidate goes through the same safeHttpUrl check the server uses, so a `javascript:` or
 * `data:` URL is never given an href - it stays plain text. Everything else is rendered by React as
 * text, so there is no path here from post content to markup.
 */
function linkify(text: string) {
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    const trimmed = part.replace(/[.,;:!?)\]}]+$/, "");
    const trailing = part.slice(trimmed.length);
    if (!safeHttpUrl(trimmed)) return <Fragment key={i}>{part}</Fragment>;
    return (
      <Fragment key={i}>
        <a href={trimmed} target="_blank" rel="noopener noreferrer" className="text-[var(--f1-red)] underline-offset-2 hover:underline">
          {trimmed}
        </a>
        {trailing}
      </Fragment>
    );
  });
}
