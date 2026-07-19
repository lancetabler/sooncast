/* ============================================================================
   Radar push server (optional).
   Purpose: deliver reminder notifications to a phone even when Radar is closed.
   How it works:
     1. The web app subscribes (pushManager.subscribe) and POSTs the subscription
        plus its events to /subscribe.
     2. Every minute this server checks for reminders whose fire-time has arrived
        and sends a Web Push. Apple/Google relay it to the locked phone.
   This is the ONLY way to get background push on iOS. Deploy anywhere that runs
   Node with a public HTTPS URL (Render, Railway, Fly, a VPS...).

   Setup:
     npm install
     npm run keys          # prints VAPID_PUBLIC / VAPID_PRIVATE
     set the two keys + CONTACT env vars, then: npm start
     Paste the public key + this server's URL into Radar → Settings → Push server.
   ============================================================================ */
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import webpush from 'web-push';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PORT = process.env.PORT || 8080;
const PUBLIC = process.env.VAPID_PUBLIC;
const PRIVATE = process.env.VAPID_PRIVATE;
const CONTACT = process.env.CONTACT || 'mailto:you@example.com';
const DB = process.env.DB_FILE || './subscriptions.json';

if (!PUBLIC || !PRIVATE) {
  console.error('Missing VAPID keys. Run `npm run keys` and set VAPID_PUBLIC / VAPID_PRIVATE.');
  process.exit(1);
}
webpush.setVapidDetails(CONTACT, PUBLIC, PRIVATE);

/* tiny JSON store: { [endpoint]: { subscription, events, sent: {} } } */
let store = existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : {};
const persist = () => writeFileSync(DB, JSON.stringify(store));

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => res.json({ ok: true, key: PUBLIC, subscribers: Object.keys(store).length }));

app.post('/subscribe', (req, res) => {
  const { subscription, events } = req.body || {};
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'no subscription' });
  const prev = store[subscription.endpoint] || { sent: {} };
  store[subscription.endpoint] = { subscription, events: (events && events.events) || events || [], sent: prev.sent || {} };
  persist();
  res.json({ ok: true });
});

app.post('/unsubscribe', (req, res) => {
  const ep = req.body?.endpoint;
  if (ep) { delete store[ep]; persist(); }
  res.json({ ok: true });
});

/* expand a single (non-recurring or simple-recurring) event into fire times */
function expand(ev, from, to) {
  const out = [];
  const base = new Date(ev.start);
  if (isNaN(base)) return out;
  const step = { daily: 1, weekly: 7, biweekly: 14 }[ev.freq];
  const push = (d) => { if (d >= from && d <= to) out.push(new Date(d)); };
  if (!ev.freq || ev.freq === 'none') { push(base); return out; }
  let cur = new Date(base), guard = 0;
  while (cur < from && guard < 2000) { cur = advance(cur, ev.freq, step); guard++; }
  while (cur <= to && guard < 2000) { push(cur); cur = advance(cur, ev.freq, step); guard++; }
  return out;
}
function advance(d, freq, step) {
  const x = new Date(d);
  if (freq === 'monthly') x.setMonth(x.getMonth() + 1); else x.setDate(x.getDate() + (step || 7));
  return x;
}

/* every minute: find reminders due in the last 90s and push once */
cron.schedule('* * * * *', async () => {
  const now = Date.now();
  const from = new Date(now - 3 * 3600 * 1000);
  const to = new Date(now + 60 * 86400 * 1000);
  for (const [endpoint, rec] of Object.entries(store)) {
    for (const ev of rec.events || []) {
      for (const occ of expand(ev, from, to)) {
        for (const min of ev.reminders || []) {
          const fireAt = occ.getTime() - min * 60000;
          const key = ev.id + '@' + occ.toISOString() + '#' + min;
          if (rec.sent[key]) continue;
          if (fireAt <= now && now - fireAt < 90 * 1000) {
            const title = ev.title;
            const body = min === 0 ? 'Starting now' : `Starts soon` + (ev.location ? ` · ${ev.location}` : '');
            try {
              await webpush.sendNotification(rec.subscription, JSON.stringify({ title, body, tag: key, url: ev.url || './index.html' }));
              rec.sent[key] = now;
            } catch (err) {
              if (err.statusCode === 404 || err.statusCode === 410) { delete store[endpoint]; }
            }
          }
        }
      }
    }
  }
  persist();
});

app.listen(PORT, () => console.log(`Radar push server on :${PORT}`));
