import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";
import { SparklesIcon } from "lucide-react";

export function SeasonStory() {
  const { intelligence, loading, error } = useSeasonIntelligence();

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--f1-border)] bg-[var(--f1-card)] p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-6 rounded-full bg-[var(--f1-muted)]" />
          <div className="h-6 w-1/3 bg-[var(--f1-muted)] rounded" />
        </div>
        <div className="h-4 w-full bg-[var(--f1-muted)] rounded mb-2" />
        <div className="h-4 w-5/6 bg-[var(--f1-muted)] rounded mb-2" />
        <div className="h-4 w-4/6 bg-[var(--f1-muted)] rounded" />
      </div>
    );
  }

  if (error || !intelligence) return null; // Or show deterministic fallback gracefully

  const story = intelligence.seasonStory;

  return (
    <div className="rounded-xl border border-[var(--f1-border)] bg-[var(--f1-card)] p-6 shadow-sm overflow-hidden relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--f1-accent)] to-[var(--f1-red)]" />
      
      <div className="flex items-center gap-2 mb-3">
        <SparklesIcon className="w-5 h-5 text-[var(--f1-accent)]" />
        <h2 className="text-lg font-bold text-[var(--f1-text)]">Apex Season Take</h2>
      </div>

      <h3 className="text-2xl font-black italic uppercase text-[var(--f1-text)] mb-3 leading-tight tracking-tight">
        {story.headline}
      </h3>
      
      <p className="text-[var(--f1-text-muted)] leading-relaxed mb-4">
        {story.summary}
      </p>

      {story.themes && story.themes.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[var(--f1-border)]">
          {story.themes.map((theme, i) => (
            <span key={i} className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-[var(--f1-muted)] text-[var(--f1-text)]">
              {theme}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
