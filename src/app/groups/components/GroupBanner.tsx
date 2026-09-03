import { bannerLayers } from "@/lib/groupVisualIdentity";

/** The top strip of a group card/header - a real uploaded image when one exists, else a
 * deterministic layered gradient unique to this exact group (see groupVisualIdentity.ts). A wide
 * 4:1 aspect ratio (not a tall fixed height) so it reads as a banner accent, not a wasted block -
 * scales cleanly across the grid's own responsive card widths instead of needing a breakpoint of
 * its own. Always gets a bottom-to-top scrim for the icon/name that sits on top of it. */
export function GroupBanner({ bannerUrl, seed, className = "" }: { bannerUrl: string | null; seed: string; className?: string }) {
  return (
    <div
      className={`relative aspect-[4/1] w-full overflow-hidden bg-cover bg-center ${className}`}
      style={{ background: bannerUrl ? `url(${bannerUrl})` : bannerLayers(seed), backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}
