import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircuitDetailPage } from "../components/CircuitDetailPage";
import { getCircuitDetailData, resolveCircuitSlug } from "../services/circuits.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { getCurrentSeason } from "@/lib/currentSeason";

type Props = {
  params: Promise<{ circuit: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { circuit } = await params;
  return {
    title: `Circuit: ${circuit}`,
    description: `Track intelligence, race history, and records for ${circuit}.`,
  };
}

export default async function CircuitRoute({ params }: Props) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-content py-10">
        <SignInGate label="circuit intelligence" />
      </div>
    );
  }

  const { circuit } = await params;
  const year = await getCurrentSeason(); // from the calendar, not the clock (R-22)

  // The URL only ever carries a lowercased slug - resolveCircuitSlug recovers the real,
  // original-cased circuit string (e.g. "Spa-Francorchamps") every live-data lookup below
  // actually needs. See its own doc comment for why a plain `replace(/-/g, " ")` silently broke
  // every circuit's live-season data (Track Map simulation, Pole Evolution, this year's result).
  const locationName = await resolveCircuitSlug(circuit, year, session.uid);

  const data = await getCircuitDetailData(locationName, year, session.uid);
  if (!data) notFound();

  return <CircuitDetailPage location={locationName} data={data} />;
}
