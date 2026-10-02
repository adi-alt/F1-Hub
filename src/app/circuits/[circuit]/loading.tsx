import { PageContainer } from "@/components/ui/PageContainer";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// A circuit's own page (CircuitDetailPage): the hero with the circuit's name and facts, the track
// experience grid, then its history - not the circuits explorer's grid, which circuits/loading.tsx
// is for (audit UI-35).
export default function CircuitLoading() {
  return (
    <PageContainer className="py-8">
      <SkeletonGroup label="Loading the circuit">
        <Skeleton shape="block" className="h-9 w-2/5 max-w-sm" />
        <Skeleton shape="text" className="mt-3 w-1/3 max-w-xs" />
        <Skeleton shape="block" className="mt-6 aspect-[21/8] w-full" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Skeleton shape="block" className="h-56" />
          <Skeleton shape="block" className="h-56" />
          <Skeleton shape="block" className="h-56" />
        </div>
        <Skeleton shape="block" className="mt-8 h-64" />
      </SkeletonGroup>
    </PageContainer>
  );
}
