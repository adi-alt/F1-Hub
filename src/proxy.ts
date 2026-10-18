import { NextResponse, type NextRequest } from "next/server";
import { internalPathFor, publicUrlForPath } from "@/lib/sectionRoutes";

/**
 * The site's URLs are `/?section=<name>&...` (lib/sectionRoutes.ts). A request for one is rewritten to the page's own
 * folder (the browser keeps the public URL); a request for an old path-style URL (/archive?team=..., /groups, /race?...)
 * is redirected, permanently, to its public form with its query carried across.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  if (url.pathname === "/") {
    const target = internalPathFor(url.searchParams);
    if (!target) return NextResponse.next();
    const rewritten = url.clone();
    rewritten.pathname = target;
    rewritten.searchParams.delete("section");
    return NextResponse.rewrite(rewritten);
  }
  const destination = publicUrlForPath(url.pathname, url.searchParams);
  if (destination) return NextResponse.redirect(new URL(destination, url), 308);
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/season", "/race", "/circuits", "/archive", "/groups", "/communities", "/users", "/models", "/profile", "/admin/race-photos"],
};
