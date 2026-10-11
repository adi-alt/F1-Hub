import { PageContainer } from "@/components/ui/PageContainer";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// The Models page's own shape: its real title (the same classes page.tsx uses, so nothing moves),
// then the benchmarks table as rows.
export default function ModelsLoading() {
  return (
    <PageContainer className="py-10">
      <h1 className="text-3xl font-bold text-white">Models</h1>
      <SkeletonGroup label="Loading models" className="mt-8 flex flex-col gap-1">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} shape="row" />
        ))}
      </SkeletonGroup>
    </PageContainer>
  );
}
