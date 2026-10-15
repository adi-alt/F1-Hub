import { GroupsHomeSkeleton } from "./components/GroupsHomeSkeleton";

// Suspense fallback for GroupsPage's data fetch (one Promise.all - see page.tsx). The shell's own padding and
// height are in GroupsHomeSkeleton, as they are in GroupsHomeClient.
export default function GroupsLoading() {
  return (
    <div role="status" className="page-wide skeleton-delay">
      <span className="sr-only">Loading communities</span>
      <GroupsHomeSkeleton />
    </div>
  );
}
