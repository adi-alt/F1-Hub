import Link from "next/link";
import { NotificationsForm } from "@/components/profile/NotificationsForm";
import { SignInGate } from "@/components/auth/SignInGate";
import { getUserProfile } from "@/lib/supabase/users";
import { getSession } from "@/lib/session/getSession";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Notifications", description: "Choose when Apex F1 Hub emails you: before qualifying, and when results are in.", path: "/profile/notifications", index: false });

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-narrow py-10">
        <SignInGate label="notification preferences" />
      </div>
    );
  }

  const profile = await getUserProfile(session.uid);

  return (
    <div className="page-narrow py-10">
      <Link href="/" className="text-sm text-tertiary hover:text-neutral-300">
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
