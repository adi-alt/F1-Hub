import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "./config";

/** Read-only in Server Components (cookies() can't be mutated there); read+write in Route Handlers. */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
