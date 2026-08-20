import Image from "next/image";

/** Same fallback convention as ProfileMenu.tsx's own avatar (a first-letter badge when there's no
 * image) — `unoptimized` because a Supabase Storage public URL doesn't need Next's own image
 * optimizer, same reasoning ProfileMenu.tsx already applies to OAuth-provider avatars. */
export function GroupAvatar({ avatarUrl, name, size = 40 }: { avatarUrl: string | null; name: string; size?: number }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--f1-red)]/20 font-semibold text-[var(--f1-red)]"
      style={{ width: size, height: size, fontSize: size / 2.2 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
