import { SignInGate } from "@/components/auth/SignInGate";
import { GroupsPageClient } from "./components/GroupsPageClient";
import { getUserGroups } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";

export default async function GroupsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto sm:max-w-[80vw] px-5 py-8 sm:px-8 lg:px-16">
        <SignInGate label="your groups" />
      </div>
    );
  }

  const groups = await getUserGroups(session.uid);

  return (
    <div className="mx-auto sm:max-w-[80vw] px-5 py-8 sm:px-8 lg:px-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Groups</h1>
          <p className="mt-1 text-sm text-neutral-400">Your F1 communities, predictions and conversations.</p>
        </div>
      </div>

      <div className="mt-8">
        <GroupsPageClient groups={groups} />
      </div>
    </div>
  );
}
