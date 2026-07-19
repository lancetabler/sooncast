import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { serializeEvent } from "@/lib/serialize";

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  categoryId: z.string().nullable().optional(),
  start: z.string().datetime({ offset: true }).or(z.string().min(10)),
  allDay: z.boolean().optional(),
  durationMin: z.number().int().min(0).max(100000).optional(),
  freq: z.enum(["none", "daily", "weekly", "biweekly", "monthly"]).optional(),
  until: z.string().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  reminders: z.array(z.number().int().min(0).max(525600)).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid event");

  const d = parsed.data;
  const reminders = d.reminders ?? [];
  const created = await prisma.event.create({
    data: {
      userId: user.id,
      title: d.title,
      categoryId: d.categoryId ?? null,
      start: new Date(d.start),
      allDay: d.allDay ?? false,
      durationMin: d.durationMin ?? 120,
      freq: d.freq ?? "none",
      until: d.until ? new Date(d.until) : null,
      location: d.location ?? null,
      url: d.url ?? null,
      note: d.note ?? null,
      reminders: JSON.stringify(reminders),
    },
  });
  return ok(serializeEvent(created), 201);
}

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const events = await prisma.event.findMany({ where: { userId: user.id }, orderBy: { start: "asc" } });
  return ok(events.map(serializeEvent));
}
