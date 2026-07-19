import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { limitsFor, effectivePlan } from "@/lib/domain/plan";

const schema = z.object({
  displayName: z.string().max(60).nullable().optional(),
  timezone: z.string().max(64).optional(),
  defaultReminders: z.array(z.number().int().min(0).max(525600)).optional(),
  quietStart: z.number().int().min(0).max(1439).nullable().optional(),
  quietEnd: z.number().int().min(0).max(1439).nullable().optional(),
});

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid settings");
  const d = parsed.data;
  const limits = limitsFor(effectivePlan(user.plan, user.role));

  if ((d.quietStart != null || d.quietEnd != null) && !limits.quietHours) {
    return bad("Quiet hours is a Pro feature.", 402);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(d.displayName !== undefined ? { displayName: d.displayName } : {}),
      ...(d.timezone !== undefined ? { timezone: d.timezone } : {}),
      ...(d.defaultReminders !== undefined
        ? { defaultReminders: JSON.stringify(d.defaultReminders.slice(0, limits.maxRemindersPerEvent)) }
        : {}),
      ...(d.quietStart !== undefined ? { quietStart: d.quietStart } : {}),
      ...(d.quietEnd !== undefined ? { quietEnd: d.quietEnd } : {}),
    },
  });
  return ok({ ok: true });
}
