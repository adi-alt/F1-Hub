import { bannerGradient } from "@/lib/groupVisualIdentity";

/** The top strip of a group card/header - a real uploaded image when one exists, else a
 * deterministic gradient unique to this exact group (see groupVisualIdentity.ts). A subtle
 * diagonal-stripe overlay (the one texture every banner shares, only the two gradient hues vary)
 * gives it a motorsport feel without needing a different pattern per group. */
export function GroupBanner({ bannerUrl, seed, height = 96 }: { bannerUrl: string | null; seed: string; height?: number }) {
  return (
    <div className="relative w-full overflow-hidden bg-cover bg-center" style={{ height, background: bannerUrl ? `url(${bannerUrl})` : bannerGradient(seed), backgroundSize: "cover", backgroundPosition: "center" }}>
      {!bannerUrl && (
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "repeating-linear-gradient(135deg, #fff 0px, #fff 1.5px, transparent 1.5px, transparent 16px)",
          }}
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
    </div>
  );
}
