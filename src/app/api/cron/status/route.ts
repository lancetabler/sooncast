import { requireUser, isResponse, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { pushReady } from "@/lib/push";

export const dynamic = "force-dynamic";

const JOBS = [
  { name: "reminders", label: "Reminders & score alerts", recommended: "Every 1–2 min", path: "/api/cron/reminders" },
  { name: "sync-sources", label: "Auto-sync schedules", recommended: "Once a day", path: "/api/cron/sync-sources" },
  { name: "digest", label: "Morning digest", recommended: "Once a day (morning)", path: "/api/cron/digest" },
] as const;

// Owner-only view of the automation pingers: their URLs and when each last ran.
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const runs = await prisma.cronRun.findMany();
  const lastByName = new Map(runs.map((r) => [r.name, r.at.toISOString()]));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const secret = process.env.CRON_SECRET || "";

  const jobs = JOBS.map((j) => ({
    name: j.name,
    label: j.label,
    recommended: j.recommended,
    lastRun: lastByName.get(j.name) ?? null,
    url: appUrl ? `${appUrl}${j.path}${secret ? `?secret=${secret}` : ""}` : null,
  }));

  return ok({ appUrl, hasSecret: !!secret, push: pushReady(), jobs });
}
