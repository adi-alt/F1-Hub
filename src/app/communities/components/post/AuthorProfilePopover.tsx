"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { Badge } from "@/components/ui/Badge";
import { Popover } from "@/components/ui/Popover";
import { groupHref } from "@/lib/routes";
import type { AvatarConfig } from "@/lib/avatar";
import type { GroupRole } from "@/lib/supabase/groups";
import type { AuthorRecord } from "@/lib/supabase/postCalls";
import { CallRecordBadge } from "./CallChip";

export function AuthorProfilePopover({
  userId,
  authorName,
  authorAvatar,
  authorRole,
  authorRecord,
  groupId,
  groupName,
  children,
}: {
  userId: string;
  authorName: string;
  authorAvatar?: AvatarConfig | null;
  authorRole?: GroupRole | null;
  authorRecord?: AuthorRecord | null;
  groupId?: string | null;
  groupName?: string | null;
  children: (props: { ref: React.Ref<HTMLButtonElement>; toggle: () => void; open: boolean }) => ReactNode;
}) {
  return (
    <Popover
      align="start"
      ariaLabel={`About ${authorName}`}
      panelClassName="w-64 p-3.5"
      trigger={({ open, toggle, ref }) => children({ ref, toggle, open })}
    >
      {({ close }) => (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <PersonAvatar id={userId} avatar={authorAvatar ?? null} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-primary">{authorName}</p>
              {authorRole && authorRole !== "member" && (
                <div className="mt-0.5">
                  <Badge tone="neutral">{authorRole === "admin" ? "Admin" : "Moderator"}</Badge>
                </div>
              )}
            </div>
          </div>

          {authorRecord && (
            <div className="flex items-center gap-1.5 rounded-control border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
              <CallRecordBadge record={authorRecord} />
              <span className="text-caption text-secondary">Season call record</span>
            </div>
          )}

          {groupId && groupName && (
            <div className="border-t border-white/[0.06] pt-2.5">
              <span className="text-caption text-tertiary">Community</span>
              <p className="truncate text-body-sm font-medium text-secondary">
                <Link
                  href={groupHref(groupId)}
                  onClick={close}
                  className="rounded-control underline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {groupName}
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
