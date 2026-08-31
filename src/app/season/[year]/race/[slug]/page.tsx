import { redirect } from "next/navigation";

// Redirect shim - race detail now lives at the one unified /race/<year>/<slug> route (Season and
// Archive both), regardless of which section originally linked here. Keeps any already-shared or
// bookmarked link from this route (it only existed for one prior round of this session) working.
export default async function SeasonRaceRedirect({ params }: { params: Promise<{ year: string; slug: string }> }) {
  const { year, slug } = await params;
  redirect(`/race/${year}/${slug}`);
}
