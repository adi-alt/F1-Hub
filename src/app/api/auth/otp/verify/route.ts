import { NextResponse } from "next/server";
import { verifyOtpAndLogin } from "@/services/auth.service";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request) {
  const { idToken, code } = await request.json();
  if (typeof idToken !== "string" || typeof code !== "string") {
    return NextResponse.json({ error: "Missing idToken or code" }, { status: 400 });
  }

  try {
    const result = await verifyOtpAndLogin(idToken, code);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
