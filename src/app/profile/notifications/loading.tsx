import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// The notifications form's own shape: the real link and title, then its two preference rows and
// the save button.
export default function NotificationsLoading() {
  return (
    <PageContainer width="narrow" className="py-10">
      <Link href="/" className="text-sm text-tertiary hover:text-neutral-300">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">Notifications</h1>
      <SkeletonGroup label="Loading your notification preferences" className="mt-8 space-y-3">
        <Skeleton shape="block" className="h-14 w-full" />
        <Skeleton shape="block" className="h-14 w-full" />
        <Skeleton shape="block" className="mt-3 h-9 w-20 rounded-full" />
      </SkeletonGroup>
    </PageContainer>
  );
}
