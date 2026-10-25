"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import type { AvatarConfig } from "@/lib/avatar";
import { compactCount } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

export type ProfileIdentityData = {
  uid: string;
  name: string;
  username: string | null;
  avatar: AvatarConfig | null;
  memberSince: string | null;
  points: number | null;
  season: number;
  stats: { label: string; value: string }[];
};

/**
 * The account's masthead, on every tab: a large avatar, name and handle, member since, the points balance and a
 * strip of this season's figures, on one glass panel. The avatar reads the live copy from AuthProvider, so it
 * changes the moment the avatar editor saves.
 */
export function ProfileIdentity({ data }: { data: ProfileIdentityData }) {
  const { avatar } = useAuth();
  const since = data.memberSince ? new Date(data.memberSince).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : null;
  return (
    <section aria-label="Your profile" className={`p-5 sm:p-6 ${PANEL}`}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="shrink-0 rounded-full ring-1 ring-white/[0.08]">
          <PersonAvatar id={data.uid} avatar={avatar ?? data.avatar} size={88} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={EYEBROW}>Account</p>
          <h1 className="mt-1 truncate text-display-md font-semibold text-primary">{data.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-secondary">
            {data.username && <span>@{data.username}</span>}
            {since && <span className="text-tertiary">Member since {since}</span>}
          </p>
        </div>
        {data.points !== null && (
          <div className="shrink-0 sm:text-right">
            <p className="text-caption text-tertiary">Points balance</p>
            <p className="mt-0.5 text-title-lg font-semibold tabular text-primary">{compactCount(data.points)}</p>
          </div>
        )}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/[0.06] pt-5 sm:grid-cols-4">
        {data.stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-caption text-tertiary">{s.label}</dt>
            <dd className="mt-0.5 text-title-md tabular text-primary">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
