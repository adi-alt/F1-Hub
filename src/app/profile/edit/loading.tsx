import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// The edit form's own shape, not the profile page's favourites table (audit UI-35). The link,
// title and field labels are real; only the values wait for the data.
export default function EditProfileLoading() {
  return (
    <PageContainer width="narrow" className="py-10">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">Edit profile</h1>
      <SkeletonGroup label="Loading your profile" className="mt-8 space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-300">Display name</p>
          <Skeleton shape="block" className="h-10 w-full" />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-300">Email</p>
          <Skeleton shape="text" className="w-64" />
        </div>
        <Skeleton shape="block" className="h-9 w-20 rounded-full" />
      </SkeletonGroup>
    </PageContainer>
  );
}
