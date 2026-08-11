import { ok, bad } from "@/lib/api";
import { authorizeCron } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// TEMPORARY DIAGNOSTIC. ESPN answers 403 to this app's server IPs while the same URLs
// work from a home connection. This probes which request shape / host / region ESPN
// accepts from here, so the fix is chosen on evidence. Delete once resolved.
const TARGET = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=5";

const VARIANTS: Array<{ name: string; url?: string; headers?: Record<string, string> }> = [
  { name: "current (SooncastTracker UA)", headers: { "User-Agent": "SooncastTracker/1.0", Accept: "application/json" } },
  { name: "no custom headers" },
  { name: "browser UA + espn referer", headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.espn.com/",
      Origin: "https://www.espn.com",
    } },
  { name: "alt host: cdn.espn.com", url: "https://cdn.espn.com/core/nba/schedule?xhr=1" },
  { name: "alt host: site.web.api.espn.com", url: "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=5" },
  { name: "alt host: sports.core.api.espn.com", url: "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events?limit=5" },
];

export async function GET(req: Request) {
  if (!authorizeCron(req)) return bad("Unauthorized", 401);

  const results = [];
  for (const v of VARIANTS) {
    const t0 = Date.now();
    try {
      const res = await fetch(v.url ?? TARGET, {
        headers: v.headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.text();
      results.push({
        variant: v.name,
        status: res.status,
        ms: Date.now() - t0,
        server: res.headers.get("server"),
        // A block page explains itself in the first line or two.
        snippet: res.ok ? `${body.length} bytes` : body.slice(0, 180).replace(/\s+/g, " "),
      });
    } catch (e) {
      results.push({ variant: v.name, status: 0, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return ok({ region: process.env.VERCEL_REGION ?? null, results });
}
