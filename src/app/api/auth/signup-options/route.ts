import { NextResponse } from "next/server";
import { getCurrentEntrants, getRacesByYear } from "@/lib/supabase/races";

/** Public (no session needed — this is shown on the signup form before anyone's authenticated
 * yet). Same current-grid derivation the personalization page uses, so a new signer-upper picks
 * from the same real, always-current list rather than a hardcoded roster. */
export async function GET() {
  const year = new Date().getFullYear();
  const [entrants, races] = await Promise.all([getCurrentEntrants(year), getRacesByYear(year)]);

  const drivers = entrants.map((e) => ({ code: e.driver, name: e.driverName, team: e.team }));
  const teams = [...new Set(entrants.map((e) => e.team))].sort();
  const tracks = [...new Set(races.map((r) => r.circuit))].sort();

  return NextResponse.json({ drivers, teams, tracks });
}
