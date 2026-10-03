import { revalidateTag } from "next/cache";

/**
 * Expires every cached entry carrying `tag` immediately, so the next read is fresh (audit R-19).
 *
 * Not revalidateTag(tag, "max"): in Next 16 that is stale-while-revalidate - the next read still
 * gets the OLD value, while a fresh one is fetched in the background. That broke read-your-writes
 * after a user's own change (a router.refresh() after joining a community, a new account's first
 * profile read), and showed a pipeline push as stale to the first visitor after it. Every cached
 * read here is a Postgres query, so a blocking re-read on the next request is cheap.
 *
 * Route handlers and server code only: updateTag() would do the same but throws outside a Server
 * Action, and this app's writes are route handlers.
 */
export function expireTag(tag: string): void {
  revalidateTag(tag, { expire: 0 });
}
