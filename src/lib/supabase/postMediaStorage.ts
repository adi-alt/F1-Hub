import { supabaseAdmin } from "@/lib/supabase/admin";

/** Every object this person holds in post-media (everything under their own `<uid>/` folder), a page at a time.
 * Used by the upload quota (audit R-14) and by account deletion, which removes them. */
export async function listPostMediaObjects(uid: string): Promise<{ name: string; size: number }[]> {
  const out: { name: string; size: number }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.storage.from("post-media").list(uid, { limit: 1000, offset });
    if (error) throw new Error(`listPostMediaObjects(${uid}): ${error.message}`);
    for (const o of data ?? []) out.push({ name: `${uid}/${o.name}`, size: Number((o.metadata as { size?: number } | null)?.size ?? 0) });
    if (!data || data.length < 1000) return out;
  }
}
