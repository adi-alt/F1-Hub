import { NextResponse } from "next/server";
import { completeSignup } from "@/services/auth.service";
import { ServiceError } from "@/services/errors";

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : undefined;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { firstName, lastName, username, favoriteDrivers, favoriteTeams, favoriteTracks } = body;

  if (typeof firstName !== "string" || typeof lastName !== "string" || typeof username !== "string") {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const result = await completeSignup({
      firstName,
      lastName,
      username,
      favoriteDrivers: stringArray(favoriteDrivers),
      favoriteTeams: stringArray(favoriteTeams),
      favoriteTracks: stringArray(favoriteTracks),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
