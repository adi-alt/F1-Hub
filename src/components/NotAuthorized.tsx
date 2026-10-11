export function NotAuthorized({ what = "this" }: { what?: string }) {
  return (
    <div className="page-content py-10">
      <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-10 text-center">
        {/* The page's h1: both callers render this in place of the whole page. */}
        <h1 className="text-lg font-semibold text-white">Not authorized</h1>
        <p className="mt-2 text-sm text-neutral-400">You don&apos;t have permission to view {what}.</p>
      </div>
    </div>
  );
}
