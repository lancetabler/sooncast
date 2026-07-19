import "server-only";
import { prisma } from "@/lib/prisma";

export type CronJobName = "reminders" | "sync-sources" | "digest";

/** Shared auth for cron endpoints: header, bearer, or ?secret=. Open when CRON_SECRET is unset (local dev). */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  return (
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}` ||
    url.searchParams.get("secret") === secret
  );
}

/** Record that a cron job just ran (best-effort; never throws). */
export async function recordCronRun(name: CronJobName): Promise<void> {
  await prisma.cronRun
    .upsert({ where: { name }, create: { name, at: new Date() }, update: { at: new Date() } })
    .catch(() => {});
}
