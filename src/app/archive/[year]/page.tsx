import { redirect } from "next/navigation";

// Redirect shim - the canonical year route is the query-parameterized /archive?year=<year>, not a
// path segment (archive is a browsing page over query params, not a resource hierarchy). Keeps
// any already-shared or bookmarked /archive/<year> link working.
export default async function ArchiveYearPathRedirect({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  redirect(`/archive?year=${year}`);
}
