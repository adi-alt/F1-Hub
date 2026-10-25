import ProfilePage, { generateMetadata as profileMetadata } from "@/app/profile/page";
import { segmentsAsQuery, type SegmentProps } from "@/lib/routeSegments";

type Props = SegmentProps<{ tab: string }>;
const toQuery = (p: { tab: string }) => ({ tab: p.tab });

export async function generateMetadata(props: Props) {
  return profileMetadata({ searchParams: segmentsAsQuery(props, toQuery) });
}

export default async function Page(props: Props) {
  return ProfilePage({ searchParams: segmentsAsQuery(props, toQuery) });
}
