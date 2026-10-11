/** The caller's address: the first hop of x-forwarded-for (Vercel sets it and strips a client-supplied
 * one), else x-real-ip. "unknown" shares one bucket, which is the safe direction to fail. A separate
 * pure module so anything can use it without pulling in the database client. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
