import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy notice",
  description: "What Apex F1 Hub stores about you, who processes it, and how to get a copy or delete it.",
  path: "/privacy",
  index: false,
});

/** The privacy notice (audit R-53): a plain, accurate draft of what the code does today, for the owner to review. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="23 October 2026">
      <section>
        <h2>What we store</h2>
        <ul>
          <li>Your account: email address, first and last name, username, the profile photo address your sign-in provider gives us, your time zone, role and the date you joined.</li>
          <li>Your settings: favourite drivers, teams and circuits, and which notifications you want on the site and by email.</li>
          <li>What you do here: race picks, community prediction entries, your points balance and every points movement, and your notifications.</li>
          <li>Communities: the ones you create or join, join requests and invitations, and your posts, comments, votes and calls, including files and images you attach.</li>
          <li>Security records: a hashed one-time sign-in code (never the code itself) while it is valid, and request counters keyed by your account or IP address that stop abuse.</li>
        </ul>
      </section>
      <section>
        <h2>Who processes it</h2>
        <ul>
          <li>Supabase hosts the database and the files you upload. Everything above lives there.</li>
          <li>Resend delivers our emails (sign-in codes and the notifications you choose to get by email), so it receives your email address and the email&apos;s content.</li>
          <li>
            Groq, with OpenRouter as a fallback, runs the AI features. When you ask Apex a question or ask for help writing a post, your question or draft and the race data it
            needs are sent to them to produce the answer. Your email address is not sent.
          </li>
          <li>Klipy provides GIF search: the words you search for are sent to it.</li>
          <li>Vercel hosts the site and measures page performance and visits in aggregate. Sentry receives error reports, with personal details removed before they are sent.</li>
        </ul>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>One essential cookie keeps you signed in. We don&apos;t use advertising or tracking cookies.</p>
      </section>
      <section>
        <h2>Who sees what</h2>
        <p>
          Your name, username, photo and points are visible to other signed-in members, and your posts and comments to the members of the community they are in. Your email
          address is never shown to other members.
        </p>
      </section>
      <section>
        <h2>Your copy, and deleting it</h2>
        <p>
          In <Link href="/profile/account" className="text-primary underline-offset-4 hover:underline">Settings › Account</Link> you can download everything we hold about
          you as a JSON file, and delete your account. Deleting it removes your account, profile, picks, entries, points, notifications, memberships, posts, comments and
          uploaded files immediately; it can&apos;t be undone. Copies in database backups expire with those backups.
        </p>
      </section>
    </LegalPage>
  );
}
