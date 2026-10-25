/** A clean path's page props (/season/[year], /archive/drivers/[id], ...). */
export type SegmentProps<P> = { params: Promise<P>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The path's segments put back as the query keys the section's own page reads, so a clean path renders that page
 * unchanged: `/archive/drivers/hamilton` is the archive page with `driver=hamilton`. */
export async function segmentsAsQuery<P>({ params, searchParams }: SegmentProps<P>, toQuery: (params: P) => Record<string, string>) {
  return { ...(await searchParams), ...toQuery(await params) } as Record<string, string>;
}
