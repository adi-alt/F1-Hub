import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// The auth pages' own shape (a small centred card, the same container reset-password renders),
// instead of the home page's skeleton they used to fall back to (audit UI-35).
export default function AuthLoading() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-4 px-4">
      <SkeletonGroup className="flex flex-col gap-4">
        <Skeleton shape="block" className="h-8 w-3/5" />
        <Skeleton shape="block" className="h-10 w-full" />
        <Skeleton shape="block" className="h-10 w-full" />
        <Skeleton shape="block" className="h-10 w-full rounded-full" />
      </SkeletonGroup>
    </div>
  );
}
