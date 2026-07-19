import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { serializeEvent } from "@/lib/serialize";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  categoryId: z.string().nullable().optional(),
  start: z.string().min(10).optional(),
  allDay: z.boolean().optional(),
  durationMin: z.number().int().min(0).max(100000).optional(),
  freq: z.enum(["none", "daily", "weekly", "biweekly", "monthly"]).optional(),
  until: z.string().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  reminders: z.array(z.number().int().min(0).max(525600)).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  countUp: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const existing = await prisma.event.findFirst({ where: { id, userId: user.id } });
  if (!existing) return bad("Event not found", 404);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid update");
  const d = parsed.data;

  const updated = await prisma.event.update({
    where: { id },
    data: {
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.categoryId !== undefined ? { categoryId: d.categoryId } : {}),
      ...(d.start !== undefined ? { start: new Date(d.start) } : {}),
      ...(d.allDay !== undefined ? { allDay: d.allDay } : {}),
      ...(d.durationMin !== undefined ? { durationMin: d.durationMin } : {}),
      ...(d.freq !== undefined ? { freq: d.freq } : {}),
      ...(d.until !== undefined ? { until: d.until ? new Date(d.until) : null } : {}),
      ...(d.location !== undefined ? { location: d.location } : {}),
      ...(d.url !== undefined ? { url: d.url } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
      ...(d.reminders !== undefined ? { reminders: JSON.stringify(d.reminders) } : {}),
      ...(d.tags !== undefined ? { tags: JSON.stringify(d.tags) } : {}),
      ...(d.countUp !== undefined ? { countUp: d.countUp } : {}),
    },
  });
  return ok(serializeEvent(updated));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const existing = await prisma.event.findFirst({ where: { id, userId: user.id } });
  if (!existing) return bad("Event not found", 404);
  await prisma.event.delete({ where: { id } });
  return ok({ ok: true });
}
