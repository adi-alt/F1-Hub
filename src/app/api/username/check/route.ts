import { NextResponse } from "next/server";
import { isUsernameTaken, suggestUsernames } from "@/lib/supabase/users";

export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("u")?.trim() ?? "";
  if (username.length < 3) return NextResponse.json({ available: false });

  const taken = await isUsernameTaken(username);
  if (!taken) return NextResponse.json({ available: true });

  const suggestions = await suggestUsernames(username);
  return NextResponse.json({ available: false, suggestions });
}
