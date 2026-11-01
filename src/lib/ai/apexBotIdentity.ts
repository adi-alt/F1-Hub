// Client-safe identity of the Apex AI bot. Deliberately free of any server import: client components
// (CommentTree, MentionAutocomplete) need these, and importing apexBot.ts from the browser would pull
// in supabaseAdmin, whose module-level secret check throws there and takes the whole page down.

export const APEX_BOT_USER_ID = "00000000-0000-4000-8000-0000000000a1";
export const APEX_BOT_USERNAME = "apex";
export const APEX_BOT_DISPLAY_NAME = "Apex AI";

export function isApexBot(userId?: string | null): boolean {
  return userId === APEX_BOT_USER_ID;
}

