import Link from "next/link";
import { SignInGate } from "@/components/auth/SignInGate";
import { CreateGroupForm } from "./components/CreateGroupForm";
import { EntityAvatar } from "@/components/EntityAvatar";
import { JoinGroupForm } from "./components/JoinGroupForm";
import { getUserGroups } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { groupHref } from "@/lib/routes";

export default async function GroupsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <SignInGate label="your groups" />
      </div>
    );
  }

  const groups = await getUserGroups(session.uid);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Groups</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Compete on podium picks with friends — create a group or join one with an invite link.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <CreateGroupForm />
        <JoinGroupForm />
      </div>

      <div className="mt-10">
        {groups.length === 0 ? (
          <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6 text-center text-neutral-400">
            You&apos;re not in any groups yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={groupHref(g.id)}
                  className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4 transition hover:border-white/30"
                >
                  <div className="flex items-center gap-3">
                    <EntityAvatar imageUrl={g.avatarUrl} name={g.name} />
                    <div>
                      <p className="font-semibold text-white">{g.name}</p>
                      <p className="text-xs text-neutral-500">
                        {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                        {g.myRole === "admin" ? " · you're admin" : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm text-neutral-500">View →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
