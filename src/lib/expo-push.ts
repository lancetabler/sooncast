import "server-only";
import { prisma } from "@/lib/prisma";

interface StoredToken {
  token: string;
}

/**
 * Deliver one notification to a set of Expo push tokens via Expo's push service (which relays to
 * APNs/FCM — no server-side APNs cert needed; EAS provisions it at build time). Returns how many
 * were accepted, and prunes tokens Expo reports as permanently dead (DeviceNotRegistered).
 */
export async function sendExpo(
  tokens: StoredToken[],
  msg: { title: string; body: string; data?: Record<string, unknown> }
): Promise<number> {
  if (!tokens.length) return 0;

  const messages = tokens.map((t) => ({
    to: t.token,
    title: msg.title,
    body: msg.body,
    sound: "default" as const,
    ...(msg.data ? { data: msg.data } : {}),
  }));

  const dead: string[] = [];
  let delivered = 0;

  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { status?: string; details?: { error?: string } }[];
      } | null;
      const results = json?.data;
      chunk.forEach((m, idx) => {
        const r = results?.[idx];
        if (r?.status === "ok") delivered++;
        else if (r?.details?.error === "DeviceNotRegistered") dead.push(m.to);
      });
    } catch {
      /* transient network/gateway error — leave tokens, retry on the next run */
    }
  }

  if (dead.length) {
    await prisma.expoPushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {});
  }
  return delivered;
}
