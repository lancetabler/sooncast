import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "radar_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-insecure-secret-change-me");
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
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
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
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
      id: true, email: true, displayName: true, role: true, plan: true, timezone: true,
      feedToken: true, quietStart: true, quietEnd: true, defaultReminders: true, createdAt: true,
    },
  });
  return user;
}

export type SafeUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
