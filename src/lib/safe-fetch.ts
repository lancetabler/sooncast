import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

// SSRF guard for user-supplied URLs (ICS calendar feeds). Without this, any signed-in user could
// make the server fetch internal endpoints — cloud metadata (169.254.169.254), localhost admin
// ports, private RFC1918 hosts — and read the body back through their own event list.

const MAX_REDIRECTS = 3;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB is plenty for a calendar feed

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 0 || a === 127) return true; // this-host / loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const s = ip.toLowerCase().split("%")[0];
  if (s === "::" || s === "::1") return true; // unspecified / loopback
  // IPv4-mapped (::ffff:a.b.c.d) — judge the embedded v4 address
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  if (/^f[cd]/.test(s)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(s)) return true; // fe80::/10 link-local
  if (s.startsWith("ff")) return true; // multicast
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return ipv4IsPrivate(ip);
  if (v === 6) return ipv6IsPrivate(ip);
  return true; // not an IP we understand — refuse
}

/** Throws unless the URL is a public http(s) endpoint. Returns the parsed URL. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.replace(/^webcal:/i, "https:"));
  } catch {
    throw new Error("Invalid feed URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid feed URL");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  // A literal IP needs no DNS; a hostname must resolve entirely to public addresses.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Blocked feed URL");
    return url;
  }
  const records = await dns.lookup(host, { all: true }).catch(() => []);
  if (!records.length) throw new Error("Couldn't resolve that feed's host");
  // Fail closed: if ANY resolved address is internal, refuse (guards DNS rebinding a little).
  if (records.some((r) => isPrivateAddress(r.address))) throw new Error("Blocked feed URL");
  return url;
}

/**
 * Fetch a user-supplied URL with SSRF protection: public http(s) only, every redirect hop
 * re-validated, and a hard size cap. Errors are deliberately generic so the response can't be
 * used to probe internal infrastructure.
 */
export async function safeFetchText(rawUrl: string, ms = 12000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    let target = await assertPublicUrl(rawUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(target, {
        signal: ctrl.signal,
        redirect: "manual", // we re-validate each hop ourselves
        headers: { "User-Agent": "SooncastTracker/1.0", Accept: "text/calendar, text/plain, */*" },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("Couldn't load that feed");
        target = await assertPublicUrl(new URL(loc, target).toString());
        continue;
      }

      if (!res.ok) throw new Error("Couldn't load that feed");

      const len = Number(res.headers.get("content-length") || 0);
      if (len && len > MAX_BYTES) throw new Error("That feed is too large");

      const text = await res.text();
      if (text.length > MAX_BYTES) throw new Error("That feed is too large");
      return text;
    }
    throw new Error("Couldn't load that feed");
  } finally {
    clearTimeout(timer);
  }
}
