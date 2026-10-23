// Per-person storage quota for post attachments (audit R-14). Per-file caps and the upload rate limit bound one
// request and a burst; this bounds the total, so one account can't fill the bucket a file at a time.

export const POST_MEDIA_QUOTA_BYTES = 100 * 1024 * 1024;

function megabytes(bytes: number): string {
  if (bytes > 0 && bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}

/** Null when `incoming` more bytes fit in the quota, else the message the upload is refused with. */
export function quotaError(usedBytes: number, incomingBytes: number, quota = POST_MEDIA_QUOTA_BYTES): string | null {
  if (usedBytes + incomingBytes <= quota) return null;
  const left = Math.max(0, quota - usedBytes);
  return `You've used ${megabytes(usedBytes)} of your ${megabytes(quota)} upload space, and this file needs ${megabytes(incomingBytes)}${left > 0 ? ` (${megabytes(left)} left)` : ""}. Try a smaller file, or post a link instead.`;
}
