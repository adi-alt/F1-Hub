import { defaultAvatar, type AvatarConfig } from "@/lib/avatar";
import { AvatarSvg } from "./AvatarSvg";

/** A person: their built avatar, or the helmet their id always gives them. Communities and teams use EntityAvatar. */
export function PersonAvatar({ id, avatar, size = 40 }: { id: string; avatar?: AvatarConfig | null; size?: number }) {
  return <AvatarSvg avatar={avatar ?? defaultAvatar(id)} size={size} />;
}
