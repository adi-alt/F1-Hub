// Tool Registry & Safe Execution Engine for AI Agents.
// Only registered, allowlisted tools can ever be executed by any agent.
// User-scoped tools strictly receive ctx.userId derived from the server session,
// NEVER accepting a target user ID from the model arguments.

import type { AITool, AgentContext } from "../types";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { computeSeasonStandings, getTrackHistory, buildSeasonRecap } from "@/lib/personalization";
import { getArchiveDriver } from "@/lib/supabase/archive";
import { supabaseAdmin } from "@/lib/supabase/admin";

const toolRegistry = new Map<string, AITool>();

export function registerTool(tool: AITool): void {
  toolRegistry.set(tool.name, tool);
}

export function getRegisteredTool(name: string): AITool | undefined {
  return toolRegistry.get(name);
}

export function getAllTools(): AITool[] {
  return Array.from(toolRegistry.values());
}

// ─── Registered Tools ──────────────────────────────────────────────────────────

// 1. getUpcomingRace
registerTool({
  name: "getUpcomingRace",
  description: "Get details for the next upcoming Formula 1 Grand Prix on the schedule.",
  parametersSchema: { type: "object", properties: {} },
  isUserScoped: false,
  execute: async () => {
    const year = new Date().getFullYear();
    const race = await getNextUpcomingRace(year);
    if (!race) return { upcomingRace: null };
    return {
      id: race.id,
      name: race.name,
      round: race.round,
      season: race.year,
      circuitId: race.circuit,
      circuitName: race.circuit,
      raceDate: race.raceDate,
      status: race.status,
    };
  },
});

// 2. getCurrentStandings
registerTool({
  name: "getCurrentStandings",
  description: "Get the latest calculated Drivers and Constructors championship standings for the current season.",
  parametersSchema: {
    type: "object",
    properties: {
      year: { type: "number", description: "Season year (defaults to current season)" },
    },
  },
  isUserScoped: false,
  execute: async (args) => {
    const year = typeof args.year === "number" ? args.year : 2026;
    const standings = await computeSeasonStandings(year);
    return {
      year,
      topDrivers: standings.drivers.slice(0, 5),
      topTeams: standings.teams.slice(0, 5),
    };
  },
});

// 3. getTrackHistory
registerTool({
  name: "getTrackHistory",
  description: "Get historical statistics, defending winner, and most successful driver for a specific circuit.",
  parametersSchema: {
    type: "object",
    properties: {
      circuitId: { type: "string", description: "Circuit ID (e.g. 'albert_park', 'monza')" },
    },
    required: ["circuitId"],
  },
  isUserScoped: false,
  execute: async (args) => {
    if (typeof args.circuitId !== "string") throw new Error("circuitId must be a string");
    const history = await getTrackHistory(args.circuitId);
    if (!history) return { trackHistory: null };
    return {
      circuitId: history.circuitId,
      totalRaces: history.totalRaces,
      topPerformer: history.topPerformer,
      defendingWinner: history.defendingWinner,
      topCurrentTeam: history.topCurrentTeam,
    };
  },
});

// 4. getDriverStats
registerTool({
  name: "getDriverStats",
  description: "Get career statistics for an individual Formula 1 driver.",
  parametersSchema: {
    type: "object",
    properties: {
      driverId: { type: "string", description: "Unique driver ID (e.g. 'verstappen', 'norris')" },
    },
    required: ["driverId"],
  },
  isUserScoped: false,
  execute: async (args) => {
    if (typeof args.driverId !== "string") throw new Error("driverId must be a string");
    const driver = await getArchiveDriver(args.driverId);
    if (!driver) return { driver: null };
    return {
      driverId: driver.driverId,
      name: driver.name,
      code: driver.code,
      raceCount: driver.raceCount,
      constructors: driver.constructors,
      firstYear: driver.firstYear,
      lastYear: driver.lastYear,
    };
  },
});

// 5. getUserPrediction (User-scoped: uses ctx.userId strictly)
registerTool({
  name: "getUserPrediction",
  description: "Get the current authenticated user's prediction pick for a specific race.",
  parametersSchema: {
    type: "object",
    properties: {
      raceId: { type: "string", description: "Race ID" },
    },
    required: ["raceId"],
  },
  isUserScoped: true,
  execute: async (args, ctx: AgentContext) => {
    if (!ctx.userId) return { error: "Unauthenticated" };
    if (typeof args.raceId !== "string") throw new Error("raceId must be a string");

    const { data } = await supabaseAdmin
      .from("picks")
      .select("predicted_winner_driver_id, predicted_podium_driver_ids, submitted_at")
      .eq("user_id", ctx.userId)
      .eq("race_id", args.raceId)
      .maybeSingle();

    return { pick: data || null };
  },
});

// 6. getSeasonSummary
registerTool({
  name: "getSeasonSummary",
  description: "Get editorial recap of the current season so far.",
  parametersSchema: {
    type: "object",
    properties: {
      year: { type: "number", description: "Season year" },
    },
  },
  isUserScoped: false,
  execute: async (args) => {
    const year = typeof args.year === "number" ? args.year : 2026;
    const [races, standings] = await Promise.all([
      getRacesByYear(year),
      computeSeasonStandings(year),
    ]);
    const recap = buildSeasonRecap(races, standings, null);
    return { recap };
  },
});
