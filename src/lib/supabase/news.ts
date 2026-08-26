import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Polled from Formula1.com's own RSS feed (pipeline/fetch_news.py, every few hours) — that feed
// only ever exposes its latest ~10 items with no publish date, so this table is an ever-growing
// archive built forward from whenever ingestion started, not a backfilled history. `guid` (the
// feed's own permalink) is the primary key and the id this app routes on (?id=<guid>).
export type NewsItem = {
  guid: string;
  title: string;
  description: string | null;
  link: string;
  creator: string | null;
  fetchedAt: string;
};

const REVALIDATE_SECONDS = 300;

type NewsRow = {
  guid: string;
  title: string;
  description: string | null;
  link: string;
  creator: string | null;
  fetched_at: string;
};

function fromRow(row: NewsRow): NewsItem {
  return {
    guid: row.guid,
    title: row.title,
    description: row.description,
    link: row.link,
    creator: row.creator,
    fetchedAt: row.fetched_at,
  };
}

/** Most-recently-seen first — for both the public /news list and the season sidebar's title
 * widget (which just takes the first few). */
export const getLatestNews = unstable_cache(
  async (limit = 30): Promise<NewsItem[]> => {
    const { data } = await supabaseAdmin.from("news").select("*").order("fetched_at", { ascending: false }).limit(limit);
    return ((data ?? []) as NewsRow[]).map(fromRow);
  },
  ["get-latest-news"],
  { revalidate: REVALIDATE_SECONDS, tags: ["news"] },
);

export const getNewsByGuid = unstable_cache(
  async (guid: string): Promise<NewsItem | null> => {
    const { data } = await supabaseAdmin.from("news").select("*").eq("guid", guid).maybeSingle();
    return data ? fromRow(data as NewsRow) : null;
  },
  ["get-news-by-guid"],
  { revalidate: REVALIDATE_SECONDS, tags: ["news"] },
);
