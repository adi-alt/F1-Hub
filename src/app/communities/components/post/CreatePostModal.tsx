"use client";

import { Dialog } from "@/components/ui/Dialog";
import type { CallableRace } from "@/lib/supabase/postCalls";
import { PostComposer, type ComposerCommunity } from "../PostComposer";
import type { RaceOption } from "./PredictionComposer";

/**
 * The composer as a dialog (R-34/CR-25): the house Dialog (focus trap, Escape, focus return) around
 * the same PostComposer the feed shows inline, so the dialog has every tool the inline one has -
 * attachments, GIFs, emoji, scheduling, predictions and calls - and posts through the same path.
 */
export function CreatePostModal({
  open,
  community,
  upcomingRaces,
  callableRace,
  onClose,
  onPosted,
  moderationNotice,
}: {
  open: boolean;
  community: ComposerCommunity;
  upcomingRaces?: RaceOption[];
  callableRace?: CallableRace | null;
  onClose: () => void;
  onPosted: () => void;
  /** Shown when this user's posts will land in the approval queue. */
  moderationNotice?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Create a post" description={`in ${community.name}`} size="lg">
      <PostComposer
        framed={false}
        groups={[community]}
        fixedGroupId={community.id}
        placeholder={`Share your thoughts with ${community.name}...`}
        upcomingRaces={upcomingRaces}
        callableRace={callableRace}
        onPosted={() => {
          onPosted();
          onClose();
        }}
      />
      {moderationNotice && <p className="mt-3 text-caption text-warning">This community reviews posts before they appear.</p>}
    </Dialog>
  );
}
