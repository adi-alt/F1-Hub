import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { ensureUserDoc } from "@/lib/firestore/users";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";

/**
 * Bridges Firebase's client-only auth into a server-readable session: the client posts its
 * Firebase ID token here right after sign-in, we verify it server-side and mint an encrypted
 * iron-session cookie, so Server Components can know who's signed in without any client fetch.
 */
export async function POST(request: Request) {
  const { idToken } = await request.json();
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  await ensureUserDoc(decoded.uid, decoded.email ?? null, decoded.name ?? null);
  const role = await getUserRole(decoded.uid);

  const session = await getSession();
  session.uid = decoded.uid;
  session.email = decoded.email ?? null;
  session.displayName = decoded.name ?? null;
  session.photoURL = decoded.picture ?? null;
  session.role = role;
  await session.save();

  return NextResponse.json({ ok: true, role });
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
