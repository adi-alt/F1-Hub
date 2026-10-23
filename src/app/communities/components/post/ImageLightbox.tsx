"use client";

import { Dialog } from "@/components/ui/Dialog";

/** A post image at full size, in the house Dialog: focus moves in, Escape or the scrim closes it,
 * and focus goes back to the thumbnail that opened it. */
export function ImageLightbox({ open, url, name, onClose }: { open: boolean; url: string; name: string; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={name} size="xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Storage URL */}
      <img src={url} alt={`${name}, full size`} className="mx-auto max-h-[75dvh] max-w-full rounded-card object-contain" />
    </Dialog>
  );
}
