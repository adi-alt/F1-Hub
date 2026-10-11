import { NextResponse } from "next/server";
import { completeSignup } from "@/services/auth.service";
import { ServiceError, serviceErrorBody } from "@/services/errors";
import { signupSchema } from "@/lib/inputLimits";

export async function POST(request: Request) {
  // Types and size caps (SEC-25, see inputLimits.ts); the username's format and "first name is
  // required" stay completeSignup's own checks, with their own messages.
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.code === "too_big");
    return NextResponse.json({ error: tooLong ? "A name or username is too long." : "Missing required fields." }, { status: 400 });
  }

  try {
    const result = await completeSignup(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
