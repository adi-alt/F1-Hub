import Link from "next/link";
import { notFound } from "next/navigation";
import { SignInGate } from "@/components/auth/SignInGate";
import { getLatestNews, getNewsByGuid } from "@/lib/supabase/news";
import { newsHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function NewsIndex() {
  const items = await getLatestNews();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">F1 News</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Pulled from Formula1.com&apos;s own feed as it publishes — this list only goes back to whenever that polling started, not a full history.
      </p>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">Nothing collected yet — check back soon.</p>
      ) : (
        <div className="mt-8 divide-y divide-[var(--f1-line)] rounded-xl border border-[var(--f1-line)]">
          {items.map((item) => (
            <Link key={item.guid} href={newsHref(item.guid)} className="block px-5 py-4 transition hover:bg-white/[0.03]">
              <p className="font-medium text-white">{item.title}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {formatDate(item.fetchedAt)}
                {item.creator ? ` · ${item.creator}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

async function NewsDetail({ guid }: { guid: string }) {
  const item = await getNewsByGuid(guid);
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/news" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← F1 News
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-white">{item.title}</h1>
      <p className="mt-1 text-xs text-neutral-500">
        Seen {formatDate(item.fetchedAt)}
        {item.creator ? ` · ${item.creator}` : ""}
      </p>

      {item.description && <p className="mt-6 text-neutral-300">{item.description}</p>}

      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm text-neutral-300 transition hover:border-white/30 hover:text-white"
      >
        Read the full story on Formula1.com →
      </a>
    </div>
  );
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <SignInGate label="F1 news" />
      </div>
    );
  }

  // Next.js already URL-decodes searchParams values — newsHref's encodeURIComponent is undone
  // for free here, same as circuitHref/circuits/page.tsx's own circuit param.
  const { id } = await searchParams;
  return id ? <NewsDetail guid={id} /> : <NewsIndex />;
}
