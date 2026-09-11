"use client";

import { useEffect, useState } from "react";
import { communityTypeMeta, visibilityLabel, MODULE_LABELS, type CommunityModule } from "@/lib/communities";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupDetail } from "@/lib/supabase/groups";
import { timeAgo } from "@/lib/format";

/**
 * Media is a *view over the feed*, not a second store - it lists the posts in this community that
 * happen to carry an image or video (`group_posts.media_url is not null`, the `mediaOnly` flag on
 * listPosts). That's why enabling the module needs no migration and no upload flow of its own:
 * anything posted with an image is already here.
 */
export function MediaTab({ groupId }: { groupId: string }) {
  const [posts, setPosts] = useState<GroupPost[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups/${groupId}/posts?mediaOnly=1`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<{ posts: GroupPost[] }>;
      })
      .then((body) => !cancelled && setPosts(body.posts))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (error) {
    return <p className="rounded-xl border border-[var(--f1-line)] bg-black/20 p-8 text-center text-sm text-neutral-500">Couldn&apos;t load media.</p>;
  }

  if (posts === null) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer aspect-square rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--f1-line)] bg-black/20 p-10 text-center">
        <p className="text-sm font-semibold text-neutral-300">No photos or video yet.</p>
        <p className="mt-1 text-xs text-neutral-500">Anything posted with an image shows up here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {posts.map((post) => (
        <figure key={post.id} className="overflow-hidden rounded-lg border border-[var(--f1-line)] bg-black/20">
          {isVideo(post.mediaUrl) ? (
            <video src={post.mediaUrl ?? undefined} controls preload="metadata" className="aspect-square w-full bg-black object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.mediaUrl ?? ""} alt="" loading="lazy" className="aspect-square w-full object-cover" />
          )}
          <figcaption className="px-2.5 py-2">
            <p className="line-clamp-2 text-[11px] leading-snug text-neutral-400">{post.title ?? post.content}</p>
            <p className="mt-1 text-[10px] text-neutral-600">
              {post.authorName} · {timeAgo(post.createdAt)}
            </p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function isVideo(url: string | null): boolean {
  return !!url && /\.(mp4|webm)(\?|$)/i.test(url);
}

/** What this community is, who runs it, and what it has switched on. Everything here is read
 * straight off the row - no prose is generated. */
export function AboutTab({ group, modules, memberCount }: { group: GroupDetail; modules: CommunityModule[]; memberCount: number }) {
  const meta = communityTypeMeta(group.communityType);
  const admins = group.members.filter((m) => m.role === "admin");
  const moderators = group.members.filter((m) => m.role === "moderator");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">About</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          {group.description || <span className="text-neutral-600">No description yet.</span>}
        </p>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Details</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Detail label="Type" value={meta.label} />
          <Detail label="Visibility" value={visibilityLabel(group.visibility)} />
          <Detail label="Topic" value={group.topic ?? "—"} />
          <Detail label="Members" value={String(memberCount)} />
          <Detail label="Created" value={new Date(group.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} />
          <Detail label="Post approval" value={group.moderationEnabled ? "Required" : "Not required"} />
        </dl>
      </section>

      {group.tags.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Tags</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[var(--f1-line)] px-2.5 py-0.5 text-xs text-neutral-400">
                #{tag}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Enabled</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {modules.map((m) => (
            <span key={m} className="rounded-full border border-[var(--f1-line)] px-2.5 py-0.5 text-xs text-neutral-400">
              {MODULE_LABELS[m]}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Run by</h2>
        <ul className="mt-2 space-y-1 text-sm text-neutral-300">
          {admins.map((m) => (
            <li key={m.userId}>
              {m.displayName ?? m.username ?? "Member"} <span className="text-xs text-neutral-600">Admin</span>
            </li>
          ))}
          {moderators.map((m) => (
            <li key={m.userId}>
              {m.displayName ?? m.username ?? "Member"} <span className="text-xs text-neutral-600">Moderator</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--f1-line)] pb-1.5 sm:border-0 sm:pb-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-xs text-neutral-300">{value}</dd>
    </div>
  );
}
