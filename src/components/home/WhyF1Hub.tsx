const PILLARS = [
  { icon: "🧠", title: "Real predictions", body: "A Random Forest model and a 10,000-run Monte Carlo simulation call every race before it starts." },
  { icon: "📚", title: "Seventy years of history", body: "Every season back to 1950 — results, qualifying, pit stops, lap timing where it exists." },
  { icon: "👥", title: "A real community", body: "Join a group, make podium picks, and climb a real leaderboard once races finish." },
];

/** The short "what is this" pitch — TreasureMapSection (ExploreSection) already tells this story
 * in depth; this is the compact version above it, per the logged-out page structure. */
export function WhyF1Hub() {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">Why F1 Hub</h2>
      <p className="mt-2 max-w-2xl text-2xl font-bold text-white">F1 Hub follows the sport the way a fan actually does.</p>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title}>
            <span className="text-2xl" aria-hidden>
              {p.icon}
            </span>
            <h3 className="mt-2 font-semibold text-white">{p.title}</h3>
            <p className="mt-1 text-sm text-neutral-400">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
