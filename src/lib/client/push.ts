import { api } from "./api";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Ask permission, subscribe to push, and register the subscription server-side. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "This browser can't do push. Use Add to Calendar instead." };
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, reason: "Push isn't configured on the server yet." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Notifications were blocked." };

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: "Service worker failed to register." };
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }
  await api.subscribePush(sub.toJSON());
  return { ok: true };
}

/**
 * Re-arm push on launch WITHOUT ever prompting. If the user has already granted notifications,
 * make sure a live subscription exists and is registered server-side. iOS silently rotates/
 * invalidates push subscriptions (and the cron deletes dead ones on 404/410), so without this a
 * granted user can quietly stop receiving reminders with no recovery path. The subscribe endpoint
 * upserts by endpoint, so re-arming every launch is cheap and idempotent.
 * Returns true if a live, registered subscription is in place afterward.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return false;
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return false;
    const reg = await registerServiceWorker();
    if (!reg) return false;
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }
    await api.subscribePush(sub.toJSON());
    return true;
  } catch {
    return false; // best-effort — we retry on the next launch
  }
}

/** Home-screen icon badge (iOS 16.4+ / Chromium) = count of imminent events. */
export async function setBadge(count: number): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0 && nav.setAppBadge) await nav.setAppBadge(count);
    else if (nav.clearAppBadge) await nav.clearAppBadge();
  } catch {
    /* not supported — ignore */
  }
}
