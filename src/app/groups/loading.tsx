import { Skeleton } from "@/components/ui/Skeleton";
import { GroupsHomeSkeleton } from "./components/GroupsHomeSkeleton";

// Real Suspense fallback for GroupsPage's own async data fetch (feed + groups + predictions +
// next race, all in one Promise.all - see page.tsx).
export default function GroupsLoading() {
  return (
    <div className="mx-auto sm:max-w-[80vw] px-5 py-8 sm:px-8 lg:px-16">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-8">
        <GroupsHomeSkeleton />
      </div>
    </div>
  );
}
