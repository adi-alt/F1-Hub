import { notFound } from "next/navigation";
import { CircuitGrid } from "./components/CircuitGrid";
import { CircuitTrendChart } from "./components/CircuitTrendChart";
import { PastWinnersList } from "./components/PastWinnersList";
import { getCircuitDetailData, getCircuitsIndexData } from "./services/circuits.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { raceTitle } from "@/lib/format";
import { getSession } from "@/lib/session/getSession";

async function CircuitsIndex() {
  const year = new Date().getFullYear();
  const { races } = await getCircuitsIndexData(year);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Circuits</h1>
      <p className="mt-1 text-sm text-neutral-500">{year} calendar — track history across seasons</p>
      <CircuitGrid races={races} />
    </div>
  );
}

async function CircuitDetail({ circuit }: { circuit: string }) {
  const data = await getCircuitDetailData(circuit);
  if (!data) notFound();
  const { completed, trend, avgPole } = data;

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
