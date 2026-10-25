import ArchivePage, { generateMetadata as archiveMetadata } from "@/app/archive/page";
import { segmentsAsQuery, type SegmentProps } from "@/lib/routeSegments";

export const maxDuration = 60;

type Props = SegmentProps<{ year: string }>;
const toQuery = (p: { year: string }) => ({ year: p.year });

export async function generateMetadata(props: Props) {
  return archiveMetadata({ searchParams: segmentsAsQuery(props, toQuery) });
}

export default async function Page(props: Props) {
  return ArchivePage({ searchParams: segmentsAsQuery(props, toQuery) });
}
