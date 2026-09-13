import { redirect } from "next/navigation";

// Redirect shim - the canonical race route is the query-parameterized /race?year=&race=, not path
// segments. Keeps any already-shared or bookmarked /race/<year>/<slug> link working.
export default async function RacePathRedirect({ params }: { params: Promise<{ year: string; slug: string }> }) {
  const { year, slug } = await params;
  redirect(`/race?year=${year}&race=${slug}`);
}
