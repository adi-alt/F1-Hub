"use client";

import { useState } from "react";
import { ImageLightbox } from "./ImageLightbox";
import type { PostAttachment } from "@/lib/supabase/groupPosts";

export function PostGallery({ gallery }: { gallery: PostAttachment[] }) {
  const [activeImage, setActiveImage] = useState<{ url: string; name: string } | null>(null);

  if (!gallery || gallery.length < 2) return null;

  const count = Math.min(gallery.length, 4);
  const items = gallery.slice(0, 4);

  return (
    <>
      <div
        className={`mt-2.5 grid gap-1.5 overflow-hidden rounded-lg ${
          count === 2 ? "grid-cols-2" : count === 3 ? "grid-cols-2 grid-rows-2" : "grid-cols-2 grid-rows-2"
        }`}
      >
        {items.map((item, index) => {
          const isSpan = count === 3 && index === 0;
          const label = item.name ?? `Image ${index + 1}`;

          return (
            <button
              key={`${item.url}-${index}`}
              type="button"
              onClick={() => setActiveImage({ url: item.url, name: label })}
              aria-label={`View ${label} full size`}
              className={`group relative overflow-hidden rounded-control border border-white/10 bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                isSpan ? "row-span-2 aspect-[4/5]" : "aspect-[4/3]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbUrl ?? item.url}
                alt={label}
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-fast group-hover:bg-white/[0.04]" />
            </button>
          );
        })}
      </div>

      {activeImage && (
        <ImageLightbox
          open={Boolean(activeImage)}
          url={activeImage.url}
          name={activeImage.name}
          onClose={() => setActiveImage(null)}
        />
      )}
    </>
  );
}

