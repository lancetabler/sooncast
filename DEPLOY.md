# Deploying Sooncast — the free stack

**Vercel** (app) + **Neon** (Postgres) + a **1-minute pinger** for reminders. All free.

> Heads up on two things before you start:
> - **Vercel Hobby is non-commercial** per their ToS. Fine for launching/testing/inviting friends. Once you actually charge money (Stripe), you'll need Vercel **Pro ($20/mo)** or move to Cloudflare/Fly. Nothing in the code needs to change either way.
> - **Vercel's built-in cron only runs daily on the free tier** (Hobby rejects a more-frequent schedule). So `vercel.json` ships a daily cron just to keep the free deploy happy, and the real every-minute reminders come from an external pinger (step 5). When you upgrade to Pro, change the `vercel.json` schedule to `* * * * *` and you can drop the external pinger.

---

## 1. Database — Neon (free)
1. Create a project at **neon.tech**. Name the database `sooncast`.
2. In the dashboard, copy **two** connection strings:
   - **Pooled** — the host contains `-pooler`. This is `DATABASE_URL`.
   - **Direct** — the plain host. This is `DIRECT_URL`.
   Make sure both end with `?sslmode=require`.
3. Create the tables (run once, locally, pointed at Neon):
   ```powershell
   # put the two Neon URLs in your .env first, then:
   npx prisma db push
   ```

## 2. Generate your production secrets
```powershell
# session secret + cron secret (any long random strings)
# on Windows PowerShell:
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")   # AUTH_SECRET
[guid]::NewGuid().ToString("N")                                     # CRON_SECRET

# VAPID keys for Web Push:
npx web-push generate-vapid-keys --json
```
(You can reuse the VAPID keys already in your local `.env` if you like.)

## 3. Deploy the app — Vercel
1. Push this folder to a GitHub repo, then **Import Project** at vercel.com.
2. Framework preset auto-detects **Next.js**. No build command changes needed
   (`prisma generate` runs automatically via the `postinstall` script).
3. Add these **Environment Variables** (Production):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** string |
   | `DIRECT_URL` | Neon **direct** string |
   | `AUTH_SECRET` | your generated secret |
   | `CRON_SECRET` | your generated secret |
   | `CRON_LOOKBACK_MIN` | `2` (or your pinger interval + 1) |
   | `VAPID_PUBLIC_KEY` | from step 2 |
   | `VAPID_PRIVATE_KEY` | from step 2 |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | same as `VAPID_PUBLIC_KEY` |
   | `VAPID_CONTACT` | `mailto:you@yourdomain` |
   | `NEXT_PUBLIC_APP_URL` | your Vercel URL, e.g. `https://sooncast.vercel.app` |

4. Deploy. Open the URL and **sign up — the first account becomes the admin/owner with everything unlocked.**

## 4. (Optional) Stripe for paid Pro
Add `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `NEXT_PUBLIC_STRIPE_ENABLED=true`.
Until then the upgrade button says billing isn't configured (safe).

## 5. Reminders — the 1-minute pinger (free)
Hit `GET /api/cron/tick` every minute. That one endpoint does everything: due reminders + live
score alerts on every call, the morning digest (only in the user's 7–10am window), and a source
re-sync every ~6h. (Don't point the pinger at `/api/cron/reminders` — that runs reminders *only*,
so the digest and schedule re-imports would never fire.) Pick one:

**cron-job.org (easiest):**
1. Sign up (free), create a cron job.
2. URL: `https://YOUR-APP.vercel.app/api/cron/tick?secret=YOUR_CRON_SECRET`
3. Schedule: **every 1 minute**. Done.

**Cloudflare Worker (also free, per-minute):** a tiny worker on a `* * * * *` trigger that `fetch()`es the same URL.

> If your pinger runs every 5 minutes instead of 1, set `CRON_LOOKBACK_MIN=6` so no reminder slips through the window.

When you upgrade to Vercel Pro, change the `vercel.json` schedule to `* * * * *` — the built-in cron then hits `/api/cron/tick` itself (Vercel signs those requests with `CRON_SECRET`) and you can delete the external pinger.

---

## Local development after this switch
Local now uses Postgres too (prod parity). Easiest: make a **second Neon branch** (or a second free project) for dev and put its URLs in `.env`, then `npx prisma db push` and `npm run dev`.

Prefer SQLite locally? Change `provider = "postgresql"` back to `"sqlite"` in `prisma/schema.prisma`, remove the `directUrl` line, and set `DATABASE_URL="file:./dev.db"` — but keep prod on Postgres.

## Going commercial later
When you start charging: either upgrade to **Vercel Pro** (keeps everything as-is, unlocks per-minute cron, clears the ToS concern), or move the app to **Cloudflare** (free + commercial-OK + per-minute cron, but needs the OpenNext adapter and a Web-Crypto VAPID swap). Neon and the rest carry over unchanged.
