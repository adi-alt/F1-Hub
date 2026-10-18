/** The glyph on each of the create flow's selection cards, one per community type and visibility. */

import { EyeOff, Flag, Globe, Lock, MessagesSquare, Trophy, Users, type LucideIcon } from "lucide-react";
import type { CommunityType, CommunityVisibility } from "@/lib/communities";

export const TYPE_ICONS: Record<CommunityType, LucideIcon> = {
  general: MessagesSquare,
  f1: Flag,
  prediction_league: Trophy,
  private_circle: Users,
};

export const VISIBILITY_ICONS: Record<CommunityVisibility, LucideIcon> = {
  public: Globe,
  private: Lock,
  hidden: EyeOff,
};
