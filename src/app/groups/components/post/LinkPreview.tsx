"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { LinkPreviewData } from "@/lib/linkPreview";

/**
 * A compact rich preview for the first link in a post.
 *
 * Fetched after mount rather than at post time: a post is saved whether or not its link has usable
 * metadata (failing to reach a third-party site must never block publishing), so the preview is a
 * read-side enhancement that degrades to the plain domain line when nothing comes back.
 *
 * Everything rendered here is untrusted third-party text, so it is rendered as text - React escapes
 * it - and the whole card is a plain link with rel="noopener noreferrer" and a validated http(s)
 * href resolved server-side. The image is a bare <img> on purpose: it points at an arbitrary
 * domain, which Next's optimizer would refuse, and it is allowed to fail silently.
 */
export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((res) => (res.status === 200 ? (res.json() as Promise<LinkPreviewData>) : null))
      .then((body) => body && setData(body))
      .catch(() => {});
    return () => controller.abort();
  }, [url]);

  let domain: string;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  // The honest fallback while loading, or when the site gave us nothing usable: the link itself,
  // by domain - not a skeleton that may never resolve into anything.
  if (!data) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11.5px] text-neutral-400 transition hover:border-white/[0.14] hover:text-neutral-200"
      >
        <LinkIcon />
        <span className="truncate">{domain}</span>
      </a>
    );
  }

  return (
    <motion.a
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 block overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] transition hover:border-white/[0.14]"
    >
      {data.imageUrl && !imageFailed && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary third-party host; not optimizable, and allowed to fail
        <img src={data.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} className="h-28 w-full border-b border-white/[0.06] object-cover" />
      )}
      <div className="px-2.5 py-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
          <LinkIcon />
          <span className="truncate">{data.siteName ?? data.domain}</span>
        </p>
        {data.title && <p className="mt-1 line-clamp-2 text-[12.5px] font-semibold leading-snug text-neutral-100">{data.title}</p>}
        {data.description && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-neutral-400">{data.description}</p>}
      </div>
    </motion.a>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden className="shrink-0">
      <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
