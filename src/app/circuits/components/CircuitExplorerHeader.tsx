/** The Circuits homepage's own identity, not a bare page title - the same "page identity, not a
 * dashboard component" treatment Season's own header uses (see SeasonDetail.tsx). Every number
 * here comes from the real calendar the page was actually built from, never a hardcoded "23". */
export function CircuitExplorerHeader({
  year,
  totalCircuits,
  completedCount,
  remainingCount,
}: {
  year: number;
  totalCircuits: number;
  completedCount: number;
  remainingCount: number;
}) {
  return (
    <header className="mb-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Circuits</p>
      <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-white sm:text-[40px]">
        {year} Formula 1 Circuit Explorer
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
        Explore every circuit on the current calendar, from completed race weekends to tracks still to come.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-neutral-500">
        <span>
          <span className="font-mono font-semibold text-neutral-300">{totalCircuits}</span> circuits
        </span>
        <span aria-hidden className="text-neutral-700">
          ·
        </span>
        <span>
          <span className="font-mono font-semibold text-neutral-300">{completedCount}</span> completed
        </span>
        <span aria-hidden className="text-neutral-700">
          ·
        </span>
        <span>
          <span className="font-mono font-semibold text-neutral-300">{remainingCount}</span> remaining
        </span>
      </div>
    </header>
  );
}
