import Link from "next/link";
import { Bell, CalendarClock, Compass, Radio, Sparkles, Trophy } from "lucide-react";
import { WaitlistForm } from "./WaitlistForm";

const HIGHLIGHTS = [
  { emoji: "🏎️", label: "F1, IMSA & WEC" },
  { emoji: "🏒", label: "NHL & your league" },
  { emoji: "🎾", label: "Tennis & majors" },
  { emoji: "👟", label: "Drops & releases" },
];

const FEATURES = [
  { icon: CalendarClock, title: "One horizon", body: "Races, games, matches, movie drops, deadlines — everything you're counting down to, in a single upcoming feed." },
  { icon: Compass, title: "Follow a whole season", body: "Add a team, league or series once and its entire schedule pours in automatically. No manual entry." },
  { icon: Radio, title: "Live scores & status", body: "Live game states, scores and running order update in real time on game days — pulled from the same feeds the pros use." },
  { icon: Bell, title: "Reminders that land", body: "Get a nudge before anything starts, tuned per event — never miss the lights-out or the puck drop again." },
  { icon: Trophy, title: "Standings & profiles", body: "Tap into any league for standings, recent results and past champions — a mini profile for everything you track." },
  { icon: Sparkles, title: "Built for your phone", body: "A fast, native iPhone app with a home-screen widget counting down to whatever's next." },
];

function SooncastMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/30"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" opacity=".35" />
        <circle cx="12" cy="12" r="5" opacity=".6" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <path d="M12 12 L20 6" />
      </svg>
    </span>
  );
}

export function Landing({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="sooncast-glow min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6">
        {/* Header */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5">
            <SooncastMark size={34} />
            <span className="text-lg font-bold tracking-tight">Sooncast</span>
          </div>
          <Link href="/app" className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
            {loggedIn ? "Open the app" : "Log in"}
          </Link>
        </header>

        {/* Hero */}
        <section className="flex flex-1 flex-col justify-center py-14">
          <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> Now in private beta
          </span>
          <h1 className="max-w-2xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Everything you follow,
            <br />
            <span className="bg-gradient-to-r from-primary via-violet-400 to-primary bg-clip-text text-transparent">on one horizon.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Sooncast is a personal countdown for everything with a date — races, games, matches, drops, deadlines. Follow
            your teams and series, get a nudge before they start, and never miss what you care about.
          </p>

          <div className="mt-8">
            <WaitlistForm />
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {HIGHLIGHTS.map((h) => (
              <span key={h.label} className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground">
                <span aria-hidden>{h.emoji}</span>
                {h.label}
              </span>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="py-16">
          <h2 className="text-2xl font-bold tracking-tight">Made for people who don&apos;t want to miss it</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="surface rounded-2xl border border-border/70 bg-card/70 p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-16">
          <div className="sooncast-glow flex flex-col items-center gap-6 rounded-3xl border border-border/70 bg-card/50 px-6 py-14 text-center">
            <SooncastMark size={44} />
            <h2 className="max-w-lg text-3xl font-bold tracking-tight">Be first in when the beta opens.</h2>
            <p className="max-w-md text-muted-foreground">
              Leave your email and we&apos;ll send you a TestFlight invite as soon as there&apos;s a spot.
            </p>
            <div className="flex w-full justify-center">
              <WaitlistForm />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-3 border-t border-border/60 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <SooncastMark size={22} />
            <span>© {new Date().getFullYear()} Sooncast</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="transition hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="transition hover:text-foreground">Terms</Link>
            <Link href="/app" className="transition hover:text-foreground">{loggedIn ? "Open app" : "Log in"}</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
