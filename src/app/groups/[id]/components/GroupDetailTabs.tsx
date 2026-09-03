"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { GroupFeed } from "./GroupFeed";
import { GroupLeaderboardTab } from "./GroupLeaderboardTab";
import { GroupMembersTab } from "./GroupMembersTab";
import { GroupPredictions } from "./GroupPredictions";
import { GroupSettingsTab } from "./GroupSettingsTab";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupDetail, LeaderboardRow } from "@/lib/supabase/groups";

type Tab = "feed" | "predictions" | "leaderboard" | "members" | "settings";

/** One horizontal tab strip, not a separate giant card per section (the request's own explicit
 * ask) - every tab's data was already fetched once, server-side, in page.tsx; switching tabs here
 * is a pure client-side render swap, no new request. */
export function GroupDetailTabs({
  group,
  myUserId,
  leaderboard,
  posts,
  predictions,
  races,
  driversByRace,
  pointsBalance,
}: {
  group: GroupDetail;
  myUserId: string;
  leaderboard: LeaderboardRow[];
  posts: GroupPost[];
  predictions: GroupPrediction[];
  races: { id: string; name: string; round: number; status: string }[];
  driversByRace: Record<string, { code: string; name: string }[]>;
  pointsBalance: number;
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const isAdmin = group.myRole === "admin";

  const options: { value: Tab; label: string }[] = [
    { value: "feed", label: "Feed" },
    { value: "predictions", label: "Predictions" },
    { value: "leaderboard", label: "Leaderboard" },
    { value: "members", label: "Members" },
    ...(isAdmin ? [{ value: "settings" as const, label: "Settings" }] : []),
  ];

  return (
    <div>
      <div className="overflow-x-auto">
        <QuietTabs options={options} value={tab} onChange={setTab} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-6">
          {tab === "feed" && <GroupFeed groupId={group.id} initialPosts={posts} myRole={group.myRole} moderationEnabled={group.moderationEnabled} />}
          {tab === "predictions" && (
            <GroupPredictions groupId={group.id} myRole={group.myRole} predictions={predictions} races={races} driversByRace={driversByRace} pointsBalance={pointsBalance} />
          )}
          {tab === "leaderboard" && <GroupLeaderboardTab rows={leaderboard} myUserId={myUserId} />}
          {tab === "members" && <GroupMembersTab groupId={group.id} members={group.members} myRole={group.myRole} myUserId={myUserId} />}
          {tab === "settings" && isAdmin && <GroupSettingsTab group={group} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
