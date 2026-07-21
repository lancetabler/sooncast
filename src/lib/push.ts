import "server-only";
import webpush from "web-push";

let configured = false;
export function pushReady(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_CONTACT || "mailto:sooncast@example.com", pub, priv);
    configured = true;
  }
  return true;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/** Sends a Declarative Web Push payload (iOS 18.4+) that also works via the
 *  service worker on other browsers. Returns the HTTP status or 0 on error. */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<number> {
  if (!pushReady()) return 0;
  const declarative = {
    web_push: 8030,
    notification: {
      title: payload.title,
      body: payload.body,
      navigate: payload.url || process.env.NEXT_PUBLIC_APP_URL || "/",
      ...(payload.tag ? { tag: payload.tag } : {}),
    },
    // legacy fields for non-declarative service workers
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  };
  try {
    const res = await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(declarative)
    );
    return res.statusCode;
  } catch (e: unknown) {
    const err = e as { statusCode?: number };
    return err.statusCode ?? 0;
  }
}
