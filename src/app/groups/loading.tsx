import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";
import { GroupsHomeSkeleton } from "./components/GroupsHomeSkeleton";

// Real Suspense fallback for GroupsPage's own async data fetch (feed + groups + predictions +
// next race, all in one Promise.all - see page.tsx). No page-title skeleton: the title lives
// inside the navigation rail now, so GroupsHomeSkeleton's own left column already accounts for it.
export default function GroupsLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8 lg:px-10">
      <SectionLoadingMessage label="Loading your paddock…" />
      <GroupsHomeSkeleton />
    </div>
  );
}
