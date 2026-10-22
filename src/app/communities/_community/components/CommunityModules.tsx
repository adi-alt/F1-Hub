"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { communityTypeMeta, visibilityLabel, MODULE_DESCRIPTIONS, MODULE_LABELS, type CommunityModule } from "@/lib/communities";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { EYEBROW } from "@/components/ui/panel";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupDetail } from "@/lib/supabase/groups";
import { timeAgo } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Media is a *view over the feed*, not a second store - it lists the posts in this community that
 * happen to carry an image or video (`group_posts.media_url is not null`, the `mediaOnly` flag on
 * listPosts). That's why enabling the module needs no migration and no upload flow of its own:
 * anything posted with an image is already here.
 */
export function MediaTab({ groupId }: { groupId: string }) {
  const [posts, setPosts] = useState<GroupPost[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
  }, [groupId, attempt]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-body-sm text-secondary">Couldn&apos;t load the photos and videos.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setError(false);
            setPosts(null);
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (posts === null) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer aspect-square rounded-control bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <EmptyState icon={ImageIcon} message="No photos or videos yet. Anything posted with one in the feed shows up here." />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {posts.map((post) => (
        <figure key={post.id} className="min-w-0">
          {isVideo(post.mediaUrl) ? (
            <video src={post.mediaUrl ?? undefined} controls preload="metadata" className="aspect-square w-full rounded-control bg-black object-cover" />
          ) : (
            <MediaThumbnail url={post.mediaUrl} />
          )}
          <figcaption className="pt-2">
            <p className="line-clamp-2 text-caption leading-snug text-secondary">{post.title ?? post.content}</p>
            <p className="mt-1 text-caption text-tertiary">
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

/** next/image, not a plain `<img>` - this media is re-hosted in Supabase Storage, which
 * next.config.ts's remotePatterns already covers, so there's real optimization to gain (resizing,
 * lazy loading, format negotiation) for no cost. `onError` falls back to an honest "image
 * unavailable" placeholder instead of a browser's broken-image glyph or a silently blank tile - a
 * deleted/expired Storage object is a real state, not a bug to hide. */
function MediaThumbnail({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-control bg-white/[0.03] text-caption text-tertiary">Image unavailable</div>
    );
  }
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-control">
      <Image src={url} alt="" fill sizes="(min-width: 640px) 33vw, 50vw" className="object-cover" onError={() => setBroken(true)} />
    </div>
  );
}

/** What this community is, who runs it and what it has, in the site's own detail language (as Profile reads): a lead,
 * a grid of figures, then divided lists under eyebrows. Everything is read straight off the row - no prose is
 * generated. */
export function AboutTab({ group, modules, memberCount }: { group: GroupDetail; modules: CommunityModule[]; memberCount: number }) {
  const meta = communityTypeMeta(group.communityType);
  const runners = [...group.members.filter((m) => m.role === "admin"), ...group.members.filter((m) => m.role === "moderator")];
  const facts = [
    { label: "Members", value: String(memberCount) },
    { label: "Since", value: new Date(group.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) },
    { label: "Type", value: meta.label },
    { label: "Who can join", value: VISIBILITY_SHORT[group.visibility] ?? visibilityLabel(group.visibility) },
    { label: "Topic", value: group.topic ?? "Anything" },
    { label: "New posts", value: group.moderationEnabled ? "Reviewed first" : "Go straight up" },
  ];

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-body text-secondary">{group.description || "No description yet."}</p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className={EYEBROW}>{f.label}</dt>
            <dd className="mt-1 truncate text-body font-medium text-primary">{f.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="about-run-by" className="border-t border-white/[0.06] pt-5">
        <h3 id="about-run-by" className={EYEBROW}>
          Run by
        </h3>
        <ul className="mt-2 divide-y divide-white/[0.05]">
          {runners.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2.5">
              <EntityAvatar imageUrl={m.avatarUrl ?? null} name={m.displayName ?? m.username ?? "M"} seed={m.userId} size={32} />
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-primary">{m.displayName ?? m.username ?? "Member"}</span>
              <span className="shrink-0 text-caption capitalize text-tertiary">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-has" className="border-t border-white/[0.06] pt-5">
        <h3 id="about-has" className={EYEBROW}>
          In this community
        </h3>
        <ul className="mt-2 divide-y divide-white/[0.05]">
          {modules.map((m) => (
            <li key={m} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="text-body-sm font-medium text-primary">{MODULE_LABELS[m]}</span>
              <span className="min-w-0 truncate text-right text-caption text-tertiary">{MODULE_DESCRIPTIONS[m]}</span>
            </li>
          ))}
        </ul>
      </section>

      {group.tags.length > 0 && (
        <section aria-labelledby="about-tags" className="border-t border-white/[0.06] pt-5">
          <h3 id="about-tags" className={EYEBROW}>
            Tags
          </h3>
          <p className="mt-2 text-body-sm text-secondary">{group.tags.map((t) => `#${t}`).join("  ")}</p>
        </section>
      )}
    </div>
  );
}

const VISIBILITY_SHORT: Record<string, string> = { public: "Anyone", private: "By approval", hidden: "Invitation only" };
