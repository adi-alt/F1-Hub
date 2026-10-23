import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Audit R-50 (reduced): the landing page is the one public page. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: new URL("/", SITE_URL).toString(), changeFrequency: "weekly", priority: 1 }];
}
