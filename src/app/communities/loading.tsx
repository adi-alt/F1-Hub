"use client";

import { useSearchParams } from "next/navigation";
import { GroupsHomeSkeleton } from "./components/GroupsHomeSkeleton";
import { CommunityDetailSkeleton } from "./_community/components/CommunityDetailSkeleton";

// The fallback while /groups loads: one community's shape when the URL names one (`?id=`), else the Communities
// home's. A client component only so it can read the URL it is loading. The home shell's own padding and height
// are in GroupsHomeSkeleton, as they are in GroupsHomeClient.
export default function GroupsLoading() {
  const id = useSearchParams().get("id");
  if (id) return <CommunityDetailSkeleton />;
  return (
    <div role="status" className="page-wide skeleton-delay">
      <span className="sr-only">Loading communities</span>
      <GroupsHomeSkeleton />
    </div>
  );
}
