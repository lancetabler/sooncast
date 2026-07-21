import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "sooncast_session";
// Fail closed: never sign real sessions with a public default in production.
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET must be set in production — refusing to run with an insecure signing key.");
}
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-insecure-secret-change-me");
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  // Also returned so native clients (which can't use the httpOnly cookie) can store the JWT
  // and send it as a Bearer token.
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getUserId(): Promise<string | null> {
  const jar = await cookies();
  // Web sends the httpOnly session cookie; native apps send the same JWT as `Authorization: Bearer`.
  let token = jar.get(COOKIE)?.value;
  if (!token) {
    const auth = (await headers()).get("authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  }
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}

/** Current user or null. Excludes passwordHash. */
export async function getCurrentUser() {
  const id = await getUserId();
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, displayName: true, timezone: true,
      feedToken: true, quietStart: true, quietEnd: true, defaultReminders: true, createdAt: true,
    },
  });
  return user;
}

export type SafeUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
