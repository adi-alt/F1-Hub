/** Inline stroke icons for the create flow's selection cards.
 *
 * Hand-drawn paths rather than an icon dependency: this app ships no icon library (every existing
 * icon in the codebase is an inline <svg>), and pulling one in for six glyphs would be the whole
 * package for a fraction of a percent of it. All six share one 20x20 box, 1.6 stroke, currentColor,
 * so they inherit the card's own selected/hover color without extra wiring. */

import type { CommunityType, CommunityVisibility } from "@/lib/communities";

const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  className: "h-4 w-4",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function TypeIcon({ type }: { type: CommunityType }) {
  switch (type) {
    case "f1":
      // Chequered flag.
      return (
        <svg {...base} aria-hidden>
          <path d="M4 3v14" />
          <path d="M4 4.5h11v7H4z" />
          <path d="M4 8h3.7M11.3 4.5V8M7.7 8v3.5M11.3 8H15" />
        </svg>
      );
    case "prediction_league":
      // Trophy.
      return (
        <svg {...base} aria-hidden>
          <path d="M6.5 3.5h7v3a3.5 3.5 0 0 1-7 0z" />
          <path d="M6.5 4.5H4.2a2.3 2.3 0 0 0 2.3 2.8M13.5 4.5h2.3a2.3 2.3 0 0 1-2.3 2.8" />
          <path d="M10 10v3M7.5 16.5h5M8.5 13h3v3.5h-3z" />
        </svg>
      );
    case "private_circle":
      // Small closed group.
      return (
        <svg {...base} aria-hidden>
          <circle cx="10" cy="7" r="2.6" />
          <path d="M4.8 16a5.2 5.2 0 0 1 10.4 0" />
          <path d="M15.5 4.2a2.4 2.4 0 0 1 0 4.4" opacity=".45" />
        </svg>
      );
    default:
      // Open conversation.
      return (
        <svg {...base} aria-hidden>
          <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h7.5A1.5 1.5 0 0 1 14 5.5v5A1.5 1.5 0 0 1 12.5 12H7l-3.5 2.5z" />
          <path d="M16.5 8v5a1.5 1.5 0 0 1-1.5 1.5h-1v2L11 14.5" opacity=".45" />
        </svg>
      );
  }
}

export function VisibilityIcon({ visibility }: { visibility: CommunityVisibility }) {
  switch (visibility) {
    case "private":
      // Padlock.
      return (
        <svg {...base} aria-hidden>
          <rect x="4.5" y="8.5" width="11" height="7.5" rx="1.5" />
          <path d="M7 8.5V6.2a3 3 0 0 1 6 0v2.3" />
        </svg>
      );
    case "hidden":
      // Struck-through eye.
      return (
        <svg {...base} aria-hidden>
          <path d="M4.2 4.2l11.6 11.6" />
          <path d="M8.1 8.2a2.5 2.5 0 0 0 3.5 3.5" />
          <path d="M6.2 6.4C4.6 7.4 3.4 8.8 2.8 10c1.4 2.6 4 4.4 7.2 4.4 1.1 0 2.1-.2 3-.6M13.6 12.2c1.7-1 2.9-2.3 3.6-2.2-1.2-2.3-3.4-4-6.2-4.3" />
        </svg>
      );
    default:
      // Globe.
      return (
        <svg {...base} aria-hidden>
          <circle cx="10" cy="10" r="6.5" />
          <path d="M3.5 10h13M10 3.5c1.8 2 2.7 4.2 2.7 6.5S11.8 14.5 10 16.5c-1.8-2-2.7-4.2-2.7-6.5S8.2 5.5 10 3.5z" />
        </svg>
      );
  }
}
