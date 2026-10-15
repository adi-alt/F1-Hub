import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors PostCard's geometry as a feed row: the 40px author photo, the one-line byline, the text, and the
 * 36px ghost actions - so a post replacing its placeholder doesn't move anything. */
export function PostCardSkeleton() {
  return (
    <div className="py-4">
      <div className="flex gap-3">
        <Skeleton shape="circle" className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton shape="block" className="mt-0.5 h-3.5 w-52" />
          <Skeleton shape="block" className="mt-3 h-4 w-3/4" />
          <Skeleton shape="block" className="mt-2 h-4 w-full" />
          <Skeleton shape="block" className="mt-1.5 h-4 w-4/5" />
          <div className="mt-3 flex items-center gap-3">
            <Skeleton shape="block" className="h-5 w-20" />
            <Skeleton shape="block" className="h-5 w-14" />
            <Skeleton shape="block" className="h-5 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}
