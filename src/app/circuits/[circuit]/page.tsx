import CircuitsPage, { generateMetadata as circuitsMetadata } from "@/app/circuits/page";
import { segmentsAsQuery, type SegmentProps } from "@/lib/routeSegments";

type Props = SegmentProps<{ circuit: string }>;
const toQuery = (p: { circuit: string }) => ({ circuit: p.circuit });

export async function generateMetadata(props: Props) {
  return circuitsMetadata({ searchParams: segmentsAsQuery(props, toQuery) });
}

export default async function Page(props: Props) {
  return CircuitsPage({ searchParams: segmentsAsQuery(props, toQuery) });
}
