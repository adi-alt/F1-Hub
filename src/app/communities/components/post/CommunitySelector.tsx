"use client";

import { EntityMultiSelect, type MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import type { ComposerCommunity } from "../PostComposer";

const NO_COMMUNITY = "";

/** The composer's "Post to" field, reusing EntityMultiSelect (already the app's one searchable-
 * popover-with-avatars component - Archive's era/country filters use the exact same thing) rather
 * than a second custom dropdown implementation. "No community" is a real, always-first option,
 * not a placeholder - selecting it is what makes a post personal (see createPost's own null-
 * groupId handling), never assumed or defaulted silently. */
export function CommunitySelector({ groups, value, onChange }: { groups: ComposerCommunity[]; value: string; onChange: (groupId: string) => void }) {
  const options: MultiSelectOption[] = [
    { code: NO_COMMUNITY, label: "No community (personal post)" },
    ...groups.map((g) => ({ code: g.id, label: g.name, sublabel: g.description ?? undefined, logoUrl: g.avatarUrl })),
  ];

  return (
    <EntityMultiSelect
      multiple={false}
      options={options}
      selected={[value]}
      onChange={(codes) => onChange(codes[0] ?? NO_COMMUNITY)}
      placeholder="No community (personal post)"
      surfaceClassName="border border-white/10 bg-surface-1/60 backdrop-blur-md"
      // Matches the Post button's own height (32px / h-8) and corner radius (rounded-control)
      // exactly, so the composer's trailing row reads as one cohesive control group.
      triggerClassName="!h-8 !py-0 !rounded-control text-caption border-white/10"
    />
  );
}
