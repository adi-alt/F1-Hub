import { Skeleton } from "@/components/ui/Skeleton";
import { PANEL } from "../panel";

/** Mirrors PostCard's geometry: the panel, the 32px author photo, the one-line byline, the text and the 32px actions -
 * so a post replacing its placeholder doesn't move anything. */
export function PostCardSkeleton() {
  return (
    <div className={`p-4 ${PANEL}`}>
      <div className="flex gap-3">
        <Skeleton shape="circle" className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton shape="block" className="mt-0.5 h-3.5 w-48" />
          <Skeleton shape="block" className="mt-2.5 h-3.5 w-3/4" />
          <Skeleton shape="block" className="mt-2 h-3.5 w-full" />
          <Skeleton shape="block" className="mt-1.5 h-3.5 w-4/5" />
          <div className="mt-3 flex items-center gap-3">
            <Skeleton shape="block" className="h-4 w-16" />
            <Skeleton shape="block" className="h-4 w-12" />
            <Skeleton shape="block" className="h-4 w-14" />
          </div>
        </div>
      </div>
    </div>
  );
}
