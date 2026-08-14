export function NotAuthorized({ what = "this" }: { what?: string }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-10 text-center">
        <p className="text-lg font-semibold text-white">Not authorized</p>
        <p className="mt-2 text-sm text-neutral-400">You don&apos;t have permission to view {what}.</p>
      </div>
    </div>
  );
}
