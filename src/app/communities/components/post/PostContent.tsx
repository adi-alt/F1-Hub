"use client";

import { Fragment, useState } from "react";
import { firstUrlIn, safeHttpUrl } from "@/lib/linkPreview";
import { LinkPreview } from "./LinkPreview";

const TRUNCATE_AT = 500;
const TOKEN_PATTERN = /(https?:\/\/[^\s<>"']+|@[a-zA-Z0-9_.-]+)/gi;

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
    // Title and body at the site's 14px base (Season's rows and copy), the title set apart by weight; the body on a
    // 24px line so longer posts stay comfortable to read.
    <div>
      {title && <p className="text-body-sm font-semibold text-primary">{title}</p>}
      {/* break-words + overflow-wrap-anywhere: a single unbroken 300-character URL or token would
          otherwise set the card's minimum width and push the whole column sideways. */}
      {/* No layout animation here: the card moves as a whole when the feed reorders (a filter, a new post), and a
          paragraph animating its own position separately trails behind its card. Show more expands in place. */}
      <p className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-body-sm leading-6 text-primary/85 ${title ? "mt-0.5" : ""}`}>
        {linkify(shown)}
      </p>
      {isLong && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 rounded-control text-body-sm font-medium text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      {previewUrl && <LinkPreview url={previewUrl} />}
    </div>
  );
}

/**
 * Turns bare URLs in post text into real links, and wraps `@username` mentions
 * in styled rounded-rectangle tags.
 *
 * Every URL candidate goes through the same safeHttpUrl check the server uses, so a `javascript:` or
 * `data:` URL is never given an href - it stays plain text. Everything else is rendered by React as
 * text, so there is no path here from post content to markup.
 */
function linkify(text: string) {
  return text.split(TOKEN_PATTERN).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    if (part.startsWith("@")) {
      return (
        <span
          key={i}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-control bg-white/[0.08] hover:bg-white/[0.12] border border-white/12 text-primary font-medium text-body-sm align-baseline transition-colors select-none"
        >
          {part}
        </span>
      );
    }
    const trimmed = part.replace(/[.,;:!?)\]}]+$/, "");
    const trailing = part.slice(trimmed.length);
    if (!safeHttpUrl(trimmed)) return <Fragment key={i}>{part}</Fragment>;
    return (
      <Fragment key={i}>
        <a href={trimmed} target="_blank" rel="noopener noreferrer" className="text-brand-text underline-offset-2 hover:underline">
          {trimmed}
        </a>
        {trailing}
      </Fragment>
    );
  });
}
