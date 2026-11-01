import { supabaseAdmin } from "@/lib/supabase/admin";

export const APEX_BOT_USER_ID = "00000000-0000-4000-8000-0000000000a1";
export const APEX_BOT_USERNAME = "apex";
export const APEX_BOT_DISPLAY_NAME = "Apex AI";

let ensured = false;

/**
 * Ensures the official Apex AI bot profile exists in the database.
 * Cached in memory so it only checks once per process lifetime.
 */
export async function ensureApexBotProfile(): Promise<void> {
  if (ensured) return;
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", APEX_BOT_USER_ID)
      .maybeSingle();

    if (!data) {
      await supabaseAdmin.from("profiles").upsert(
        {
          id: APEX_BOT_USER_ID,
          username: APEX_BOT_USERNAME,
          display_name: APEX_BOT_DISPLAY_NAME,
          bio: "F1 HUB's Official AI Discussion & Race Strategy Copilot",
          role: "admin",
        },
        { onConflict: "id" }
      );
    }
    ensured = true;
  } catch (err) {
    console.error("ensureApexBotProfile:", err);
  }
}

export function isApexBot(userId?: string | null): boolean {
  return userId === APEX_BOT_USER_ID;
}
