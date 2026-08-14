"use client";

// Controlled, not self-fetching: ArchiveExplorer owns the favorited Sets and persistence so
// state survives a tab switch (this button would otherwise re-mount with stale props every time
// its tab becomes active again — see ArchiveExplorer's toggleFavorite).
export function FavoriteButton({
  favorited,
  onToggle,
  className = "",
}: {
  favorited: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorited}
      className={`shrink-0 transition hover:scale-110 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={favorited ? "var(--f1-red)" : "none"}
        stroke={favorited ? "var(--f1-red)" : "currentColor"}
        strokeWidth="2"
      >
        <path
          d="M12 21s-6.7-4.35-9.3-8.1C.8 9.8 1.7 6 5 5c2-.6 3.8.3 5 2 1.2-1.7 3-2.6 5-2 3.3 1 4.2 4.8 2.3 7.9C18.7 16.65 12 21 12 21z"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
