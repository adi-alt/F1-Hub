import RacePage, { generateMetadata as raceMetadata } from "@/app/race/page";
import { segmentsAsQuery, type SegmentProps } from "@/lib/routeSegments";

type Props = SegmentProps<{ year: string; race: string }>;
const toQuery = (p: { year: string; race: string }) => ({ year: p.year, race: p.race });

export async function generateMetadata(props: Props) {
  return raceMetadata({ searchParams: segmentsAsQuery(props, toQuery) });
}

export default async function Page(props: Props) {
  return RacePage({ searchParams: segmentsAsQuery(props, toQuery) });
}
