import { SignInGate } from "@/components/auth/SignInGate";
import { GroupsPageClient } from "./components/GroupsPageClient";
import { getUserGroups } from "@/lib/supabase/groups";
import { getPointsBalance } from "@/lib/supabase/points";
import { getSession } from "@/lib/session/getSession";

export default async function GroupsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="your groups" />
      </div>
    );
  }

  const [groups, pointsBalance] = await Promise.all([getUserGroups(session.uid), getPointsBalance(session.uid)]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Groups</h1>
      <p className="mt-1 text-sm text-neutral-400">Create, discover and compete with the F1 community.</p>

      <div className="mt-8">
        <GroupsPageClient groups={groups} pointsBalance={pointsBalance} />
      </div>
    </div>
  );
}
