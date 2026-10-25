import { NextResponse, type NextRequest } from "next/server";
import { cleanUrlFor } from "@/lib/sectionRoutes";

/**
 * Every section is a real path (lib/sectionRoutes.ts). An old link - `/?section=season&year=2026&race=...`, or an
 * older path-style one (/race?..., /groups, /archive?driver=...) - is redirected, permanently, to today's path with
 * the rest of its query carried across.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const destination = cleanUrlFor(url.pathname, url.searchParams);
  if (destination) return NextResponse.redirect(new URL(destination, url), 308);
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/season", "/race", "/circuits", "/archive", "/groups", "/communities", "/users", "/models", "/profile", "/admin/race-photos"],
};
