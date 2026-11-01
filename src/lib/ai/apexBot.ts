import { supabaseAdmin } from "@/lib/supabase/admin";
import { APEX_BOT_DISPLAY_NAME, APEX_BOT_USER_ID, APEX_BOT_USERNAME } from "./apexBotIdentity";

// Server-only (supabaseAdmin). Client components must import from ./apexBotIdentity instead.
export { APEX_BOT_DISPLAY_NAME, APEX_BOT_USER_ID, APEX_BOT_USERNAME, isApexBot } from "./apexBotIdentity";

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

