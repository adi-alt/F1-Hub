import Link from "next/link";
import { NotificationsForm } from "@/components/profile/NotificationsForm";
import { SignInGate } from "@/components/auth/SignInGate";
import { getUserProfile } from "@/lib/firestore/users";
import { getSession } from "@/lib/session/getSession";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <SignInGate label="notification preferences" />
      </div>
    );
  }

  const profile = await getUserProfile(session.uid);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">Notifications</h1>
      <div className="mt-8">
        <NotificationsForm
          initialNotifyBeforeQualifying={profile?.notifyBeforeQualifying}
          initialNotifyOnResults={profile?.notifyOnResults}
        />
      </div>
    </div>
  );
}
