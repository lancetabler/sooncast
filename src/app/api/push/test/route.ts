import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { sendPush, pushReady } from "@/lib/push";
import { sendExpo } from "@/lib/expo-push";

// Sends a test push to every registered target for this user — web subscriptions AND native
// (Expo) tokens. Native delivery is independent of VAPID, so this must not be gated on it.
export async function POST() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const [subs, expoTokens] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { userId: user.id } }),
    prisma.expoPushToken.findMany({ where: { userId: user.id } }),
  ]);

  if (!subs.length && !expoTokens.length) {
    return bad("No device registered for push yet. Open the app and allow notifications first.", 400);
  }

  let web = 0;
  if (pushReady()) {
    for (const s of subs) {
      const status = await sendPush(s, { title: "Sooncast test 📡", body: "Background push is working.", tag: "sooncast-test" });
      if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else if (status >= 200 && status < 300) web++;
    }
  }

  const native = await sendExpo(expoTokens, {
    title: "Sooncast test 📡",
    body: "Notifications are working on this device.",
  });

  return ok({ sent: web + native, web, native, devices: { web: subs.length, native: expoTokens.length } });
}
