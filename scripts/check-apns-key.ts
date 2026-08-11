/* Validate an APNs .p8 against Apple before it goes anywhere near production.
 *
 * Usage (from d:\Tracker):
 *   npx tsx scripts/check-apns-key.ts <path-to.p8> [keyId]
 *
 * keyId is optional — it's read from an "AuthKey_XXXXXXXXXX.p8" filename when present.
 * Prints nothing secret: only the key id, and whether Apple accepted the signature.
 */
import { readFileSync } from "fs";
import { basename } from "path";
import { createSign } from "crypto";

const TEAM_ID = process.env.APNS_TEAM_ID || "JY23MWH53R";
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.lancetabler.sooncast";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function derToJose(der: Buffer): Buffer {
  let offset = 2;
  if (der[1] & 0x80) offset += der[1] & 0x7f;
  const rLen = der[offset + 1];
  const r = der.subarray(offset + 2, offset + 2 + rLen);
  const sStart = offset + 2 + rLen;
  const sLen = der[sStart + 1];
  const s = der.subarray(sStart + 2, sStart + 2 + sLen);
  const out = Buffer.alloc(64);
  const rt = r[0] === 0 ? r.subarray(1) : r;
  const st = s[0] === 0 ? s.subarray(1) : s;
  rt.copy(out, 32 - rt.length);
  st.copy(out, 64 - st.length);
  return out;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npx tsx scripts/check-apns-key.ts <path-to.p8> [keyId]");
    process.exit(1);
  }
  const key = readFileSync(file, "utf8");
  const keyId = process.argv[3] || basename(file).match(/AuthKey_([A-Z0-9]{10})/i)?.[1] || "";
  if (!keyId) {
    console.error("Couldn't work out the Key ID from the filename — pass it as the second argument.");
    process.exit(1);
  }
  if (!/BEGIN PRIVATE KEY/.test(key)) {
    console.error("That file doesn't look like a .p8 (no BEGIN PRIVATE KEY line).");
    process.exit(1);
  }

  console.log(`key id:  ${keyId}`);
  console.log(`team id: ${TEAM_ID}`);
  console.log(`bundle:  ${BUNDLE_ID}`);

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  let jwt: string;
  try {
    const signer = createSign("SHA256");
    signer.update(`${header}.${claims}`);
    jwt = `${header}.${claims}.${base64url(derToJose(signer.sign(key)))}`;
    console.log("signing: OK");
  } catch (e) {
    console.error("signing: FAILED —", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  // Ask Apple. A deliberately bogus device token means the only thing under test is the
  // credential: "BadDeviceToken" proves Apple accepted the key; an auth error proves it didn't.
  const res = await fetch(`https://api.push.apple.com/3/device/${"0".repeat(64)}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ aps: { timestamp: Math.floor(Date.now() / 1000), event: "update", "content-state": {} } }),
  });
  const body = await res.text().catch(() => "");
  console.log(`apple:   HTTP ${res.status} ${body.slice(0, 120)}`);

  if (/BadDeviceToken|DeviceTokenNotForTopic|Unregistered/.test(body)) {
    console.log("\nRESULT: the key works — Apple accepted it and only rejected the fake device token.");
  } else if (res.status === 403 || /InvalidProviderToken|MissingProviderToken|ExpiredProviderToken/.test(body)) {
    console.log("\nRESULT: Apple REJECTED the credential. Check the Key ID matches this .p8 and that the key has APNs enabled.");
  } else if (/TopicDisallowed|BadTopic/.test(body)) {
    console.log("\nRESULT: key authenticated, but the topic was refused — the App ID may not have Live Activities/push enabled.");
  } else {
    console.log("\nRESULT: unexpected response — see the line above.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
