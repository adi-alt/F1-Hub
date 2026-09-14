import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircuitDetailPage } from "../components/CircuitDetailPage";
import { getCircuitDetailData, resolveCircuitSlug } from "../services/circuits.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";

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
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="circuit intelligence" />
      </div>
    );
  }

  const { circuit } = await params;
  const year = new Date().getFullYear();

  // The URL only ever carries a lowercased slug - resolveCircuitSlug recovers the real,
  // original-cased circuit string (e.g. "Spa-Francorchamps") every live-data lookup below
  // actually needs. See its own doc comment for why a plain `replace(/-/g, " ")` silently broke
  // every circuit's live-season data (Track Map simulation, Pole Evolution, this year's result).
  const locationName = await resolveCircuitSlug(circuit, year, session.uid);

  const data = await getCircuitDetailData(locationName, year, session.uid);
  if (!data) notFound();

  return <CircuitDetailPage location={locationName} data={data} />;
}
