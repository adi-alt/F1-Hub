"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/providers/AuthProvider";

/**
 * The page's one <main> and, for a signed-out visitor on the landing page, the footer. The document
 * itself scrolls (audit R-31); this used to own a fixed-height scroll container with a smooth-scroll
 * layer on top, which broke Back-button scroll restoration, keyboard scrolling on load, find-in-page
 * and the browser's scrollbar.
 */
export function PageFrame({ season, children }: { season: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthorized, loading } = useAuth();

  return (
    <>
      {/* The skip link's target. tabIndex -1 lets the skip link move focus here, so the next Tab lands on
          the first control in the content. */}
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>
      {/* Signed-in visitors get the data-dense homepage, not the marketing pitch this footer's copy is
          aimed at. `!loading` matters as much as `!isAuthorized`: useAuth() starts with isAuthorized
          false before the session check resolves, so without it the footer would flash in under the
          homepage's loading skeleton for every visitor, then disappear. */}
      {pathname === "/" && !loading && !isAuthorized && <Footer season={season} />}
    </>
  );
}
