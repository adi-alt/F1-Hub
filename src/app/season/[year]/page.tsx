import SeasonPage from "@/app/season/page";
import { segmentsAsQuery, type SegmentProps } from "@/lib/routeSegments";

type Props = SegmentProps<{ year: string }>;
const toQuery = (p: { year: string }) => ({ year: p.year });

export default async function Page(props: Props) {
  return SeasonPage({ searchParams: segmentsAsQuery(props, toQuery) });
}
