import Link from "next/link";
import { notFound } from "next/navigation";
import { SimulationPanel } from "@/components/race/SimulationPanel";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRace } from "@/lib/supabase/races";
import { raceHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

export default async function RaceSimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; round?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="the race simulator" />
      </div>
    );
  }

  const { year, round } = await searchParams;
  if (!year || !round) notFound();

  const race = await getRace(Number(year), Number(round));
  if (!race) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={raceHref(race.year, race.round)} className="text-sm text-neutral-500 hover:text-neutral-300">
        ← {race.name}
      </Link>
      <div className="mt-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">
          Round {race.round} · Race Simulator
        </p>
        <h1 className="text-3xl font-bold text-white">{race.name}</h1>
      </div>

      <div className="mt-8">
        {race.simulation ? (
          <SimulationPanel simulation={race.simulation} />
        ) : (
          <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-8 text-center text-neutral-400">
            <p>No simulation available for this race yet.</p>
            <p className="mt-1 text-sm text-neutral-500">
              This needs qualifying data and enough prior-race history — it fills in automatically once
              both exist.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
