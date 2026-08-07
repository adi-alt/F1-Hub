import { notFound } from "next/navigation";
import { CircuitGrid } from "@/components/CircuitGrid";
import { CircuitTrendChart } from "@/components/charts/CircuitTrendChart";
import { PastWinnersList } from "@/components/circuit/PastWinnersList";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRacesByCircuit, getRacesByYear } from "@/lib/firestore/races";
import { raceTitle } from "@/lib/format";
import { getSession } from "@/lib/session/getSession";

async function CircuitsIndex() {
  const year = new Date().getFullYear();
  const races = await getRacesByYear(year);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Circuits</h1>
      <p className="mt-1 text-sm text-neutral-500">{year} calendar — track history across seasons</p>
      <CircuitGrid races={races} />
    </div>
  );
}

async function CircuitDetail({ circuit }: { circuit: string }) {
  const races = await getRacesByCircuit(circuit);
  if (races.length === 0) notFound();

  const completed = races.filter((r) => r.status === "completed" && r.poleTimeSec !== undefined);
  const trend = completed
    .map((r) => ({ year: r.year, poleTimeSec: r.poleTimeSec as number }))
    .sort((a, b) => a.year - b.year);
  const avgPole = trend.length ? trend.reduce((sum, d) => sum + d.poleTimeSec, 0) / trend.length : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">{raceTitle(circuit)}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {completed.length} race{completed.length === 1 ? "" : "s"} on record
        {avgPole !== null ? ` · average pole time ${avgPole.toFixed(3)}s` : ""}
      </p>

      {trend.length >= 2 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-white">Pole time by year</h2>
          <CircuitTrendChart data={trend} />
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Past winners</h2>
        <PastWinnersList races={completed} />
      </div>
    </div>
  );
}

export default async function CircuitsPage({
  searchParams,
}: {
  searchParams: Promise<{ circuit?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="circuit history" />
      </div>
    );
  }

  const { circuit } = await searchParams;
  return circuit ? <CircuitDetail circuit={circuit} /> : <CircuitsIndex />;
}
