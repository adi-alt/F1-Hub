/** Active/Historical, wherever a track or team needs to say which one it is (ArchiveCircuitGrid,
 * ArchiveTeamTable) - one shared rectangular block (a border, not a filled rounded-full pill) so
 * the same fact reads identically in both places instead of two different treatments. */
export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active ? "border-[var(--f1-red)]/40 text-brand-text" : "border-white/10 text-tertiary"
      }`}
    >
      {active ? "Active" : "Historical"}
    </span>
  );
}
