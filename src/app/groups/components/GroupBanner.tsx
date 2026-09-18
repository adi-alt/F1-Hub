import { bannerLayers } from "@/lib/groupVisualIdentity";

const ASPECT = {
  // The card grid's own shape - a real banner accent at card width, not a wasted block.
  card: "aspect-[4/1]",
  // The community header's own ratio: flatter than the card grid's 4:1, because at full page width
  // that is tall enough to push the actual content (name, description, tabs) a real scroll down
  // before it starts - but no longer a bare strip, because two things now live ON it (the tagline
  // overlay and, for an admin, the cover control) and both need somewhere to sit. Still identity/
  // accent rather than a hero image competing with the content it introduces.
  header: "aspect-[9/2] sm:aspect-[11/2]",
};

/** The top strip of a group card/header - a real uploaded image when one exists, else a
 * deterministic layered gradient unique to this exact group (see groupVisualIdentity.ts). Always
 * gets a bottom-to-top scrim for the icon/name that sits on top of it. `variant` picks a real,
 * distinct aspect ratio per context (see ASPECT above) rather than one component-wide value or a
 * className override string-concatenated against the base class, which - as two Tailwind aspect-
 * ratio utilities of equal specificity - would have left the winner decided by generated-CSS
 * ordering, not by which one appears later in the class list. */
export function GroupBanner({ bannerUrl, seed, variant = "card", className = "" }: { bannerUrl: string | null; seed: string; variant?: "card" | "header"; className?: string }) {
  return (
    <div
      className={`relative ${ASPECT[variant]} w-full overflow-hidden bg-cover bg-center ${className}`}
      style={{ background: bannerUrl ? `url(${bannerUrl})` : bannerLayers(seed), backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}
