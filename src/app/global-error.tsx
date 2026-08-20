"use client";

import { useEffect } from "react";

/**
 * The one error boundary above the root layout itself — triggers only if RootLayout (or
 * something it renders unconditionally, like AppProviders) throws, which error.tsx can't catch
 * (that one lives *inside* the layout). Has to render its own <html>/<body>: there's no working
 * layout left to render into. Deliberately minimal, inline-styled rather than Tailwind-classed —
 * if the app's own providers/CSS pipeline is what broke, this page can't assume either still works.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0a0a0c", color: "#f2f2f3", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: "36rem", margin: "4rem auto", padding: "0 1rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.125rem", fontWeight: 600, color: "#fff" }}>F1 Hub hit an unexpected error</p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#a3a3a3" }}>
            The whole page failed to load, not just one section. Try reloading.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              borderRadius: "9999px",
              background: "#e10600",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.875rem",
              padding: "0.5rem 1.25rem",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
