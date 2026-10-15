import type { User } from "@supabase/supabase-js";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** The one place the real iron-session cookie gets minted, used by both otp/verify (returning
 * user) and complete-signup (brand new one) - after this point Server Components can read who's
 * signed in without any further client round trip.
 *
 * `firstName`, when given, wins over whatever name an OAuth provider supplied — that's only ever
 * set for a Google/GitHub account (in user_metadata, not a top-level field the way Firebase's
 * DecodedIdToken had it), so it's null for every email/password account, which is most of them.
 * `firstName` is the profile's own field, collected at signup and always present, so it's the
 * reliable "what do we call this person" source. */
export async function createSessionFor(user: User, firstName?: string | null) {
  const role = await getUserRole(user.id);
  const session = await getSession();
  session.uid = user.id;
  session.email = user.email ?? null;
  session.displayName = firstName ?? (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? null;
  session.photoURL = (user.user_metadata?.avatar_url as string | undefined) ?? null;
  session.role = role;
  await session.save();
  await rememberProfilePhoto(user.id, session.photoURL);
  return role;
}

/** Keeps the member's profile photo current (profiles.avatar_url, 20261020_profile_avatar.sql), so their posts and
 * comments show it to everyone, not only to themselves. https only, and best effort: a failure here (or a database
 * that hasn't had that migration yet) never stops anyone signing in. */
async function rememberProfilePhoto(uid: string, photoURL: string | null) {
  if (!photoURL || !/^https:\/\//.test(photoURL)) return;
  try {
    const { error } = await supabaseAdmin.from("profiles").update({ avatar_url: photoURL }).eq("id", uid);
    if (error) console.error(`rememberProfilePhoto: ${error.message}`);
  } catch (err) {
    console.error("rememberProfilePhoto:", err);
  }
}
