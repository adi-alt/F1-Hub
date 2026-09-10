"use client";

import { useState } from "react";
import { PinIcon } from "@/components/icons/HomeIcons";

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two lat/long points - the standard haversine formula, not an
 * approximation that only holds over short distances (these two points can be on opposite sides
 * of the planet). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type State = { kind: "idle" } | { kind: "loading" } | { kind: "denied" } | { kind: "done"; km: number };

/** A real, opt-in use of browser geolocation (unlike the hero's countdown, which reads the
 * browser's own timezone setting - no location permission needed or requested for that at all).
 * Never auto-requests permission on mount - only a real click asks, so the browser's own
 * permission prompt only ever appears in direct response to someone wanting this specific answer,
 * never as a surprise on page load. */
export function DistanceToCircuit({ circuitName, lat, long }: { circuitName: string; lat: number; long: number }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  function request() {
    setState({ kind: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ kind: "done", km: Math.round(haversineKm(pos.coords.latitude, pos.coords.longitude, lat, long)) }),
      () => setState({ kind: "denied" }),
      { timeout: 8000 },
    );
  }

  if (state.kind === "idle") {
    return (
      <button type="button" onClick={request} className="flex items-center gap-1 text-xs text-neutral-500 underline decoration-dotted underline-offset-2 transition hover:text-neutral-300">
        <PinIcon className="h-3.5 w-3.5" />
        How far is {circuitName} from you?
      </button>
    );
  }
  if (state.kind === "loading") return <p className="text-xs text-neutral-500">Finding your location…</p>;
  if (state.kind === "denied") return <p className="text-xs text-neutral-500">Couldn&apos;t get your location.</p>;
  return (
    <p className="flex items-center gap-1 text-xs text-neutral-400">
      <PinIcon className="h-3.5 w-3.5 text-[var(--f1-red)]" />
      {circuitName} is about {state.km.toLocaleString()} km from you.
    </p>
  );
}
