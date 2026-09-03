// A pure, dependency-free module - the same reason sessionCode.ts exists on its own (see that
// file's own comment). groupPredictions.ts (the real service, server-only) imports groups.ts for
// its requireMember/requireAdmin checks, which imports otp.ts for its SMTP transporter, which
// imports nodemailer - a Node-only package (`tls`/`net`) that crashes the client bundle the instant
// it's pulled in. Confirmed live: `next build` failed on exactly this chain the first time
// GroupPredictions.tsx imported `predictionTypeLabels` (a real runtime value, not an erased type)
// straight from groupPredictions.ts. Everything a client component actually needs - the types and
// this one small label map - lives here instead, imported by both sides.

export type PredictionType = "winner" | "podium" | "fastest_lap" | "pole" | "dnf_count";
export type PredictionStatus = "open" | "locked" | "resolved";

// winner/fastest_lap/pole guess = a driver code; podium = a 3-driver array; dnf_count = a number.
export type PredictionGuess = string | [string, string, string] | number;

export type GroupPrediction = {
  id: string;
  groupId: string;
  raceId: string;
  raceName: string;
  type: PredictionType;
  entryPoints: number;
  status: PredictionStatus;
  correctAnswer: PredictionGuess | null;
  createdAt: string;
  resolvedAt: string | null;
  entryCount: number;
  myEntry: { guess: PredictionGuess; pointsWagered: number; pointsAwarded: number | null } | null;
};

export const predictionTypeLabels: Record<PredictionType, string> = {
  winner: "Race winner",
  podium: "Podium",
  fastest_lap: "Fastest lap",
  pole: "Pole position",
  dnf_count: "Number of DNFs",
};
