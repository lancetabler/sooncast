/* Validate an APNs .p8 against Apple, through the same code production uses.
 *
 * Usage (from d:\Tracker):
 *   npx tsx scripts/check-apns-key.ts <path-to.p8> [keyId]
 *
 * keyId is optional — read from an "AuthKey_XXXXXXXXXX.p8" filename when present.
 * Prints nothing secret: only the key id and whether Apple accepted the signature.
 */
import { readFileSync } from "fs";
import { basename } from "path";

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

  // Feed the real module its config, so this tests the shipping code rather than a copy of it.
  process.env.APNS_KEY_ID = keyId;
  process.env.APNS_TEAM_ID = process.env.APNS_TEAM_ID || "JY23MWH53R";
  process.env.APNS_AUTH_KEY = key;
  const { apnsHealth, apnsPost } = await import("../src/lib/apns");

  const health = apnsHealth();
  console.log(`key id:  ${health.keyId}`);
  console.log(`team id: ${process.env.APNS_TEAM_ID}`);
  console.log(`signing: ${health.signs ? "OK" : "FAILED — " + health.problem}`);
  if (!health.signs) process.exit(1);

  // Ask Apple with a deliberately bogus device token: the only thing under test is the
  // credential. "BadDeviceToken" means Apple accepted the key; an auth error means it didn't.
  const jwtHealth = apnsHealth();
  void jwtHealth;
  const bundle = process.env.APNS_BUNDLE_ID || "com.lancetabler.sooncast";
  const { status, body } = await apnsPost(
    "0".repeat(64),
    {
      authorization: `bearer ${buildToken()}`,
      "apns-topic": `${bundle}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    JSON.stringify({ aps: { timestamp: Math.floor(Date.now() / 1000), event: "update", "content-state": {} } })
  );
  console.log(`apple:   HTTP ${status} ${body.slice(0, 140)}`);

  if (/BadDeviceToken|DeviceTokenNotForTopic|Unregistered/.test(body)) {
    console.log("\nRESULT: the key WORKS — Apple accepted it and only rejected the fake device token.");
  } else if (status === 403 || /InvalidProviderToken|MissingProviderToken|ExpiredProviderToken/.test(body)) {
    console.log("\nRESULT: Apple REJECTED the credential. Check the Key ID matches this .p8 and that it has APNs enabled.");
  } else if (/TopicDisallowed|BadTopic/.test(body)) {
    console.log("\nRESULT: key authenticated, but the topic was refused — the App ID may not have push/Live Activities enabled.");
  } else {
    console.log("\nRESULT: unexpected response — see the line above.");
  }
}

/** Mint a provider token the same way the module does (it keeps its own private). */
function buildToken(): string {
  const { createSign } = require("crypto") as typeof import("crypto");
  const b64 = (i: Buffer | string) =>
    Buffer.from(i).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID }));
  const claims = b64(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  const der = signer.sign((process.env.APNS_AUTH_KEY || "").replace(/\\n/g, "\n"));
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
  return `${header}.${claims}.${b64(out)}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
