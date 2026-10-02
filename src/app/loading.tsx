import { PageContainer } from "@/components/ui/PageContainer";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// The fallback for every route without its own loading.tsx, and for the home page, which may turn
// out to be either the signed-out or the signed-in layout. So it is deliberately neutral: a title
// and a few data blocks, not one home page's geometry for the other to visibly replace (audit
// UI-35). HomeShell shows the right home skeleton once it knows which home it is.
export default function Loading() {
  return (
    <PageContainer className="py-10">
      <SkeletonGroup>
        <Skeleton shape="block" className="h-9 w-2/5 max-w-sm" />
        <Skeleton shape="text" className="mt-3 w-3/5 max-w-lg" />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Skeleton shape="block" className="h-48" />
          <Skeleton shape="block" className="h-48" />
        </div>
        <Skeleton shape="block" className="mt-6 h-64" />
      </SkeletonGroup>
    </PageContainer>
  );
}
