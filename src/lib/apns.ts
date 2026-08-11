import "server-only";
import { createSign } from "crypto";

/**
 * Direct APNs delivery for **Live Activity** updates.
 *
 * Ordinary pushes go through Expo (which owns the APNs certificate provisioned at build time),
 * but Expo's push service can't carry ActivityKit update payloads — those need the
 * `apns-push-type: liveactivity` header and the Activity's own push token. So this talks to
 * APNs directly, signed with a p8 auth key.
 *
 * Entirely optional: with the env vars unset every call reports "not configured" and Live
 * Activities simply keep updating whenever the app is in the foreground, as they do today.
 *
 * Required env (Apple Developer → Keys → new key with "Apple Push Notifications service"):
 *   APNS_KEY_ID     – the 10-character key id
 *   APNS_TEAM_ID    – Apple team id (JY23MWH53R)
 *   APNS_AUTH_KEY   – contents of the .p8 file (BEGIN PRIVATE KEY … END PRIVATE KEY)
 *   APNS_BUNDLE_ID  – defaults to com.lancetabler.sooncast
 */

export function apnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_AUTH_KEY);
}

function bundleId(): string {
  return process.env.APNS_BUNDLE_ID || "com.lancetabler.sooncast";
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// APNs provider tokens stay valid for an hour and must not be regenerated more than once
// every 20 minutes, so cache and reuse.
let cachedToken: { jwt: string; at: number } | null = null;

function providerToken(): string | null {
  if (!apnsConfigured()) return null;
  if (cachedToken && Date.now() - cachedToken.at < 30 * 60_000) return cachedToken.jwt;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID }));
  const claims = base64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  // The p8 may arrive with literal "\n" sequences when pasted into a dashboard env var.
  const key = (process.env.APNS_AUTH_KEY || "").replace(/\\n/g, "\n");
  try {
    const signer = createSign("SHA256");
    signer.update(`${header}.${claims}`);
    const der = signer.sign(key);
    const jwt = `${header}.${claims}.${base64url(derToJoseES256(der))}`;
    cachedToken = { jwt, at: Date.now() };
    return jwt;
  } catch {
    return null;
  }
}

/** Node signs ES256 as DER; JWS wants the raw r||s pair. */
function derToJoseES256(der: Buffer): Buffer {
  let offset = 2;
  if (der[1] & 0x80) offset += der[1] & 0x7f; // long-form length
  const rLen = der[offset + 1];
  const r = der.subarray(offset + 2, offset + 2 + rLen);
  const sStart = offset + 2 + rLen;
  const sLen = der[sStart + 1];
  const s = der.subarray(sStart + 2, sStart + 2 + sLen);
  const out = Buffer.alloc(64);
  // Strip DER's sign padding, then left-pad each half to 32 bytes.
  const rTrim = r[0] === 0 ? r.subarray(1) : r;
  const sTrim = s[0] === 0 ? s.subarray(1) : s;
  rTrim.copy(out, 32 - rTrim.length);
  sTrim.copy(out, 64 - sTrim.length);
  return out;
}

export interface LiveActivityContent {
  status: string;
  detail: string;
  homeName?: string;
  homeScore?: string;
  awayName?: string;
  awayScore?: string;
}

export type ApnsResult = "sent" | "gone" | "failed" | "not-configured";

/**
 * Push one Live Activity update (or `end` it). Returns "gone" when APNs says the token is
 * dead — the Activity was dismissed or expired — so the caller can drop the row.
 */
export async function sendLiveActivityUpdate(
  token: string,
  content: LiveActivityContent,
  opts: { end?: boolean; staleAfterSec?: number; dismissAfterSec?: number } = {}
): Promise<ApnsResult> {
  const jwt = providerToken();
  if (!jwt) return "not-configured";

  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    aps: {
      timestamp: now,
      event: opts.end ? "end" : "update",
      "content-state": {
        status: content.status,
        detail: content.detail,
        homeName: content.homeName ?? "",
        homeScore: content.homeScore ?? "",
        awayName: content.awayName ?? "",
        awayScore: content.awayScore ?? "",
      },
      ...(opts.staleAfterSec ? { "stale-date": now + opts.staleAfterSec } : {}),
      ...(opts.end && opts.dismissAfterSec ? { "dismissal-date": now + opts.dismissAfterSec } : {}),
    },
  };

  const host = process.env.APNS_HOST || "https://api.push.apple.com";
  try {
    const res = await fetch(`${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": `${bundleId()}.push-type.liveactivity`,
        "apns-push-type": "liveactivity",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return "sent";
    // 410 Gone, or 400 BadDeviceToken — the Activity is over; stop trying.
    if (res.status === 410) return "gone";
    const body = await res.text().catch(() => "");
    if (/BadDeviceToken|Unregistered|ExpiredToken/.test(body)) return "gone";
    console.error("[apns] live activity update failed:", res.status, body.slice(0, 160));
    return "failed";
  } catch {
    return "failed";
  }
}
