import { redirect } from "next/navigation";

// Redirect shim - race detail now lives at the one unified /race?year=&race= route (Season and
// Archive both), regardless of which section originally linked here.
export default async function ArchiveRaceRedirect({ params }: { params: Promise<{ year: string; slug: string }> }) {
  const { year, slug } = await params;
  redirect(`/race?year=${year}&race=${slug}`);
}
