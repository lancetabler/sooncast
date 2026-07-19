// "Where to watch" → tappable links. Two layers:
//  1. NETWORK_URLS turns broadcast names from ESPN (📺 notes) into live-stream links.
//  2. streamingService() deep-links events into the OTT service that carries that series
//     (F1 TV, FIAWEC+, Rally.tv, …) — the browser session is already logged in, so it just plays.

export interface WatchLink {
  name: string;
  url?: string;
  /** Overrides the default "Watch on {name}" button label (e.g. for schedule/where-to-watch pages). */
  cta?: string;
}

const NETWORK_URLS: Record<string, string> = {
  // ESPN family
  espn: "https://www.espn.com/watch/",
  espn2: "https://www.espn.com/watch/",
  espn3: "https://www.espn.com/watch/",
  espnu: "https://www.espn.com/watch/",
  espnews: "https://www.espn.com/watch/",
  "espn deportes": "https://www.espn.com/watch/",
  "sec network": "https://www.espn.com/watch/",
  secn: "https://www.espn.com/watch/",
  "acc network": "https://www.espn.com/watch/",
  accn: "https://www.espn.com/watch/",
  "espn+": "https://plus.espn.com",
  abc: "https://abc.com/watch-live",
  // FOX family
  fox: "https://www.foxsports.com/live",
  fs1: "https://www.foxsports.com/live",
  fs2: "https://www.foxsports.com/live",
  "fox sports 1": "https://www.foxsports.com/live",
  "fox sports 2": "https://www.foxsports.com/live",
  "fox deportes": "https://www.foxsports.com/live",
  btn: "https://www.foxsports.com/live",
  "big ten network": "https://www.foxsports.com/live",
  // NBC family
  nbc: "https://www.nbcsports.com/live",
  "usa network": "https://www.nbcsports.com/live",
  usa: "https://www.nbcsports.com/live",
  cnbc: "https://www.nbcsports.com/live",
  "golf channel": "https://www.nbcsports.com/live",
  peacock: "https://www.peacocktv.com",
  // CBS family
  cbs: "https://www.paramountplus.com/live-tv/",
  cbssn: "https://www.paramountplus.com/live-tv/",
  "cbs sports network": "https://www.paramountplus.com/live-tv/",
  "paramount+": "https://www.paramountplus.com",
  // WBD family
  tnt: "https://play.max.com",
  tbs: "https://play.max.com",
  trutv: "https://play.max.com",
  max: "https://play.max.com",
  // streamers
  "prime video": "https://www.primevideo.com",
  "amazon prime video": "https://www.primevideo.com",
  amazon: "https://www.primevideo.com",
  "apple tv": "https://tv.apple.com",
  "apple tv+": "https://tv.apple.com",
  "mls season pass": "https://tv.apple.com",
  netflix: "https://www.netflix.com",
  dazn: "https://www.dazn.com",
  "motogp videopass": "https://www.motogp.com/en/videopass",
  fubo: "https://www.fubo.tv",
  willow: "https://www.willow.tv",
  "willow tv": "https://www.willow.tv",
  // league networks
  "nfl network": "https://www.nfl.com/plus/",
  "nfl+": "https://www.nfl.com/plus/",
  "mlb network": "https://www.mlb.com/network",
  "mlb.tv": "https://www.mlb.com/tv",
  "nba tv": "https://www.nba.com/watch/",
  "nba league pass": "https://www.nba.com/watch/",
  "nhl network": "https://www.nhl.com/info/nhl-network",
  // broadcast & RSNs
  cw: "https://www.cwtv.com/live/",
  "the cw": "https://www.cwtv.com/live/",
  ion: "https://iontelevision.com",
  telemundo: "https://www.telemundo.com",
  universo: "https://www.telemundo.com",
  univision: "https://www.tudn.com",
  tudn: "https://www.tudn.com",
  unimas: "https://www.tudn.com",
  "yes network": "https://www.yesnetwork.com",
  nesn: "https://www.nesn.com",
  masn: "https://www.masnsports.com",
  // international
  "sky sports": "https://www.skysports.com/watch",
  tsn: "https://www.tsn.ca/live",
  sportsnet: "https://www.sportsnet.ca/live",
  "bein sports": "https://www.beinsports.com",
};

function urlFor(rawName: string): string | undefined {
  const key = rawName.trim().toLowerCase();
  if (NETWORK_URLS[key]) return NETWORK_URLS[key];
  if (key.startsWith("espn")) return "https://www.espn.com/watch/";
  if (key.startsWith("flo")) return "https://www.flosports.tv"; // FloRacing, FloSports, FloWrestling, …
  if (key.startsWith("fanduel") || key.startsWith("fdsn") || key.startsWith("bally")) return "https://www.fanduelsportsnetwork.com";
  if (key.startsWith("fox")) return "https://www.foxsports.com/live";
  if (key.startsWith("nbc")) return "https://www.nbcsports.com/live";
  if (key.startsWith("cbs")) return "https://www.paramountplus.com/live-tv/";
  if (key.startsWith("sky")) return "https://www.skysports.com/watch";
  return undefined;
}

/** Parse the network list out of a "📺 FOX, FS1" note (with or without the emoji prefix). */
export function watchLinks(note: string | null | undefined): WatchLink[] {
  if (!note) return [];
  const list = note.replace(/^📺\s*/, "");
  return list
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => ({ name, url: urlFor(name) }));
}

// Where-to-watch by series. Matched against the event's SERIES identity (sourceLabel first),
// not loose title words — many series call a round a "Grand Prix", so that word must NOT
// route to F1. Order matters: specific series before the generic F1 rule.
const SERVICES: Array<{ pattern: RegExp; link: WatchLink }> = [
  { pattern: /motogp|moto2|moto3|moto gp/i, link: { name: "MotoGP VideoPass", url: "https://www.motogp.com/en/videopass" } },
  // IndyCar (incl. Indy NXT / Indy 500) is FOX-exclusive in the US.
  { pattern: /indycar|indy car|indy nxt|indy 500|indianapolis 500/i, link: { name: "FOX Sports", url: "https://www.fox.com/sports/motorsports/indycar-series" } },
  // NASCAR is split across FOX/FS1, Prime Video, TNT and NBC/USA — link to the schedule that lists each race's channel.
  { pattern: /nascar|arca/i, link: { name: "NASCAR", url: "https://www.nascar.com/schedule/", cta: "Where to watch — NASCAR schedule & channels" } },
  { pattern: /\bwec\b|le mans|world endurance/i, link: { name: "FIAWEC+", url: "https://plus.fiawec.com" } },
  { pattern: /\bwrc\b|world rally/i, link: { name: "Rally.tv", url: "https://www.rally.tv" } },
  { pattern: /\bimsa\b/i, link: { name: "IMSA / Peacock", url: "https://www.imsa.com/watchlive/" } },
  { pattern: /\bf1\b|formula 1|formula one/i, link: { name: "F1 TV", url: "https://f1tv.formula1.com" } },
];

/** The where-to-watch link for this event's series, if we recognize it. */
export function streamingService(ev: { title: string; sourceLabel?: string | null; note?: string | null }): WatchLink | null {
  // sourceLabel (the series name) leads so "Grand Prix of Nashville" (IndyCar) can't match F1.
  const hay = `${ev.sourceLabel ?? ""} ${ev.title} ${ev.note ?? ""}`;
  for (const s of SERVICES) if (s.pattern.test(hay)) return s.link;
  return null;
}
