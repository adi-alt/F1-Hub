/** Shared empty state for the analysis panels.
 *
 * Its own module rather than an export from AnalysisWorkspace: the workspace imports each panel,
 * and each panel needs this, so keeping it there created a genuine import cycle
 * (AnalysisWorkspace -> BattlesPanel -> AnalysisWorkspace). Hoisting made it work by accident;
 * one refactor to an arrow function would have turned it into a runtime TDZ error.
 */
export function AnalysisEmptyState({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[200px] items-center justify-center px-6 text-center text-sm text-neutral-500">{children}</div>;
}
