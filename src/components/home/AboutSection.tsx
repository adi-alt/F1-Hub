import { TreasureMapSection } from "@/components/home/TreasureMapSection";

export function AboutSection() {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
        How this works
      </h2>
      <p className="mb-8 max-w-2xl text-2xl font-bold text-white">
        F1 Hub follows the sport the way a fan actually does. Five corners, one lap.
      </p>

      <TreasureMapSection />
    </div>
  );
}
