import { NextResponse } from "next/server";
import { limitRequest } from "@/lib/rateLimit";
import { isUsernameTaken, suggestUsernames } from "@/lib/supabase/users";

export async function GET(request: Request) {
  // Public, and up to 20 queries a call (audit SEC-20): limited by IP.
  const limited = await limitRequest(request, "usernameCheck");
  if (limited) return limited;
  const username = new URL(request.url).searchParams.get("u")?.trim() ?? "";
  if (username.length < 3) return NextResponse.json({ available: false });

  const taken = await isUsernameTaken(username);
  if (!taken) return NextResponse.json({ available: true });

  const suggestions = await suggestUsernames(username);
  return NextResponse.json({ available: false, suggestions });
}
