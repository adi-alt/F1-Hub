"use client";

import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";

/**
 * Circuits' contribution to the ONE global Ask Apex - same placement, same panel, same
 * interaction model as every other page (SeasonApexScope, HomepageApexScope). Only the scope
 * changes: a location, a year, and this circuit's own state, all safe UI selection state - never
 * a client-computed statistic. The server resolves those ids against authoritative data
 * (buildCircuitGroundingContext in the ask-apex route) before any of it reaches a prompt.
 */
export function CircuitApexScope({
  location,
  circuitName,
  year,
  status,
}: {
  location: string;
  circuitName: string;
  year: number;
  status: "completed" | "next" | "upcoming" | null;
}) {
  const suggestions: string[] = [];
  if (status === "completed") {
    suggestions.push("What decided this race?", "What was the biggest surprise?");
  } else if (status === "next" || status === "upcoming") {
    suggestions.push("What makes this circuit difficult?", "Who historically performs well here?");
  } else {
    suggestions.push("Why does this circuit matter?", "What makes this track unique?");
  }
  suggestions.push("Explain this circuit in 30 seconds");

  useRegisterApexScope({
    key: `circuit:${location.toLowerCase()}:${year}:${status ?? "unscheduled"}`,
    label: circuitName,
    sublabel: status === "completed" ? "This season's race" : status ? "Upcoming race" : "Circuit history",
    context: {
      page: "circuit",
      snapshot: { location, year, status },
    },
    suggestions: suggestions.slice(0, 4),
  });

  return null;
}
