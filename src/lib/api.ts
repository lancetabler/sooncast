import { NextResponse } from "next/server";
import { getCurrentUser, type SafeUser } from "@/lib/auth";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}
export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Returns the user, or a NextResponse 401 to return early. */
export async function requireUser(): Promise<SafeUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return bad("Not signed in", 401);
  return user;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
