import { GroupsHomeSkeleton } from "./components/GroupsHomeSkeleton";

// Real Suspense fallback for GroupsPage's own async data fetch (feed + groups + predictions + next race +
// suggestions, all in one Promise.all - see page.tsx), in the page's own section order.
export default function GroupsLoading() {
  return (
    <div role="status" className="page-wide skeleton-delay py-6">
      <span className="sr-only">Loading communities</span>
      <GroupsHomeSkeleton />
    </div>
  );
}
