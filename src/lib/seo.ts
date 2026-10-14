import type { Metadata } from "next";

/** The site's name, wherever it's shown: the header, titles, share cards, emails. */
export const SITE_NAME = "Apex F1 Hub";

export const SITE_DESCRIPTION =
  "Live Formula 1 results and timing, race predictions with friends, an AI race analyst, and every Grand Prix since 1950.";

/** The public origin, for absolute links in share cards. APP_BASE_URL is the same operator-set origin emails use
 * (lib/html.ts); production's own domain otherwise. */
export const SITE_URL = new URL(process.env.APP_BASE_URL?.trim() || "https://apexf1hub.com");

/** The share card's picture (public/og-image.png, drawn from scripts/og/og-image.html - see scripts/og/render.mjs). */
export const SHARE_IMAGE = { url: "/og-image.png", width: 1200, height: 630, alt: "Apex F1 Hub: live results, predictions and every race since 1950" };

type PageMeta = {
  /** The page's own title, without the site name: the root layout's template adds " | Apex F1 Hub". */
  title: string;
  description: string;
  /** The page's canonical path, e.g. "/circuits". */
  path?: string;
  /** False for pages that shouldn't be in search results (admin, previews). */
  index?: boolean;
};

/**
 * A page's metadata: its title and description, and the share card that goes with them (Open Graph for WhatsApp,
 * iMessage, Slack, Discord, LinkedIn and Facebook; Twitter/X's large-image card). Metadata merges shallowly between
 * a layout and a page, so a page that set only `title` would share the root layout's card under the home page's
 * title. This keeps the card's title, description, link and picture together with the page's own.
 */
export function pageMetadata({ title, description, path, index = true }: PageMeta): Metadata {
  const shareTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: shareTitle,
      description,
      ...(path ? { url: path } : {}),
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [SHARE_IMAGE] },
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}
