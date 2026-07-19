# Radar — a universal tracker

Track **anything with a date** — races (F1, IMSA, WEC), hockey (NHL + your friend's league), tennis, other racing, product drops, deadlines, birthdays — in one place, and get reminded before it happens. No account, no subscription. Your data lives on your device.

It's a **PWA** (installable web app), built to run great on an iPhone.

---

## What's in here

```
index.html            the app shell
css/styles.css        styling (dark + light)
js/app.js             all the logic
sw.js                 service worker (offline + push handling)
manifest.webmanifest  makes it installable
icon.svg              app icon
server/               OPTIONAL push server for background alerts (see below)
```

---

## Run it

A service worker + notifications require **HTTPS** (or `localhost`). Opening `index.html` from a folder (`file://`) will **not** work for notifications or install. Serve it instead.

**Quick local test (on your computer):**
```powershell
# from d:\Tracker
npx serve .          # or: python -m http.server 8000
```
Then open the printed `http://localhost:...` URL.

**Put it on your phone (free hosting):**
- **Netlify Drop** — drag the `Tracker` folder onto https://app.netlify.com/drop
- **GitHub Pages** — push these files to a repo, enable Pages
- **Vercel / Cloudflare Pages** — point at the folder

Any of these gives you an HTTPS link. Open it in **Safari on your iPhone**.

---

## Getting notifications on your iPhone

Apple does not let a website schedule an alert that fires while it's closed. There are exactly two reliable ways, and Radar does both:

### 1. Calendar alerts — works today, no server
Open any event → **Add to Calendar**. iOS creates a real calendar entry with the reminder times as alarms, and **the phone itself** fires them even if Radar is closed. This is the recommended path. You can also export everything at once from **Settings → Export all to Calendar**.

### 2. Web Push — needs "Add to Home Screen" + the push server
1. In Safari, open the app, tap the **Share** button → **Add to Home Screen**.
2. Open Radar from that new icon (this is required on iOS for push to exist at all).
3. Deploy the push server (below) and paste its URL + public key into **Settings → Push server**, then **Subscribe**.

While Radar is **open**, notifications and countdowns work everywhere with no server.

---

## Auto-import schedules (Sources)

**Settings → Sources → Add a source**:
- **F1 season** — imports the whole Formula 1 calendar (every GP, qualifying, sprint) with times in your local zone. Free, works in the browser. Tap **Sync** to refresh.
- **Team** — search NHL / NBA / soccer clubs and more (via TheSportsDB) and pull their next fixtures.
- **Feed** — paste any `.ics` / `webcal` schedule link.

Some sources block direct browser access (CORS). Those need the push server to proxy them — a known limitation of doing this without a backend.

---

## Optional: the push server (background alerts)

Only needed for Web Push on a closed phone. It's a small Node app in `server/`.

```powershell
cd server
npm install
npm run keys            # prints VAPID_PUBLIC=... and VAPID_PRIVATE=...
```
Set env vars `VAPID_PUBLIC`, `VAPID_PRIVATE`, and `CONTACT` (a mailto:), then:
```powershell
npm start
```
Deploy it somewhere with a public HTTPS URL (Render, Railway, Fly.io, a VPS). Then in Radar → **Settings → Push server**, paste the server URL and the **public** key, and hit **Subscribe**. The server checks every minute and pushes your reminders.

---

## Notes
- Everything is stored in your browser's `localStorage`. **Export a backup** now and then (Settings → Export) — clearing Safari data would otherwise wipe it.
- No tracking, no analytics, no third parties except the source APIs you explicitly import from.
