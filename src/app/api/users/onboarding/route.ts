import { NextResponse } from "next/server";
import { markOnboardingComplete, resetOnboarding } from "@/lib/supabase/users";
import { getSession } from "@/lib/session/getSession";

/**
 * Records how the product tour ended, or clears it so it can be replayed.
 *
 * Both "completed" and "skipped" stop the tour being shown automatically - they differ only in
 * what actually happened, which is worth keeping straight rather than flattening into one flag.
 * An unrecognised outcome is treated as "completed" rather than rejected: the tour is already over
 * for that person either way, and failing the request would mean showing it to them again.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { outcome?: unknown } | null;
  const outcome = body?.outcome === "skipped" ? "skipped" : "completed";
  await markOnboardingComplete(session.uid, outcome);
  return NextResponse.json({ ok: true, outcome });
}

/** "Replay F1 Hub tour" - clears the stamp only, never any other profile data. */
export async function DELETE() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await resetOnboarding(session.uid);
  return NextResponse.json({ ok: true });
}
