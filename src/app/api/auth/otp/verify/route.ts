import { NextResponse } from "next/server";
import { verifyOtpAndLogin } from "@/services/auth.service";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request) {
  const { code } = await request.json();
  if (typeof code !== "string") {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  try {
    const result = await verifyOtpAndLogin(code);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
