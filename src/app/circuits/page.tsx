import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircuitExplorerHeader } from "./components/CircuitExplorerHeader";
import { SeasonProgressStrip } from "./components/SeasonProgressStrip";
import { CircuitGrid } from "./components/CircuitGrid";
import { CircuitDetailPage } from "./components/CircuitDetailPage";
import { getCircuitDetailData, getCircuitsExplorerData } from "./services/circuits.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";

async function CircuitsIndex({ year, uid }: { year: number; uid: string }) {
  const { entries, completedCount, remainingCount } = await getCircuitsExplorerData(year, uid);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <CircuitExplorerHeader year={year} totalCircuits={entries.length} completedCount={completedCount} remainingCount={remainingCount} />
      <SeasonProgressStrip races={entries.map((e) => e.race)} />
      <CircuitGrid entries={entries} />
    </div>
  );
}

export const metadata: Metadata = {
  title: "Circuits",
  description: "Every circuit on the current F1 calendar — track intelligence, race history, and records.",
};

// The Circuits section stays query-param routed (?circuit=), the same convention Archive, Race and
// Season's own race window already use and document the reasoning for (lib/routes.ts) - a
// deliberate architectural choice this section joins rather than a path-segment hierarchy of its
// own, so the whole app keeps one routing convention instead of two.
export default async function CircuitsPage({
  searchParams,
}: {
  searchParams: Promise<{ circuit?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="circuit intelligence" />
      </div>
    );
  }

  const year = new Date().getFullYear();
  const { circuit } = await searchParams;

  if (!circuit) return <CircuitsIndex year={year} uid={session.uid} />;

  const data = await getCircuitDetailData(circuit, year, session.uid);
  if (!data) notFound();
  return <CircuitDetailPage location={circuit} data={data} />;
}
