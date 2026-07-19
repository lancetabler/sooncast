# Radar — a universal tracker

Track **anything with a date** — F1/IMSA/WEC, NHL and your friend's league, tennis, other racing, product drops, movie/TV releases, deadlines — in one place, and get reminded before it happens. Auto-imports whole schedules from public sources. Installable PWA, built to run great on iPhone.

Full-stack: **Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Prisma · SQLite (dev) / Postgres (prod) · Web Push**.

---

## Quick start

```powershell
npm install
npx prisma db push        # creates the SQLite dev database
npm run dev               # http://localhost:3000
```

`.env` is generated with working local values (SQLite, auth secret, VAPID keys). See `.env.example` for what each variable does.

Run the tests and build:

```powershell
npm test                  # unit tests (recurrence, ICS, plan limits)
npm run build             # production build
```

---

## How it's organized

```
src/
  app/
    page.tsx                  server: shows landing (logged out) or the app (logged in)
    layout.tsx                fonts, metadata, PWA, toaster
    api/                      route handlers (auth, events, categories, follows,
                              sources, feed, push, cron, settings, billing)
  components/
    ui/                       shadcn components
    app/                      the product UI (AppClient, views, dialogs)
  lib/
    auth.ts                   cookie sessions (bcrypt + jose JWT)
    prisma.ts                 db client
    domain/                   PURE logic: recurrence, ics, format, plan, categories
    sources/                  source providers + registry (ESPN, Jolpica, TheSportsDB, ICS, TMDB)
    import.ts                 follow -> fetch -> upsert events
    state.ts / serialize.ts   server state bundle for the client
    client/                   client-side api, push, occurrence helpers
prisma/schema.prisma          data model
public/                       icon, manifest, service worker (push)
legacy/                       the original single-file prototype (kept for reference)
```

---

## Accounts & data
Email + password accounts (hashed with bcrypt, signed-cookie sessions). Every user gets seeded categories on sign-up. All data is scoped to the account, so it syncs across any device you sign in on. For production, point `DATABASE_URL` at Postgres and change `provider` in `prisma/schema.prisma`.

## Sources (auto-import)
Discover -> search or pick a featured source -> **Follow**. It fetches the schedule server-side (no CORS issues) and keeps it in sync (tap Sync in Settings).

- **ESPN** (no key) — F1, IndyCar, NASCAR, ATP/WTA tennis, NHL/NBA/NFL/MLB, soccer leagues, and team search.
- **Jolpica** (no key) — F1 with per-session times (quali/sprint).
- **TheSportsDB** (free key `3`) — global team search + fixtures.
- **ICS feed** — subscribe to any `.ics`/`webcal` schedule (great for IMSA/WEC/your friend's league).
- **TMDB** (needs `TMDB_API_KEY`) — movie release dates.

## Notifications (built for iPhone)
Three layers, in order of reliability on iOS:

1. **Calendar feed** — Settings -> *Add to Calendar* subscribes Apple/Google Calendar to your private `webcal` feed. It auto-updates and the phone fires the alarms itself, even when Radar is closed. Most reliable, works today.
2. **Web Push** — Settings -> *Enable*. On iPhone: Share -> **Add to Home Screen**, open from that icon first. Uses Declarative Web Push (iOS 18.4+) with a service-worker fallback. Background delivery is driven by the reminder cron.
3. **Badging** — the home-screen icon shows a count of events in the next 24h.

### Reminder cron
`GET/POST /api/cron/reminders?secret=$CRON_SECRET` sends due reminders. Run it every minute:
- **Vercel:** add a Cron Job hitting that path.
- **Anywhere:** a 1-minute cron/`curl`, or an uptime pinger.

## Freemium
Free plan: 40 events, 3 followed sources, 2 reminders/event. Pro lifts all limits + quiet hours. Limits are enforced server-side; the upgrade dialog appears on any 402. Billing is wired for Stripe — set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `NEXT_PUBLIC_STRIPE_ENABLED=true` to go live (checkout returns a clear message until then).

## Deploy
Vercel is the smoothest path: import the repo, set env vars (`DATABASE_URL` -> Postgres, `AUTH_SECRET`, `VAPID_*`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`), add the reminder Cron Job. Any Node host works too.

## What still needs your keys / next steps
- **Stripe** keys for live billing.
- **Postgres** for production (SQLite is dev-only).
- **OAuth** (Google/Apple sign-in) — accounts are email/password today.
- **Native wrapper** (Capacitor) if you later want true iOS widgets / lock-screen and App Store presence — a PWA can't do those.
