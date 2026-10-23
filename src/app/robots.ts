import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Audit R-50 (reduced): only the public landing page is crawlable; everything else is signed-in. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/$", disallow: "/" },
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
