"use client";

import { useEffect } from "react";

/** Query-param analog of a `#hash` anchor: `?section=qualifying` scrolls to `id="qualifying"`
 * once mounted, since (unlike a real hash) the browser gives a query param no free scroll. */
export function ScrollToSection({ id }: { id?: string }) {
  useEffect(() => {
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [id]);
  return null;
}
