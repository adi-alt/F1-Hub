"use client";

import { EntityMultiSelect, type MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import type { GroupSummary } from "@/lib/supabase/groups";

const NO_COMMUNITY = "";

/** The composer's "Post to" field, reusing EntityMultiSelect (already the app's one searchable-
 * popover-with-avatars component - Archive's era/country filters use the exact same thing) rather
 * than a second custom dropdown implementation. "No community" is a real, always-first option,
 * not a placeholder - selecting it is what makes a post personal (see createPost's own null-
 * groupId handling), never assumed or defaulted silently. */
export function CommunitySelector({ groups, value, onChange }: { groups: GroupSummary[]; value: string; onChange: (groupId: string) => void }) {
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
      surfaceClassName="border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 backdrop-blur-md"
    />
  );
}
