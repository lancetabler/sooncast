/* ============================================================================
   Radar — a universal tracker.
   Vanilla JS, no build step. State in localStorage. Optional API sources.
   Author-facing notes live near each section.
   ============================================================================ */
'use strict';

/* ------------------------------- constants ------------------------------- */
const STORE_KEY = 'radar.state.v1';
const HORIZON_DAYS = 400;          // how far ahead recurring events expand
const NOTIFY_HORIZON_DAYS = 45;    // how far ahead we schedule reminders
const LIVE_WINDOW_MIN = 180;       // treat as "live" for this long after start
const MISS_GRACE_MIN = 360;        // catch up missed reminders within 6h

const PALETTE = ['#ff5d6c','#ff8f3e','#ffbf3c','#35d0a0','#3ec7d6','#5b8cff','#8a5bff','#e069d6','#c0cad6','#7bd44a'];
const EMOJIS = ['🏎️','🏁','🏒','🎾','🏀','⚽','🏈','⚾','🥅','🏆','🎮','👟','🎬','🎵','📺','📦','🛒','✈️','🎂','📌','💊','💼','📚','🩺','🎟️','🚀'];

/* Seed categories tuned to what the owner tracks, but fully editable. */
const SEED_CATEGORIES = [
  { id: 'f1',      name: 'Formula 1',   emoji: '🏎️', color: '#ff5d6c' },
  { id: 'imsa',    name: 'IMSA',        emoji: '🏁', color: '#ff8f3e' },
  { id: 'wec',     name: 'FIA WEC',     emoji: '🌍', color: '#3ec7d6' },
  { id: 'nhl',     name: 'NHL',         emoji: '🏒', color: '#5b8cff' },
  { id: 'league',  name: "Friend's League", emoji: '🥅', color: '#8a5bff' },
  { id: 'tennis',  name: 'Tennis',      emoji: '🎾', color: '#35d0a0' },
  { id: 'racing',  name: 'Racing',      emoji: '🏆', color: '#ffbf3c' },
  { id: 'drops',   name: 'Drops',       emoji: '👟', color: '#e069d6' },
  { id: 'personal',name: 'Personal',    emoji: '📌', color: '#c0cad6' },
];

const REMINDER_PRESETS = [
  { min: 0,     label: 'At start' },
  { min: 10,    label: '10 min before' },
  { min: 30,    label: '30 min before' },
  { min: 60,    label: '1 hour before' },
  { min: 180,   label: '3 hours before' },
  { min: 720,   label: '12 hours before' },
  { min: 1440,  label: '1 day before' },
  { min: 2880,  label: '2 days before' },
  { min: 10080, label: '1 week before' },
];

/* --------------------------------- state --------------------------------- */
let state = null;
const pendingTimers = [];     // in-app setTimeout handles

function defaultState() {
  return {
    categories: SEED_CATEGORIES.map((c) => ({ ...c })),
    events: [],
    sources: [],
    delivered: {},            // reminderKey -> true (dedupe)
    settings: {
      theme: 'dark',
      notifEnabled: false,
      defaultReminders: [0, 60, 1440],
      sportsdbKey: '3',
      vapidPublicKey: '',
      pushServerUrl: '',
      permBannerDismissed: false,
    },
    ui: { view: 'upcoming', filter: 'all', search: '', calMonth: null },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base, ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      ui: { ...base.ui, ...(parsed.ui || {}) },
      delivered: parsed.delivered || {},
    };
  } catch (e) { return defaultState(); }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ------------------------------- utilities ------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function catById(id) { return state.categories.find((c) => c.id === id) || { id: 'personal', name: 'Other', emoji: '📌', color: '#c0cad6' }; }

/* Build a Date from a stored local 'YYYY-MM-DDTHH:mm' string. */
function toDate(local) { return new Date(local); }
function pad(n) { return String(n).padStart(2, '0'); }
function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function utcToLocalInput(dateStr, timeStr) {
  // dateStr 'YYYY-MM-DD', timeStr 'HH:MM:SSZ' or 'HH:MM'
  if (!dateStr) return null;
  let iso = dateStr + 'T' + (timeStr ? timeStr.replace('Z', '') : '00:00') + 'Z';
  const d = new Date(iso);
  if (isNaN(d)) return dateStr + 'T00:00';
  return toLocalInput(d);
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtTime(d) {
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function humanCountdown(ms) {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 1) return d === 1 && h > 0 ? `1d ${h}h` : `${d}d`;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return 'soon';
}
function humanReminder(min) {
  const p = REMINDER_PRESETS.find((r) => r.min === min);
  if (p) return p.label;
  if (min === 0) return 'At start';
  if (min % 1440 === 0) return `${min / 1440} day${min/1440>1?'s':''} before`;
  if (min % 60 === 0) return `${min / 60} hour${min/60>1?'s':''} before`;
  return `${min} min before`;
}

/* ---------------------- recurrence / occurrences ------------------------- */
function nextByFreq(d, freq) {
  const x = new Date(d);
  switch (freq) {
    case 'daily':    x.setDate(x.getDate() + 1); break;
    case 'weekly':   x.setDate(x.getDate() + 7); break;
    case 'biweekly': x.setDate(x.getDate() + 14); break;
    case 'monthly':  x.setMonth(x.getMonth() + 1); break;
    default: return null;
  }
  return x;
}

/* Expand one event into occurrences within [from, to]. */
function expandEvent(ev, from, to) {
  const out = [];
  const base = toDate(ev.start);
  if (isNaN(base)) return out;
  const freq = ev.freq || 'none';
  if (freq === 'none') {
    if (base >= from && base <= to) out.push(makeOcc(ev, base));
    return out;
  }
  let cur = new Date(base);
  let guard = 0;
  // fast-forward to window
  while (cur < from && guard < 2000) { const n = nextByFreq(cur, freq); if (!n) break; cur = n; guard++; }
  while (cur <= to && guard < 2000) {
    if (cur >= from) out.push(makeOcc(ev, new Date(cur)));
    if (ev.until && cur > toDate(ev.until)) break;
    const n = nextByFreq(cur, freq); if (!n) break; cur = n; guard++;
  }
  return out;
}
function makeOcc(ev, start) {
  const dur = ev.allDay ? 24 * 60 : (ev.durationMin || 120);
  return { ev, start, end: new Date(start.getTime() + dur * 60000), key: ev.id + '@' + start.toISOString() };
}

/* All occurrences across all events within a window, optionally filtered. */
function occurrences(from, to, { filter = 'all', search = '' } = {}) {
  const q = search.trim().toLowerCase();
  let list = [];
  for (const ev of state.events) {
    if (filter !== 'all' && ev.categoryId !== filter) continue;
    if (q) {
      const hay = (ev.title + ' ' + (ev.note || '') + ' ' + (ev.location || '') + ' ' + catById(ev.categoryId).name).toLowerCase();
      if (!hay.includes(q)) continue;
    }
    list = list.concat(expandEvent(ev, from, to));
  }
  list.sort((a, b) => a.start - b.start);
  return list;
}

/* --------------------------------- render -------------------------------- */
function render() {
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  renderChips();
  renderPermBanner();
  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== state.ui.view; });
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.goto === state.ui.view));
  if (state.ui.view === 'upcoming') renderUpcoming();
  if (state.ui.view === 'calendar') renderCalendar();
  if (state.ui.view === 'categories') renderCategories();
  if (state.ui.view === 'settings') renderSettings();
  updateNotifDot();
}

function renderChips() {
  const el = $('#chips');
  const now = new Date();
  const to = addDays(now, HORIZON_DAYS);
  const counts = {};
  let total = 0;
  for (const ev of state.events) {
    const occ = expandEvent(ev, now, to);
    if (occ.length) { counts[ev.categoryId] = (counts[ev.categoryId] || 0) + 1; total += 1; }
  }
  const used = state.categories.filter((c) => counts[c.id]);
  let html = `<button class="chip ${state.ui.filter==='all'?'active':''}" data-filter="all" style="--chip-c:var(--accent)"><span class="dot"></span>All <span class="count">${total}</span></button>`;
  for (const c of used) {
    html += `<button class="chip ${state.ui.filter===c.id?'active':''}" data-filter="${c.id}" style="--chip-c:${c.color}"><span class="dot"></span>${esc(c.emoji)} ${esc(c.name)} <span class="count">${counts[c.id]}</span></button>`;
  }
  el.innerHTML = html;
}

function occCard(occ) {
  const ev = occ.ev; const c = catById(ev.categoryId);
  const now = Date.now();
  const startMs = occ.start.getTime();
  const isLive = now >= startMs && now < occ.end.getTime();
  const isPast = now >= occ.end.getTime();
  const diff = startMs - now;
  let cdClass = ''; let cdText = humanCountdown(diff);
  if (isLive) { cdClass = 'live'; cdText = 'LIVE'; }
  else if (isPast) { cdText = 'ended'; }
  else if (diff < 3600000) cdClass = 'soon';

  const remCount = (ev.reminders || []).length;
  const bell = state.settings.notifEnabled && remCount
    ? `<span class="badge-bell" title="${remCount} reminder(s)"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></span>`
    : '';
  const recur = ev.freq && ev.freq !== 'none'
    ? `<span class="badge-recur"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>${esc(ev.freq)}</span>`
    : '';
  const meta = [];
  if (!ev.allDay) meta.push(`<span class="m-item">${fmtTime(occ.start)}</span>`);
  else meta.push(`<span class="m-item">All day</span>`);
  if (ev.location) meta.push(`<span class="m-item">📍 ${esc(ev.location)}</span>`);

  return `
  <div class="card ${isLive?'live':''} ${isPast?'past':''}" data-open="${esc(ev.id)}" data-occ="${occ.start.toISOString()}" style="--cat-c:${c.color}">
    <div class="card-rail"></div>
    <div class="card-time">
      <span class="d">${occ.start.getDate()}</span>
      <span class="m">${MON_S[occ.start.getMonth()]}</span>
      <span class="t">${DOW[occ.start.getDay()]}</span>
    </div>
    <div class="card-body">
      <span class="card-cat"><span class="emoji">${esc(c.emoji)}</span>${esc(c.name)} ${recur} ${bell}</span>
      <span class="card-title">${esc(ev.title)}</span>
      <div class="card-meta">${meta.join('')}</div>
      ${ev.note ? `<span class="card-note">${esc(ev.note)}</span>` : ''}
    </div>
    <span class="card-countdown ${cdClass}" data-cd="${startMs}" data-end="${occ.end.getTime()}">${cdText}</span>
  </div>`;
}

function renderUpcoming() {
  const el = $('#view-upcoming');
  const now = new Date();
  const from = new Date(now.getTime() - LIVE_WINDOW_MIN * 60000);
  const to = addDays(now, HORIZON_DAYS);
  const occ = occurrences(from, to, { filter: state.ui.filter, search: state.ui.search });

  if (!occ.length) {
    el.innerHTML = state.events.length
      ? emptyState('🔭', 'Nothing coming up here', 'Try a different filter, clear search, or add something new.')
      : emptyState('📡', 'Your radar is clear', 'Tap + to track your first thing — a race, a game, a drop, a deadline. Or pull a whole season in from Sources in Settings.');
    return;
  }

  // group
  const groups = { Live: [], Today: [], Tomorrow: [], 'This week': [], Later: [] };
  const tw = addDays(startOfDay(now), 7);
  for (const o of occ) {
    if (now >= o.start && now < o.end) groups.Live.push(o);
    else if (sameDay(o.start, now)) groups.Today.push(o);
    else if (sameDay(o.start, addDays(now, 1))) groups.Tomorrow.push(o);
    else if (o.start < tw) groups['This week'].push(o);
    else groups.Later.push(o);
  }
  let html = '';
  for (const [label, items] of Object.entries(groups)) {
    if (!items.length) continue;
    html += `<div class="section-label">${label} <span class="sub">· ${items.length}</span></div>`;
    html += items.map(occCard).join('');
  }
  el.innerHTML = html;
}

function emptyState(big, h, p) {
  return `<div class="empty"><div class="big">${big}</div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;
}

/* -------------------------------- calendar ------------------------------- */
function renderCalendar() {
  const el = $('#view-calendar');
  const now = new Date();
  if (!state.ui.calMonth) state.ui.calMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [y, m] = state.ui.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m - 1, daysInMonth, 23, 59, 59);
  const occ = occurrences(monthStart, monthEnd, { filter: state.ui.filter, search: state.ui.search });
  const byDay = {};
  for (const o of occ) { const k = o.start.getDate(); (byDay[k] = byDay[k] || []).push(o); }

  let cells = '';
  for (let i = 0; i < startPad; i++) cells += `<div class="cal-cell out"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const items = byDay[d] || [];
    const isToday = now.getFullYear() === y && now.getMonth() === m - 1 && now.getDate() === d;
    const dots = [...new Set(items.map((o) => catById(o.ev.categoryId).color))].slice(0, 4)
      .map((col) => `<span class="d" style="background:${col}"></span>`).join('');
    cells += `<div class="cal-cell ${isToday?'today':''} ${items.length?'has':''}" data-cal-day="${d}">
      <span class="n">${d}</span><div class="cal-dots">${dots}</div></div>`;
  }

  el.innerHTML = `
    <div class="cal-head">
      <div class="cal-title">${MON[m-1]} ${y}</div>
      <div class="cal-nav">
        <button class="icon-btn" data-cal-nav="-1" aria-label="Previous month"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button class="icon-btn" data-cal-nav="today" aria-label="Today"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg></button>
        <button class="icon-btn" data-cal-nav="1" aria-label="Next month"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
    </div>
    <div class="cal-grid">${DOW.map((d) => `<div class="cal-dow">${d[0]}</div>`).join('')}${cells}</div>
    <div class="cal-selected-list" id="calSelected"></div>`;

  const today = now.getFullYear() === y && now.getMonth() === m - 1 ? now.getDate() : 1;
  showCalDay(today, byDay);
}

function showCalDay(day, byDay) {
  const box = $('#calSelected'); if (!box) return;
  const items = byDay[day] || [];
  const [y, m] = state.ui.calMonth.split('-').map(Number);
  const label = `${DOW[new Date(y, m-1, day).getDay()]}, ${MON_S[m-1]} ${day}`;
  box.innerHTML = `<div class="section-label">${label} <span class="sub">· ${items.length || 'nothing'}</span></div>` +
    (items.length ? items.map(occCard).join('') : `<p class="muted" style="padding:8px 2px">No events this day.</p>`);
}

/* ------------------------------- categories ------------------------------ */
function renderCategories() {
  const el = $('#view-categories');
  const now = new Date(); const to = addDays(now, HORIZON_DAYS);
  const counts = {};
  for (const ev of state.events) counts[ev.categoryId] = (counts[ev.categoryId] || 0) + expandEvent(ev, now, to).length;
  let html = `<div class="section-label">Categories <span class="sub">· ${state.categories.length}</span></div>`;
  for (const c of state.categories) {
    html += `<div class="cat-row" style="--cat-c:${c.color}">
      <div class="cat-swatch" style="background:${c.color}22;color:${c.color}">${esc(c.emoji)}</div>
      <div class="cat-info"><div class="nm">${esc(c.name)}</div><div class="ct">${counts[c.id]||0} upcoming</div></div>
      <div class="cat-actions">
        <button class="icon-btn" data-cat-edit="${c.id}" aria-label="Edit"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        <button class="icon-btn" data-cat-del="${c.id}" aria-label="Delete"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
      </div>
    </div>`;
  }
  html += `<button class="btn btn-surface btn-block" data-cat-edit="__new" style="margin-top:10px">+ New category</button>`;
  el.innerHTML = html;
}

/* -------------------------------- settings ------------------------------- */
function renderSettings() {
  const el = $('#view-settings');
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const trigSupported = 'Notification' in window && 'showTrigger' in (window.Notification.prototype || {});
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  const permPill = perm === 'granted' ? `<span class="pill-status on">On</span>`
    : perm === 'denied' ? `<span class="pill-status blocked">Blocked</span>`
    : perm === 'unsupported' ? `<span class="pill-status off">N/A</span>`
    : `<span class="pill-status off">Off</span>`;

  el.innerHTML = `
    <div class="settings-group">
      <h3>Notifications</h3>
      <div class="set-row">
        <div class="lbl"><span class="t">Push notifications ${permPill}</span><span class="s">In-app + scheduled alerts. ${perm==='denied'?'Enable in your browser/site settings.':''}</span></div>
        <button class="btn btn-sm" data-act="reqperm">${perm==='granted'?'Re-test':'Enable'}</button>
      </div>
      <div class="set-row tappable" data-act="defreminders">
        <div class="lbl"><span class="t">Default reminders</span><span class="s">${(state.settings.defaultReminders||[]).map(humanReminder).join(' · ')||'None'}</span></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      <div class="set-row">
        <div class="lbl"><span class="t">Send a test notification</span><span class="s">Check it reaches your phone.</span></div>
        <button class="btn btn-surface btn-sm" data-act="testnotif">Test</button>
      </div>
    </div>

    <div class="settings-group">
      <h3>On your iPhone — read this</h3>
      <div class="set-row" style="display:block">
        <div class="lbl">
          <span class="t">Two ways to get buzzed when Radar is closed</span>
          <span class="s" style="margin-top:6px;line-height:1.5">
            <b>1) Calendar alerts (works today):</b> open any event and tap <b>Add to Calendar</b>. iOS fires the alarm itself — reliable even when Radar is closed.<br><br>
            <b>2) Web Push:</b> tap the Share button in Safari → <b>Add to Home Screen</b>, open Radar from that icon, then enable notifications above. Background push also needs the push server (below) running.
          </span>
        </div>
      </div>
      <div class="set-row">
        <div class="lbl"><span class="t">Installed as an app</span><span class="s">${isStandalone?'Yes — you\'re good.':'Not yet — add to Home Screen for push.'}</span></div>
        <span class="pill-status ${isStandalone?'on':'off'}">${isStandalone?'Yes':'No'}</span>
      </div>
      <div class="set-row">
        <div class="lbl"><span class="t">Scheduled-while-closed API</span><span class="s">${trigSupported?'Supported on this device.':'Not on iOS — use calendar or push server.'}</span></div>
        <span class="pill-status ${trigSupported?'on':'off'}">${trigSupported?'Yes':'No'}</span>
      </div>
    </div>

    <div class="settings-group">
      <h3>Sources — auto-import schedules</h3>
      <div class="set-row tappable" data-act="discover">
        <div class="lbl"><span class="t">Add a source</span><span class="s">Pull a full F1 season, a team's games, or a calendar feed.</span></div>
        <button class="btn btn-sm">Browse</button>
      </div>
      ${(state.sources||[]).map((s) => `
        <div class="set-row">
          <div class="lbl"><span class="t">${esc(s.label)}</span><span class="s">${s.count||0} events · ${s.lastSync?('synced '+timeAgo(s.lastSync)):'never synced'}</span></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-surface btn-sm" data-act="syncsource" data-id="${s.id}">Sync</button>
            <button class="btn btn-danger btn-sm" data-act="delsource" data-id="${s.id}">Remove</button>
          </div>
        </div>`).join('')}
      <div class="set-row tappable" data-act="sportsdbkey">
        <div class="lbl"><span class="t">TheSportsDB API key</span><span class="s">Using "${esc(state.settings.sportsdbKey||'3')}". Free key works; a paid key removes limits.</span></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>

    <div class="settings-group">
      <h3>Web Push server (optional, advanced)</h3>
      <div class="set-row tappable" data-act="pushcfg">
        <div class="lbl"><span class="t">Push server & VAPID key</span><span class="s">${state.settings.vapidPublicKey?'Configured':'Not set — background push off'}</span></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>

    <div class="settings-group">
      <h3>Appearance & data</h3>
      <div class="set-row">
        <div class="lbl"><span class="t">Theme</span><span class="s">Light or dark.</span></div>
        <div class="seg" style="width:170px">
          <button data-act="theme" data-v="dark" class="${state.settings.theme==='dark'?'on':''}">Dark</button>
          <button data-act="theme" data-v="light" class="${state.settings.theme==='light'?'on':''}">Light</button>
        </div>
      </div>
      <div class="set-row"><div class="lbl"><span class="t">Export data</span><span class="s">Back up everything as a file.</span></div><button class="btn btn-surface btn-sm" data-act="export">Export</button></div>
      <div class="set-row"><div class="lbl"><span class="t">Import data</span><span class="s">Restore from a backup file.</span></div><button class="btn btn-surface btn-sm" data-act="import">Import</button></div>
      <div class="set-row"><div class="lbl"><span class="t">Export all to Calendar</span><span class="s">One .ics with alarms for Apple Calendar.</span></div><button class="btn btn-surface btn-sm" data-act="icsall">.ics</button></div>
      <div class="set-row"><div class="lbl"><span class="t">Reset everything</span><span class="s">Wipe all data on this device.</span></div><button class="btn btn-danger btn-sm" data-act="reset">Reset</button></div>
    </div>

    <div class="app-foot">Radar · your data stays on this device.<br>No account, no subscription.</div>`;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

/* =========================================================================
   MODALS
   ========================================================================= */
function openModal(html) {
  const host = $('#modalHost');
  host.hidden = false;
  host.innerHTML = `<div class="modal-backdrop" data-close-modal></div><div class="modal" role="dialog" aria-modal="true"><div class="modal-grip"></div>${html}</div>`;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  const host = $('#modalHost');
  host.hidden = true; host.innerHTML = '';
  document.body.style.overflow = '';
}

/* ---- add / edit event ---- */
let editorDraft = null;
function openEventEditor(ev) {
  const isNew = !ev;
  const now = new Date();
  const def = { id: null, title: '', categoryId: state.ui.filter !== 'all' ? state.ui.filter : 'personal',
    start: toLocalInput(new Date(now.getTime() + 3600000)).slice(0,16), allDay: false, durationMin: 120,
    location: '', note: '', url: '', freq: 'none', reminders: [...(state.settings.defaultReminders||[])] };
  editorDraft = ev ? { ...def, ...ev, reminders: [...(ev.reminders||[])] } : def;
  const d = editorDraft;
  const dt = d.start.length >= 16 ? d.start : (d.start + 'T12:00');
  const [datePart, timePart] = dt.split('T');

  const catOpts = state.categories.map((c) =>
    `<button type="button" class="opt ${d.categoryId===c.id?'on':''}" data-pick-cat="${c.id}" style="--opt-c:${c.color}"><span class="dot" style="background:${c.color}"></span>${esc(c.emoji)} ${esc(c.name)}</button>`).join('');
  const freqs = [['none','Once'],['daily','Daily'],['weekly','Weekly'],['biweekly','2 weeks'],['monthly','Monthly']];

  openModal(`
    <div class="modal-head"><h2>${isNew?'Track something':'Edit'}</h2><button class="icon-btn" data-close-modal>✕</button></div>
    <form id="evForm">
      <div class="field"><label>What is it?</label><input type="text" id="f-title" value="${esc(d.title)}" placeholder="e.g. British Grand Prix" autofocus /></div>
      <div class="field"><label>Category</label><div class="chip-select" id="f-cat">${catOpts}</div></div>
      <div class="field-row">
        <div class="field"><label>Date</label><input type="date" id="f-date" value="${datePart}" /></div>
        <div class="field" id="timeWrap" ${d.allDay?'style="display:none"':''}><label>Time</label><input type="time" id="f-time" value="${timePart||'12:00'}" /></div>
      </div>
      <div class="field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="f-allday" ${d.allDay?'checked':''} style="width:auto"> All-day</label></div>
      <div class="field"><label>Repeats</label><div class="seg" id="f-freq">${freqs.map(([v,l])=>`<button type="button" data-freq="${v}" class="${d.freq===v?'on':''}">${l}</button>`).join('')}</div></div>
      <div class="field"><label>Reminders</label><div class="reminder-list" id="f-reminders"></div>
        <div class="reminder-add">
          <div class="field" style="flex:1"><select id="f-rem-preset">${REMINDER_PRESETS.map(r=>`<option value="${r.min}">${r.label}</option>`).join('')}<option value="custom">Custom…</option></select></div>
          <button type="button" class="btn btn-surface btn-sm" data-add-reminder>Add</button>
        </div>
        <div class="hint">iOS won't alert when Radar is closed — use "Add to Calendar" on the event for a reliable alarm.</div>
      </div>
      <div class="field-row">
        <div class="field"><label>Location <span class="muted">(optional)</span></label><input type="text" id="f-loc" value="${esc(d.location)}" placeholder="Silverstone" /></div>
      </div>
      <div class="field"><label>Link <span class="muted">(optional)</span></label><input type="text" id="f-url" value="${esc(d.url)}" placeholder="Where to watch / buy" /></div>
      <div class="field"><label>Notes <span class="muted">(optional)</span></label><textarea id="f-note" placeholder="Anything to remember">${esc(d.note)}</textarea></div>
      <div class="modal-actions">
        ${!isNew?'<button type="button" class="btn btn-danger" data-del-event>Delete</button>':''}
        <button type="submit" class="btn">${isNew?'Add to Radar':'Save'}</button>
      </div>
    </form>`);
  renderReminderList();
}

function renderReminderList() {
  const box = $('#f-reminders'); if (!box) return;
  const rs = [...new Set(editorDraft.reminders)].sort((a,b)=>a-b);
  editorDraft.reminders = rs;
  box.innerHTML = rs.length ? rs.map((m) =>
    `<div class="reminder-item"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/></svg>${humanReminder(m)}<button type="button" class="rm" data-rm-reminder="${m}">✕</button></div>`
  ).join('') : `<p class="muted" style="font-size:12.5px">No reminders. Add one below.</p>`;
}

/* ---- event detail ---- */
function openEventDetail(evId, occIso) {
  const ev = state.events.find((e) => e.id === evId); if (!ev) return;
  const c = catById(ev.categoryId);
  const start = occIso ? new Date(occIso) : toDate(ev.start);
  const dur = ev.allDay ? 1440 : (ev.durationMin || 120);
  const end = new Date(start.getTime() + dur * 60000);
  const diff = start.getTime() - Date.now();
  const cd = diff > 0 ? humanCountdown(diff) : (Date.now() < end.getTime() ? 'LIVE NOW' : 'Passed');
  const whenStr = ev.allDay
    ? `${DOW[start.getDay()]}, ${MON[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()} · All day`
    : `${DOW[start.getDay()]}, ${MON[start.getMonth()]} ${start.getDate()} · ${fmtTime(start)}`;

  const rows = [];
  rows.push(['Category', `${c.emoji} ${esc(c.name)}`]);
  rows.push(['When', esc(whenStr)]);
  if (ev.freq && ev.freq !== 'none') rows.push(['Repeats', esc(ev.freq)]);
  if (ev.location) rows.push(['Location', esc(ev.location)]);
  if (ev.reminders && ev.reminders.length) rows.push(['Reminders', ev.reminders.map(humanReminder).join(', ')]);
  if (ev.url) rows.push(['Link', `<a href="${esc(ev.url)}" target="_blank" rel="noopener">Open ↗</a>`]);
  if (ev.source) rows.push(['Source', esc(ev.source.label || ev.source.provider)]);

  openModal(`
    <div class="modal-head"><h2>Details</h2><button class="icon-btn" data-close-modal>✕</button></div>
    <div class="detail-hero">
      <div class="detail-emoji" style="background:${c.color}22;color:${c.color}">${esc(c.emoji)}</div>
      <div><div class="detail-title">${esc(ev.title)}</div><div class="detail-when">${esc(whenStr)}</div></div>
    </div>
    <div class="detail-countdown"><div class="big">${cd}</div><div class="lbl">${diff>0?'until start':''}</div></div>
    ${ev.note ? `<p style="color:var(--text-2);font-size:14px">${esc(ev.note)}</p>` : ''}
    <div class="detail-meta-list">${rows.map(([k,v])=>`<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
    <div class="modal-actions">
      <button class="btn btn-surface" data-ics-one="${esc(ev.id)}" data-occ="${start.toISOString()}">📅 Add to Calendar</button>
      <button class="btn" data-edit-event="${esc(ev.id)}">Edit</button>
    </div>`);
}

/* ---- category editor ---- */
function openCategoryEditor(catId) {
  const isNew = catId === '__new';
  const c = isNew ? { id: null, name: '', emoji: '📌', color: PALETTE[5] } : catById(catId);
  openModal(`
    <div class="modal-head"><h2>${isNew?'New category':'Edit category'}</h2><button class="icon-btn" data-close-modal>✕</button></div>
    <form id="catForm" data-cat="${isNew?'':esc(c.id)}">
      <div class="field"><label>Name</label><input type="text" id="c-name" value="${esc(c.name)}" placeholder="e.g. Basketball" autofocus /></div>
      <div class="field"><label>Icon</label><div class="emoji-grid" id="c-emoji">${EMOJIS.map(e=>`<button type="button" class="emoji-opt ${c.emoji===e?'on':''}" data-emoji="${e}">${e}</button>`).join('')}</div></div>
      <div class="field"><label>Color</label><div class="color-grid" id="c-color">${PALETTE.map(p=>`<button type="button" class="color-dot ${c.color===p?'on':''}" data-color="${p}" style="background:${p}"></button>`).join('')}</div></div>
      <div class="modal-actions"><button type="submit" class="btn btn-block">${isNew?'Create':'Save'}</button></div>
    </form>`);
}

/* ---- discover sources ---- */
function openDiscover() {
  openModal(`
    <div class="modal-head"><h2>Add a source</h2><button class="icon-btn" data-close-modal>✕</button></div>
    <div class="seg" id="src-tabs" style="margin-bottom:14px">
      <button data-src-tab="f1" class="on">🏎️ F1 season</button>
      <button data-src-tab="team">🔎 Team</button>
      <button data-src-tab="ics">📅 Feed</button>
    </div>
    <div id="src-body"></div>`);
  showDiscoverTab('f1');
}

function showDiscoverTab(tab) {
  $$('#src-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.srcTab === tab));
  const body = $('#src-body');
  if (tab === 'f1') {
    body.innerHTML = `
      <p class="muted" style="font-size:13.5px;margin:0 0 12px">Imports the current Formula 1 calendar — every Grand Prix, qualifying and sprint — with times in your local zone. Auto-updates when you sync.</p>
      <button class="btn btn-block" data-import-f1>Import F1 season</button>`;
  } else if (tab === 'team') {
    body.innerHTML = `
      <div class="field"><label>Search a team or club</label><input type="text" id="src-team-q" placeholder="e.g. Boston Bruins, Maple Leafs, Lakers" /></div>
      <button class="btn btn-block" data-search-team>Search</button>
      <div id="src-results" style="margin-top:14px"></div>
      <p class="hint" style="margin-top:10px">Powered by TheSportsDB. Great for NHL, NBA, soccer and more. Pulls each team's next fixtures.</p>`;
  } else {
    body.innerHTML = `
      <div class="field"><label>Calendar feed URL (.ics / webcal)</label><input type="text" id="src-ics-url" placeholder="https://…/schedule.ics" /></div>
      <div class="field"><label>Name it</label><input type="text" id="src-ics-name" placeholder="My league schedule" /></div>
      <div class="field"><label>Category</label><select id="src-ics-cat">${state.categories.map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div>
      <button class="btn btn-block" data-import-ics>Subscribe & import</button>
      <p class="hint" style="margin-top:10px">Many leagues and teams publish an .ics link. Some block browser access (CORS) — if it fails, that feed needs the push server to proxy it.</p>`;
  }
}

/* =========================================================================
   SOURCES / API IMPORT
   ========================================================================= */
async function importF1() {
  toast('Fetching F1 calendar…');
  try {
    const res = await fetch('https://api.jolpi.ca/ergast/f1/current.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const races = data?.MRData?.RaceTable?.Races || [];
    if (!races.length) throw new Error('No races returned');
    ensureCategory('f1', 'Formula 1', '🏎️', '#ff5d6c');
    const src = upsertSource({ id: 'f1-season', provider: 'f1', label: 'Formula 1 — season' });
    let n = 0;
    const sessions = [
      ['', 'date', 'time'],
      ['Qualifying', 'Qualifying', null],
      ['Sprint', 'Sprint', null],
    ];
    for (const r of races) {
      // main race
      n += addManagedEvent({
        source: src, extId: 'f1-' + r.round + '-race',
        title: `${r.raceName}`, categoryId: 'f1',
        start: utcToLocalInput(r.date, r.time), location: r.Circuit?.circuitName || '',
        url: r.url || '', durationMin: 120,
        note: `Round ${r.round} · ${r.Circuit?.Location?.locality||''}, ${r.Circuit?.Location?.country||''}`.trim(),
      });
      if (r.Qualifying?.date) n += addManagedEvent({ source: src, extId: 'f1-'+r.round+'-qual', title: `${shortGp(r.raceName)} — Qualifying`, categoryId: 'f1', start: utcToLocalInput(r.Qualifying.date, r.Qualifying.time), location: r.Circuit?.circuitName||'', durationMin: 60 });
      if (r.Sprint?.date) n += addManagedEvent({ source: src, extId: 'f1-'+r.round+'-sprint', title: `${shortGp(r.raceName)} — Sprint`, categoryId: 'f1', start: utcToLocalInput(r.Sprint.date, r.Sprint.time), location: r.Circuit?.circuitName||'', durationMin: 60 });
    }
    src.count = state.events.filter((e) => e.source && e.source.id === src.id).length;
    src.lastSync = Date.now();
    save(); reschedule(); render();
    toast(`Imported ${races.length} F1 rounds`, 'ok');
    closeModal();
  } catch (e) {
    toast('F1 import failed: ' + e.message, 'err');
  }
}
function shortGp(name) { return name.replace(/ Grand Prix$/,''); }

async function searchTeam() {
  const q = ($('#src-team-q')?.value || '').trim();
  if (!q) return;
  const box = $('#src-results'); box.innerHTML = `<p class="muted">Searching…</p>`;
  try {
    const key = state.settings.sportsdbKey || '3';
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/searchteams.php?t=${encodeURIComponent(q)}`);
    const data = await res.json();
    const teams = (data.teams || []).slice(0, 8);
    if (!teams.length) { box.innerHTML = `<p class="muted">No teams found. Try the full club name.</p>`; return; }
    box.innerHTML = teams.map((t) =>
      `<div class="cat-row"><div class="cat-swatch" style="background:#5b8cff22;color:#5b8cff">${(t.strSport||'?')[0]}</div>
        <div class="cat-info"><div class="nm">${esc(t.strTeam)}</div><div class="ct">${esc(t.strSport||'')} · ${esc(t.strLeague||'')}</div></div>
        <button class="btn btn-sm" data-add-team="${esc(t.idTeam)}" data-name="${esc(t.strTeam)}" data-sport="${esc(t.strSport||'')}">Track</button></div>`).join('');
  } catch (e) {
    box.innerHTML = `<p class="muted">Search failed (${esc(e.message)}). The service may be rate-limiting the free key.</p>`;
  }
}

async function addTeamSource(teamId, name, sport) {
  toast(`Fetching ${name} fixtures…`);
  try {
    const key = state.settings.sportsdbKey || '3';
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsnext.php?id=${encodeURIComponent(teamId)}`);
    const data = await res.json();
    const events = data.events || [];
    const catId = guessCategoryForSport(sport, name);
    const src = upsertSource({ id: 'team-' + teamId, provider: 'sportsdb', label: name + ' — fixtures', params: { teamId, name, sport } });
    let n = 0;
    for (const ev of events) {
      const start = sportsdbStart(ev);
      if (!start) continue;
      n += addManagedEvent({
        source: src, extId: 'sdb-' + ev.idEvent,
        title: ev.strEvent || `${ev.strHomeTeam} vs ${ev.strAwayTeam}`,
        categoryId: catId, start, location: ev.strVenue || '',
        durationMin: 150, note: ev.strLeague || '',
      });
    }
    src.count = state.events.filter((e) => e.source && e.source.id === src.id).length;
    src.lastSync = Date.now();
    save(); reschedule(); render();
    toast(events.length ? `Added ${events.length} ${name} fixtures` : `Subscribed — no upcoming fixtures listed yet`, 'ok');
    closeModal();
  } catch (e) {
    toast('Failed: ' + e.message, 'err');
  }
}
function sportsdbStart(ev) {
  if (ev.strTimestamp) { const d = new Date(ev.strTimestamp); if (!isNaN(d)) return toLocalInput(d); }
  if (ev.dateEvent) return utcToLocalInput(ev.dateEvent, ev.strTime || '00:00');
  return null;
}
function guessCategoryForSport(sport, name) {
  const s = (sport || '').toLowerCase(); const nm = (name || '').toLowerCase();
  if (s.includes('ice hockey') || nm.includes('nhl')) return ensureCategory('nhl','NHL','🏒','#5b8cff');
  if (s.includes('tennis')) return ensureCategory('tennis','Tennis','🎾','#35d0a0');
  if (s.includes('motorsport') || s.includes('racing')) return ensureCategory('racing','Racing','🏆','#ffbf3c');
  if (s.includes('basketball')) return ensureCategory('nba','Basketball','🏀','#ff8f3e');
  if (s.includes('soccer') || s.includes('football')) return ensureCategory('soccer','Soccer','⚽','#35d0a0');
  return ensureCategory('sports','Sports','🏆','#5b8cff');
}

async function importIcsFeed() {
  const url = ($('#src-ics-url')?.value || '').trim();
  const name = ($('#src-ics-name')?.value || '').trim() || 'Calendar feed';
  const catId = $('#src-ics-cat')?.value || 'personal';
  if (!url) return;
  toast('Fetching feed…');
  try {
    const fetchUrl = url.replace(/^webcal:/i, 'https:');
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const items = parseICS(text);
    if (!items.length) throw new Error('No events found in feed');
    const src = upsertSource({ id: 'ics-' + uid(), provider: 'ics', label: name, params: { url, catId } });
    let n = 0;
    for (const it of items) {
      n += addManagedEvent({ source: src, extId: 'ics-' + (it.uid || it.start + it.title), title: it.title, categoryId: catId, start: it.start, durationMin: it.durationMin || 120, location: it.location || '', note: it.desc || '' });
    }
    src.count = state.events.filter((e) => e.source && e.source.id === src.id).length;
    src.lastSync = Date.now();
    save(); reschedule(); render();
    toast(`Imported ${n} events from feed`, 'ok');
    closeModal();
  } catch (e) {
    toast('Feed failed: ' + e.message + ' (CORS blocked feeds need the push server)', 'err');
  }
}

function parseICS(text) {
  const out = [];
  const unfold = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const blocks = unfold.split('BEGIN:VEVENT').slice(1);
  for (const b of blocks) {
    const body = b.split('END:VEVENT')[0];
    const get = (k) => { const m = body.match(new RegExp('^' + k + '[^:\\n]*:(.*)$', 'm')); return m ? m[1].trim() : ''; };
    const start = parseIcsDate(get('DTSTART'));
    const end = parseIcsDate(get('DTEND'));
    if (!start) continue;
    out.push({
      uid: get('UID'), title: get('SUMMARY') || 'Event', location: get('LOCATION'),
      desc: get('DESCRIPTION').replace(/\\n/g, ' ').slice(0, 200), start,
      durationMin: end ? Math.max(30, Math.round((new Date(end) - new Date(start)) / 60000)) : 120,
    });
  }
  return out;
}
function parseIcsDate(v) {
  if (!v) return null;
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  if (z) { const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)); return toLocalInput(dt); }
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

/* source helpers */
function upsertSource(s) {
  let ex = state.sources.find((x) => x.id === s.id);
  if (ex) { Object.assign(ex, s); return ex; }
  ex = { count: 0, lastSync: null, ...s };
  state.sources.push(ex);
  return ex;
}
function addManagedEvent({ source, extId, title, categoryId, start, durationMin, location, note, url }) {
  if (!start) return 0;
  const existing = state.events.find((e) => e.source && e.source.extId === extId);
  const payload = {
    title, categoryId, start, durationMin: durationMin || 120, allDay: false,
    location: location || '', note: note || '', url: url || '', freq: 'none',
    source: { id: source.id, provider: source.provider, label: source.label, extId },
  };
  if (existing) {
    // preserve user's reminders + edits to reminders; refresh schedule/title
    Object.assign(existing, payload, { reminders: existing.reminders });
    return 0;
  }
  state.events.push({ id: uid(), reminders: [...(state.settings.defaultReminders || [])], ...payload });
  return 1;
}
function ensureCategory(id, name, emoji, color) {
  if (!state.categories.find((c) => c.id === id)) state.categories.push({ id, name, emoji, color });
  return id;
}
async function syncSource(id) {
  const s = state.sources.find((x) => x.id === id); if (!s) return;
  toast('Syncing ' + s.label + '…');
  if (s.provider === 'f1') return importF1();
  if (s.provider === 'sportsdb') return addTeamSource(s.params.teamId, s.params.name, s.params.sport);
  toast('Auto-sync for this source needs the push server.', 'err');
}

/* =========================================================================
   NOTIFICATIONS
   ========================================================================= */
async function ensureSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('./sw.js'); }
  catch (e) { return null; }
}
async function requestPermission() {
  if (!('Notification' in window)) { toast('This browser has no notifications. Use Add to Calendar.', 'err'); return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') {
    state.settings.notifEnabled = true; save();
    toast('Notifications on', 'ok');
    await ensureSW(); reschedule(); render();
  } else if (p === 'denied') {
    toast('Blocked. Enable in Safari → site settings, or use Add to Calendar.', 'err');
    render();
  }
}
async function testNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') { await requestPermission(); if (Notification.permission!=='granted') return; }
  const reg = await ensureSW();
  const opts = { body: 'This is what a Radar alert looks like. 📡', icon: './icon.svg', badge: './icon.svg', tag: 'radar-test' };
  if (reg) reg.showNotification('Radar test', opts); else new Notification('Radar test', opts);
  toast('Sent — check your notifications', 'ok');
}

/* Rebuild the reminder schedule from scratch. */
async function reschedule() {
  pendingTimers.forEach(clearTimeout); pendingTimers.length = 0;
  if (!state.settings.notifEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null;
  const canTrigger = 'Notification' in window && 'showTrigger' in (Notification.prototype || {});
  if (canTrigger && reg && reg.active) reg.active.postMessage({ type: 'clearScheduled', prefix: '§' });

  const now = Date.now();
  const from = new Date(now - MISS_GRACE_MIN * 60000);
  const to = addDays(new Date(now), NOTIFY_HORIZON_DAYS);
  const occ = occurrences(from, to);
  const soon = [];
  for (const o of occ) {
    const c = catById(o.ev.categoryId);
    for (const min of (o.ev.reminders || [])) {
      const fireAt = o.start.getTime() - min * 60000;
      const key = '§' + o.key + '#' + min;
      const title = `${c.emoji} ${o.ev.title}`;
      const body = min === 0 ? 'Starting now' : `Starts in ${humanReminder(min).replace(' before','')}` + (o.ev.location ? ` · ${o.ev.location}` : '');
      if (fireAt <= now) {
        // missed — deliver once if recent and event not long past
        if (!state.delivered[key] && (now - fireAt) < MISS_GRACE_MIN * 60000 && o.start.getTime() > now - LIVE_WINDOW_MIN * 60000) {
          deliver(reg, title, body, key, o.ev.url);
        }
        continue;
      }
      if (state.delivered[key]) continue;
      if (canTrigger && reg && reg.active) {
        reg.active.postMessage({ type: 'schedule', title, timestamp: fireAt, options: { body, tag: key, data: { url: o.ev.url || './index.html' } } });
      }
      // belt-and-suspenders for near-term while app stays open
      if (fireAt - now < 24 * 3600 * 1000) soon.push({ fireAt, title, body, key, url: o.ev.url });
    }
  }
  // in-app timers (fire while the tab/PWA is open)
  for (const s of soon) {
    const delay = s.fireAt - Date.now();
    if (delay <= 0) continue;
    const h = setTimeout(() => { if (!state.delivered[s.key]) deliver(reg, s.title, s.body, s.key, s.url); }, Math.min(delay, 2 ** 31 - 1));
    pendingTimers.push(h);
  }
  save();
}
async function deliver(reg, title, body, key, url) {
  const opts = { body, icon: './icon.svg', badge: './icon.svg', tag: key, data: { url: url || './index.html' } };
  try {
    const r = reg || (('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null);
    if (r) r.showNotification(title, opts); else if (Notification.permission === 'granted') new Notification(title, opts);
  } catch (e) {}
  state.delivered[key] = true; save();
}

/* prune delivered keys for events long gone (keeps storage small) */
function pruneDelivered() {
  const keep = {};
  const now = Date.now();
  for (const k in state.delivered) {
    const m = k.match(/@(.+?)#/); if (!m) continue;
    if (new Date(m[1]).getTime() > now - 3 * 86400000) keep[k] = true;
  }
  state.delivered = keep;
}

/* =========================================================================
   WEB PUSH (optional — requires the push server)
   ========================================================================= */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function subscribePush() {
  const key = state.settings.vapidPublicKey.trim();
  const server = state.settings.pushServerUrl.trim();
  if (!key || !server) { toast('Set VAPID key and server URL first', 'err'); return; }
  try {
    const reg = await ensureSW();
    if (Notification.permission !== 'granted') { await requestPermission(); if (Notification.permission !== 'granted') return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const res = await fetch(server.replace(/\/$/, '') + '/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, events: exportPayload() }),
    });
    if (!res.ok) throw new Error('server ' + res.status);
    toast('Subscribed to background push', 'ok');
  } catch (e) { toast('Push subscribe failed: ' + e.message, 'err'); }
}

/* =========================================================================
   ICS EXPORT (the reliable iOS path)
   ========================================================================= */
function icsEscape(s) { return String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n'); }
function icsStamp(d) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; }
function icsLocal(d) { return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; }
const FREQ_MAP = { daily: 'DAILY', weekly: 'WEEKLY', biweekly: 'WEEKLY;INTERVAL=2', monthly: 'MONTHLY' };

function eventToVEVENT(ev, forcedStart) {
  const c = catById(ev.categoryId);
  const start = forcedStart ? new Date(forcedStart) : toDate(ev.start);
  const dur = ev.allDay ? 1440 : (ev.durationMin || 120);
  const end = new Date(start.getTime() + dur * 60000);
  const lines = ['BEGIN:VEVENT', `UID:${ev.id}-${start.getTime()}@radar`, `DTSTAMP:${icsStamp(new Date())}`];
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${start.getFullYear()}${pad(start.getMonth()+1)}${pad(start.getDate())}`);
  } else {
    lines.push(`DTSTART:${icsLocal(start)}`, `DTEND:${icsLocal(end)}`);
  }
  lines.push(`SUMMARY:${icsEscape(c.emoji + ' ' + ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  const desc = [ev.note, ev.url ? 'Link: ' + ev.url : '', 'Tracked in Radar · ' + c.name].filter(Boolean).join('\\n');
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  if (ev.freq && ev.freq !== 'none' && !forcedStart) lines.push(`RRULE:FREQ=${FREQ_MAP[ev.freq] || 'WEEKLY'}`);
  for (const min of (ev.reminders || [])) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${min}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}
function buildICS(events, forcedStart) {
  const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Radar//Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const body = events.map((e) => eventToVEVENT(e, events.length === 1 ? forcedStart : null));
  return head.concat(body).concat(['END:VCALENDAR']).join('\r\n');
}
function downloadICS(events, filename, forcedStart) {
  const ics = buildICS(events, forcedStart);
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* =========================================================================
   EXPORT / IMPORT
   ========================================================================= */
function exportPayload() {
  return { version: 1, exportedAt: new Date().toISOString(), categories: state.categories, events: state.events, sources: state.sources, settings: state.settings };
}
function exportData() {
  const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'radar-backup-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Exported', 'ok');
}
function importData() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data.events) throw new Error('Not a Radar backup');
        state.categories = data.categories || state.categories;
        state.events = data.events || [];
        state.sources = data.sources || [];
        state.settings = { ...state.settings, ...(data.settings || {}) };
        save(); reschedule(); render();
        toast('Imported ' + state.events.length + ' events', 'ok');
      } catch (e) { toast('Import failed: ' + e.message, 'err'); }
    };
    r.readAsText(f);
  };
  inp.click();
}

/* =========================================================================
   TOASTS
   ========================================================================= */
function toast(msg, kind = '', actionLabel, actionFn) {
  const host = $('#toastHost');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = esc(msg) + (actionLabel ? ` <button>${esc(actionLabel)}</button>` : '');
  if (actionLabel && actionFn) el.querySelector('button').onclick = () => { actionFn(); el.remove(); };
  host.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, actionLabel ? 6000 : 2600);
}
function updateNotifDot() {
  const on = state.settings.notifEnabled && 'Notification' in window && Notification.permission === 'granted';
  $('#notifDot').hidden = on;
}
function renderPermBanner() {
  const show = !state.settings.permBannerDismissed && !state.settings.notifEnabled &&
    'Notification' in window && Notification.permission === 'default' && state.events.length > 0;
  $('#permBanner').hidden = !show;
}

/* =========================================================================
   COUNTDOWN TICKER
   ========================================================================= */
function tick() {
  const now = Date.now();
  $$('.card-countdown').forEach((el) => {
    const start = +el.dataset.cd; const end = +el.dataset.end;
    if (now >= start && now < end) { el.textContent = 'LIVE'; el.className = 'card-countdown live'; el.closest('.card')?.classList.add('live'); }
    else if (now >= end) { el.textContent = 'ended'; el.className = 'card-countdown'; }
    else {
      el.textContent = humanCountdown(start - now);
      el.className = 'card-countdown' + ((start - now) < 3600000 ? ' soon' : '');
    }
  });
  $$('.detail-countdown .big').forEach(() => {}); // detail is static per open
}

/* =========================================================================
   EVENT WIRING
   ========================================================================= */
function goto(view) { state.ui.view = view; save(); render(); window.scrollTo({ top: 0 }); }

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-goto],[data-filter],[data-open],[data-close-modal],[data-cat-edit],[data-cat-del],[data-act],[data-cal-nav],[data-cal-day],[data-pick-cat],[data-freq],[data-add-reminder],[data-rm-reminder],[data-del-event],[data-edit-event],[data-emoji],[data-color],[data-src-tab],[data-import-f1],[data-search-team],[data-add-team],[data-import-ics],[data-syncsource],[data-ics-one],[data-def-rem],[data-save-def]');
  if (!t) return;

  if (t.dataset.defRem != null) { const m = +t.dataset.defRem; if (defRemDraft.has(m)) defRemDraft.delete(m); else defRemDraft.add(m); t.classList.toggle('on'); return; }
  if (t.hasAttribute('data-save-def')) { state.settings.defaultReminders = [...defRemDraft].sort((a,b)=>a-b); save(); reschedule(); closeModal(); render(); return; }

  if (t.dataset.goto) return goto(t.dataset.goto);
  if (t.dataset.filter) { state.ui.filter = t.dataset.filter; save(); render(); return; }
  if (t.hasAttribute('data-close-modal')) return closeModal();
  if (t.dataset.open) return openEventDetail(t.dataset.open, t.dataset.occ);
  if (t.dataset.editEvent) { const ev = state.events.find((x) => x.id === t.dataset.editEvent); closeModal(); openEventEditor(ev); return; }

  // calendar
  if (t.dataset.calNav) {
    const [y, m] = state.ui.calMonth.split('-').map(Number);
    if (t.dataset.calNav === 'today') { const n = new Date(); state.ui.calMonth = `${n.getFullYear()}-${pad(n.getMonth()+1)}`; }
    else { const d = new Date(y, m - 1 + (+t.dataset.calNav), 1); state.ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
    save(); renderCalendar(); return;
  }
  if (t.dataset.calDay) {
    const [y, m] = state.ui.calMonth.split('-').map(Number);
    const occ = occurrences(new Date(y, m-1, 1), new Date(y, m-1, +t.dataset.calDay, 23, 59, 59), { filter: state.ui.filter, search: state.ui.search });
    const byDay = {}; occ.forEach((o) => { const k = o.start.getDate(); (byDay[k]=byDay[k]||[]).push(o); });
    $$('.cal-cell').forEach((c) => c.style.outline = '');
    t.style.outline = '2px solid var(--accent)';
    showCalDay(+t.dataset.calDay, byDay); return;
  }

  // categories
  if (t.dataset.catEdit) return openCategoryEditor(t.dataset.catEdit);
  if (t.dataset.catDel) return deleteCategory(t.dataset.catDel);

  // editor internals
  if (t.dataset.pickCat) { editorDraft.categoryId = t.dataset.pickCat; $$('#f-cat .opt').forEach((o) => o.classList.toggle('on', o.dataset.pickCat === t.dataset.pickCat)); return; }
  if (t.dataset.freq) { editorDraft.freq = t.dataset.freq; $$('#f-freq button').forEach((b) => b.classList.toggle('on', b.dataset.freq === t.dataset.freq)); return; }
  if (t.hasAttribute('data-add-reminder')) {
    const sel = $('#f-rem-preset');
    if (sel.value === 'custom') { const v = prompt('Minutes before start?', '15'); if (v && !isNaN(+v)) editorDraft.reminders.push(Math.max(0, Math.round(+v))); }
    else editorDraft.reminders.push(+sel.value);
    renderReminderList(); return;
  }
  if (t.dataset.rmReminder != null) { editorDraft.reminders = editorDraft.reminders.filter((m) => m != t.dataset.rmReminder); renderReminderList(); return; }
  if (t.hasAttribute('data-del-event')) return deleteEvent(editorDraft.id);

  // category editor internals
  if (t.dataset.emoji) { $$('#c-emoji .emoji-opt').forEach((x) => x.classList.remove('on')); t.classList.add('on'); return; }
  if (t.dataset.color) { $$('#c-color .color-dot').forEach((x) => x.classList.remove('on')); t.classList.add('on'); return; }

  // discover
  if (t.dataset.srcTab) return showDiscoverTab(t.dataset.srcTab);
  if (t.hasAttribute('data-import-f1')) return importF1();
  if (t.hasAttribute('data-search-team')) return searchTeam();
  if (t.dataset.addTeam) return addTeamSource(t.dataset.addTeam, t.dataset.name, t.dataset.sport);
  if (t.hasAttribute('data-import-ics')) return importIcsFeed();

  // ics
  if (t.dataset.icsOne) {
    const ev = state.events.find((x) => x.id === t.dataset.icsOne);
    if (ev) { downloadICS([ev], (ev.title||'event').replace(/[^\w]+/g,'-') + '.ics', t.dataset.occ); toast('Opening in Calendar…', 'ok'); }
    return;
  }

  // settings actions
  if (t.dataset.act) return handleSettingAction(t.dataset.act, t);
});

async function handleSettingAction(act, t) {
  switch (act) {
    case 'reqperm': return requestPermission();
    case 'testnotif': return testNotification();
    case 'theme': state.settings.theme = t.dataset.v; save(); render(); return;
    case 'export': return exportData();
    case 'import': return importData();
    case 'icsall':
      if (!state.events.length) return toast('Nothing to export', 'err');
      downloadICS(state.events, 'radar-all.ics'); toast('Opening in Calendar…', 'ok'); return;
    case 'reset':
      if (confirm('Erase all Radar data on this device? This cannot be undone.')) { localStorage.removeItem(STORE_KEY); state = defaultState(); save(); render(); toast('Reset done'); }
      return;
    case 'discover': return openDiscover();
    case 'syncsource': return syncSource(t.dataset.id);
    case 'delsource': return removeSource(t.dataset.id);
    case 'defreminders': return openDefaultReminders();
    case 'sportsdbkey': {
      const v = prompt('TheSportsDB API key (free key is "3"):', state.settings.sportsdbKey || '3');
      if (v != null) { state.settings.sportsdbKey = v.trim() || '3'; save(); render(); }
      return;
    }
    case 'pushcfg': return openPushConfig();
  }
}

function removeSource(id) {
  const s = state.sources.find((x) => x.id === id); if (!s) return;
  if (!confirm(`Remove "${s.label}" and its ${s.count||0} imported events?`)) return;
  state.events = state.events.filter((e) => !(e.source && e.source.id === id));
  state.sources = state.sources.filter((x) => x.id !== id);
  save(); reschedule(); render(); toast('Source removed');
}

let defRemDraft = null;
function openDefaultReminders() {
  defRemDraft = new Set(state.settings.defaultReminders || []);
  openModal(`
    <div class="modal-head"><h2>Default reminders</h2><button class="icon-btn" data-close-modal>✕</button></div>
    <p class="muted" style="font-size:13.5px;margin:0 0 12px">Applied to new events automatically.</p>
    <div class="chip-select">${REMINDER_PRESETS.map((r)=>`<button type="button" class="opt ${defRemDraft.has(r.min)?'on':''}" data-def-rem="${r.min}" style="--opt-c:var(--accent)">${r.label}</button>`).join('')}</div>
    <div class="modal-actions"><button class="btn btn-block" data-save-def>Done</button></div>`);
}

function openPushConfig() {
  openModal(`
    <div class="modal-head"><h2>Web Push server</h2><button class="icon-btn" data-close-modal>✕</button></div>
    <p class="muted" style="font-size:13.5px;line-height:1.5;margin:0 0 14px">Background push on a closed iPhone needs a small always-on server that holds VAPID keys and sends pushes at reminder times. A ready-to-deploy <b>server/</b> folder ships with Radar — deploy it (Render, Railway, a VPS, or Cloudflare Workers), then paste its URL and public key here.</p>
    <form id="pushForm">
      <div class="field"><label>Push server URL</label><input type="text" id="p-url" value="${esc(state.settings.pushServerUrl)}" placeholder="https://your-server.app" /></div>
      <div class="field"><label>VAPID public key</label><input type="text" id="p-key" value="${esc(state.settings.vapidPublicKey)}" placeholder="B…" /></div>
      <div class="modal-actions"><button type="button" class="btn btn-surface" data-sub-push>Subscribe</button><button type="submit" class="btn">Save</button></div>
    </form>`);
}

/* form submits */
document.addEventListener('submit', (e) => {
  if (e.target.id === 'evForm') { e.preventDefault(); return saveEventFromForm(); }
  if (e.target.id === 'catForm') { e.preventDefault(); return saveCategoryFromForm(e.target); }
  if (e.target.id === 'pushForm') { e.preventDefault(); state.settings.pushServerUrl = $('#p-url').value.trim(); state.settings.vapidPublicKey = $('#p-key').value.trim(); save(); render(); closeModal(); toast('Saved', 'ok'); return; }
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-sub-push]')) { state.settings.pushServerUrl = $('#p-url').value.trim(); state.settings.vapidPublicKey = $('#p-key').value.trim(); save(); subscribePush(); } });

document.addEventListener('change', (e) => {
  if (e.target.id === 'f-allday') { editorDraft.allDay = e.target.checked; $('#timeWrap').style.display = e.target.checked ? 'none' : ''; }
});

function saveEventFromForm() {
  const title = $('#f-title').value.trim();
  if (!title) { toast('Give it a name', 'err'); return; }
  const date = $('#f-date').value;
  const time = editorDraft.allDay ? '00:00' : ($('#f-time').value || '12:00');
  if (!date) { toast('Pick a date', 'err'); return; }
  const ev = {
    id: editorDraft.id || uid(),
    title, categoryId: editorDraft.categoryId,
    start: `${date}T${time}`, allDay: editorDraft.allDay,
    durationMin: editorDraft.durationMin || 120,
    freq: editorDraft.freq || 'none',
    reminders: [...new Set(editorDraft.reminders)].sort((a,b)=>a-b),
    location: $('#f-loc').value.trim(), url: $('#f-url').value.trim(), note: $('#f-note').value.trim(),
  };
  if (editorDraft.source) ev.source = editorDraft.source;
  const idx = state.events.findIndex((x) => x.id === ev.id);
  if (idx >= 0) state.events[idx] = { ...state.events[idx], ...ev }; else state.events.push(ev);
  save(); reschedule(); closeModal(); render();
  toast(idx >= 0 ? 'Saved' : 'Tracking it 📡', 'ok');
}
function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  state.events = state.events.filter((e) => e.id !== id);
  save(); reschedule(); closeModal(); render(); toast('Deleted');
}
function saveCategoryFromForm(form) {
  const name = $('#c-name').value.trim();
  if (!name) { toast('Name it', 'err'); return; }
  const emoji = ($('#c-emoji .on') || {}).dataset?.emoji || '📌';
  const color = ($('#c-color .on') || {}).dataset?.color || PALETTE[5];
  const existingId = form.dataset.cat;
  if (existingId) { const c = catById(existingId); c.name = name; c.emoji = emoji; c.color = color; }
  else state.categories.push({ id: uid(), name, emoji, color });
  save(); closeModal(); render(); toast('Saved', 'ok');
}
function deleteCategory(id) {
  const count = state.events.filter((e) => e.categoryId === id).length;
  if (!confirm(count ? `Delete this category? ${count} event(s) will move to Personal.` : 'Delete this category?')) return;
  state.events.forEach((e) => { if (e.categoryId === id) e.categoryId = 'personal'; });
  ensureCategory('personal', 'Personal', '📌', '#c0cad6');
  state.categories = state.categories.filter((c) => c.id !== id);
  save(); render(); toast('Deleted');
}

/* top bar + fab + banner */
$('#addBtn').onclick = () => openEventEditor(null);
$('#brandHome').onclick = () => goto('upcoming');
$('#settingsBtn').onclick = () => goto('settings');
$('#notifBtn').onclick = () => { if (Notification?.permission !== 'granted') requestPermission(); else goto('settings'); };
$('#searchToggle').onclick = () => {
  const bar = $('#searchbar'); bar.hidden = !bar.hidden;
  if (!bar.hidden) $('#searchInput').focus(); else { state.ui.search = ''; $('#searchInput').value = ''; render(); }
};
$('#searchInput').addEventListener('input', (e) => { state.ui.search = e.target.value; if (state.ui.view !== 'upcoming') state.ui.view = 'upcoming'; render(); });
$('#permEnable').onclick = requestPermission;
$('#permDismiss').onclick = () => { state.settings.permBannerDismissed = true; save(); renderPermBanner(); };

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modalHost').hidden) closeModal(); });

/* =========================================================================
   INIT
   ========================================================================= */
async function init() {
  state = load();
  pruneDelivered();
  if (state.settings.notifEnabled && 'Notification' in window && Notification.permission !== 'granted') state.settings.notifEnabled = false;
  render();
  await ensureSW();
  reschedule();
  setInterval(tick, 1000 * 20);
  // Re-check reminders + refresh when app regains focus (covers missed while closed)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { pruneDelivered(); reschedule(); if (state.ui.view === 'upcoming') renderUpcoming(); } });
  window.addEventListener('focus', () => reschedule());
}
init();
