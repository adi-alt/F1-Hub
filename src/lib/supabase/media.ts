import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Current roster only — see supabase/schema.sql's own comment on why these two tables exist
// separately from archive_drivers/archive_teams (no cross-season history to keep here, just
// "what does this driver/team look like right now"). *_url values are always a Supabase Storage
// url (see pipeline/fetch_races.py, fetch_team_logos.py) — this app never hotlinks F1's or
// Wikipedia's own hosting directly.
export type CurrentDriver = { code: string; name: string; team: string; headshotUrl: string | null };
export type CurrentTeam = { name: string; color: string | null; logoUrl: string | null };

const REVALIDATE_SECONDS = 300;

type DriverRow = { code: string; name: string; team: string; headshot_url: string | null };
type TeamRow = { name: string; color: string | null; logo_url: string | null };

function fromDriverRow(row: DriverRow): CurrentDriver {
  return { code: row.code, name: row.name, team: row.team, headshotUrl: row.headshot_url };
}

function fromTeamRow(row: TeamRow): CurrentTeam {
  return { name: row.name, color: row.color, logoUrl: row.logo_url };
}

// Both throw on a real query error rather than falling back to `[]` - a swallowed error here
// reads exactly like "no current drivers/teams" and would get cached as such for
// REVALIDATE_SECONDS, same failure mode as getRacesByYear's own (see its comment).
export const getAllCurrentDrivers = unstable_cache(
  async (): Promise<CurrentDriver[]> => {
    const { data, error } = await supabaseAdmin.from("drivers").select("*").order("name");
    if (error) throw new Error(`getAllCurrentDrivers: ${error.message}`);
    return ((data ?? []) as DriverRow[]).map(fromDriverRow);
  },
  ["get-all-current-drivers"],
  { revalidate: REVALIDATE_SECONDS, tags: ["media"] },
);

export const getAllCurrentTeams = unstable_cache(
  async (): Promise<CurrentTeam[]> => {
    const { data, error } = await supabaseAdmin.from("teams").select("*").order("name");
    if (error) throw new Error(`getAllCurrentTeams: ${error.message}`);
    return ((data ?? []) as TeamRow[]).map(fromTeamRow);
  },
  ["get-all-current-teams"],
  { revalidate: REVALIDATE_SECONDS, tags: ["media"] },
);

export const getCurrentDriver = unstable_cache(
  async (code: string): Promise<CurrentDriver | null> => {
    const { data } = await supabaseAdmin.from("drivers").select("*").eq("code", code).maybeSingle();
    return data ? fromDriverRow(data as DriverRow) : null;
  },
  ["get-current-driver"],
  { revalidate: REVALIDATE_SECONDS, tags: ["media"] },
);

export const getCurrentTeam = unstable_cache(
  async (name: string): Promise<CurrentTeam | null> => {
    const { data } = await supabaseAdmin.from("teams").select("*").eq("name", name).maybeSingle();
    return data ? fromTeamRow(data as TeamRow) : null;
  },
  ["get-current-team"],
  { revalidate: REVALIDATE_SECONDS, tags: ["media"] },
);
