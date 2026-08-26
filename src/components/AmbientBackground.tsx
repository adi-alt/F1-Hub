// Server component on purpose — Math.random() here runs once per request (the whole app renders
// dynamically anyway, gated by the session cookie every page already reads), so every page load
// gets a genuinely different backdrop instead of one fixed layout baked in at build time.
const STREAK_COUNT = 4; // "visible in 3-4 places" — always render the full count, not a random
// number of them, since that request reads as a floor, not a range to gamble under.

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Soft diagonal red-to-blue light streaks over the zinc page background, positioned randomly
 * every request — the ambient glow from the reference photo, not a border/stroke on any
 * component (see globals.css for the grain layer that sits over everything else). */
export function AmbientBackground() {
  const streaks = Array.from({ length: STREAK_COUNT }, () => ({
    top: randomBetween(-15, 95),
    left: randomBetween(-20, 80),
    width: randomBetween(34, 52),
    height: randomBetween(9, 15),
    rotate: randomBetween(-50, -15),
    warmOpacity: randomBetween(0.13, 0.22),
    coolOpacity: randomBetween(0.06, 0.12),
  }));

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {streaks.map((s, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.width}vw`,
            height: `${s.height}vw`,
            transform: `rotate(${s.rotate}deg)`,
            filter: "blur(32px)",
            background: `linear-gradient(90deg, transparent, rgba(225, 90, 40, ${s.warmOpacity}), rgba(70, 130, 220, ${s.coolOpacity}), transparent)`,
          }}
        />
      ))}
    </div>
  );
}
