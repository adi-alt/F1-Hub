export function ModelInfo() {
  return (
    <details className="rounded-xl border border-[var(--f1-line)] bg-black/20 p-4 text-sm text-neutral-400">
      <summary className="cursor-pointer font-medium text-neutral-300 select-none">
        How these predictions are made
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <p className="font-medium text-neutral-300">Finishing order — Random Forest regression (500 trees)</p>
          <p>
            Trained on: grid position, qualifying gap to pole, each driver&apos;s average finish
            over their last 3 races, each team&apos;s average finish over their last 6 races, and
            how much history each has.
          </p>
        </div>
        <div>
          <p className="font-medium text-neutral-300">Pole position — Random Forest regression (500 trees)</p>
          <p>
            Trained only on each driver&apos;s and team&apos;s recent qualifying-position form — no
            same-weekend data, since it has to run before qualifying happens. Weaker than the
            finishing-order model for exactly that reason.
          </p>
        </div>
        <div>
          <p className="font-medium text-neutral-300">Race pace — linear regression</p>
          <p>
            Predicts each driver&apos;s gap to that race&apos;s fastest lap from their qualifying
            gap, fit on every completed race this season.
          </p>
        </div>
        <p className="text-xs text-neutral-500">
          All three train fresh from the completed races already stored in the database — never
          on the fly while a page renders.
        </p>
      </div>
    </details>
  );
}
