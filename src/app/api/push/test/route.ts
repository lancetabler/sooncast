import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { sendPush, pushReady } from "@/lib/push";

export async function POST() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  if (!pushReady()) return bad("Push isn't configured on the server (VAPID keys missing).", 503);

  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
  if (!subs.length) return bad("No push subscription on this device yet. Enable notifications first.", 400);

  let sent = 0;
  for (const s of subs) {
    const status = await sendPush(s, { title: "Radar test 📡", body: "Background push is working.", tag: "radar-test" });
    if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    else if (status >= 200 && status < 300) sent++;
  }
  return ok({ sent });
}
