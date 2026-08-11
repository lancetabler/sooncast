import "server-only";
import { prisma } from "@/lib/prisma";
import { expandAll, reminderFires } from "@/lib/domain/recurrence";
import { reminderLabel } from "@/lib/domain/format";
import { channelFromNote } from "@/lib/domain/watch";
import { parseIntArray } from "@/lib/serialize";
import { sendPush, pushReady } from "@/lib/push";
import { getLiveStatuses, scoreString } from "@/lib/live";
import { runFollowImport } from "@/lib/import";
import { sendExpo } from "@/lib/expo-push";
import { followNotifies, type NotifyScope } from "@/lib/domain/notify";
import { apnsConfigured, sendLiveActivityUpdate } from "@/lib/apns";
import type { TrackEvent } from "@/lib/domain/types";

// How far back to catch fires that just came due. Set CRON_LOOKBACK_MIN to your
// pinger interval + 1 (e.g. a 5-minute pinger -> 6). Dedupe prevents double-sends.
const LOOKBACK_MS = Math.max(1, Number(process.env.CRON_LOOKBACK_MIN) || 2) * 60_000;
// If the pinger misses a few beats, still send a fire that came due during the gap
// (the dedupe log stops repeats). Bounded so we never deliver very-late reminders.
const CATCHUP_MS = Math.max(LOOKBACK_MS, 2 * 3600_000);
// …but never fire a reminder for an event that already started more than this ago
// (so a delayed "starting now" doesn't arrive after the event is well underway).
const STALE_START_MS = 15 * 60_000;
const SCORE_THROTTLE_MS = 10 * 60_000; // at most one score-change push per game per window
const MAX_REMINDER_MIN = 10080; // 1 week — how far ahead a fire's occurrence can be

/** Claim a one-time key atomically; returns false if already claimed (or on a transient
 *  error, in which case we simply retry next run rather than risk a double-send). */
async function claimOnce(userId: string, key: string): Promise<boolean> {
  return prisma.reminderLog.create({ data: { userId, key } }).then(() => true).catch(() => false);
}
/** Undo a claim so the next run retries — used when the claim succeeded but the push never
 *  actually got through (sendPush returns 0 on failure rather than throwing). Prevents a
 *  transient push-gateway blip from permanently dropping a reminder/final. */
async function releaseClaim(key: string): Promise<void> {
  await prisma.reminderLog.delete({ where: { key } }).catch(() => {});
}

function minutesOfDayInTz(now: Date, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  } catch {
    return null;
  }
}
function inQuietHours(mins: number, start: number, end: number): boolean {
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
}
/** Calendar date (YYYY-MM-DD) in a given timezone — used to dedupe once-a-day digests. */
function dateInTz(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function toTrack(e: {
  id: string; title: string; categoryId: string | null; start: Date; allDay: boolean; durationMin: number;
  freq: string; until: Date | null; reminders: string; countUp?: boolean; location: string | null; url: string | null; note: string | null; imageUrl: string | null;
}): TrackEvent {
  return {
    id: e.id, title: e.title, categoryId: e.categoryId, start: e.start.toISOString(),
    allDay: e.allDay, durationMin: e.durationMin, freq: e.freq as TrackEvent["freq"],
    until: e.until ? e.until.toISOString() : null, reminders: parseIntArray(e.reminders),
    countUp: e.countUp, location: e.location, url: e.url, note: e.note, imageUrl: e.imageUrl,
  };
}

export interface ReminderResult {
  checkedUsers: number;
  sent: number;
}

/** Per-minute work: due reminders + live score-change / final alerts for followed team sports. */
export async function runReminders(): Promise<ReminderResult> {
  // NOTE: deliberately NOT gated on pushReady(). That checks the VAPID keys for *web* push;
  // native (Expo → APNs) delivery doesn't need them. Gating the whole job here silently
  // disabled every reminder and score alert for the mobile app whenever VAPID was unset.
  const now = Date.now();
  const from = new Date(now - 6 * 3600_000);
  const to = new Date(now + MAX_REMINDER_MIN * 60_000);

  const users = await prisma.user.findMany({
    where: { OR: [{ subscriptions: { some: {} } }, { expoPushTokens: { some: {} } }] },
    include: {
      subscriptions: true,
      expoPushTokens: true,
      follows: true,
      events: { where: { start: { lte: to }, OR: [{ freq: { not: "none" } }, { start: { gte: from } }] } },
    },
  });

  // Events per follow over the next 30 days — the volume input to the reminder policy. Queried
  // separately because `users.events` above only spans the reminder horizon (a week), which
  // would make every busy league look quiet enough to notify.
  const monthlyCounts = await prisma.event.groupBy({
    by: ["followId"],
    where: { followId: { not: null }, start: { gte: new Date(now), lte: new Date(now + 30 * 86400_000) } },
    _count: true,
  });
  const perMonthByFollow = new Map(monthlyCounts.map((r) => [r.followId as string, r._count]));

  let sent = 0;
  let checkedUsers = 0;

  // Returns how many subscriptions the push actually reached (2xx), so callers can tell a real
  // delivery from a silent failure and decide whether to keep or roll back their claim.
  async function pushAll(
    user: (typeof users)[number],
    title: string,
    body: string,
    tag: string,
    url?: string,
    eventId?: string,
    opts?: { timeSensitive?: boolean; followId?: string | null; occStart?: Date }
  ): Promise<number> {
    let delivered = 0;
    // Web push only runs when VAPID is configured; native delivery below is independent.
    if (pushReady()) {
      for (const s of user.subscriptions) {
        const status = await sendPush(s, { title, body, tag, url });
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else if (status >= 200 && status < 300) { sent++; delivered++; }
      }
    }
    // Native (Expo → APNs). `eventId` lets the app open the event when the push is tapped,
    // and `followId` powers the "Mute this" notification action.
    const data: Record<string, unknown> = {};
    if (url) data.url = url;
    if (eventId) data.eventId = eventId;
    if (opts?.followId) data.followId = opts.followId;
    // Which occurrence this push is about, so "Mark watched" on a recurring event ticks off the one
    // that just fired instead of the whole series. en-CA formats as YYYY-MM-DD, and the user's own
    // timezone is the frame the app keys occurrences on.
    if (opts?.occStart) {
      data.occDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: user.timezone || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(opts.occStart);
    }
    const expoDelivered = await sendExpo(user.expoPushTokens, {
      title,
      body,
      // Only the actually-urgent ones pierce Focus, and only if the user left it on.
      timeSensitive: !!opts?.timeSensitive && user.timeSensitive,
      categoryId: eventId ? "event" : undefined,
      data: Object.keys(data).length ? data : undefined,
    });
    sent += expoDelivered;
    delivered += expoDelivered;
    return delivered;
  }

  for (const user of users) {
    checkedUsers++;
    if (user.quietStart != null && user.quietEnd != null) {
      const mod = minutesOfDayInTz(new Date(now), user.timezone);
      if (mod != null && inQuietHours(mod, user.quietStart, user.quietEnd)) continue;
    }

    const mutedFollowIds = new Set(user.follows.filter((f) => f.muted).map((f) => f.id));
    const noScoreFollowIds = new Set(user.follows.filter((f) => !f.scoreAlerts).map((f) => f.id));
    const followRefById = new Map(user.follows.map((f) => [f.id, f.ref]));
    // Reminder eligibility is evaluated here, at send time, rather than baked into the events at
    // import — so changing the setting takes effect on the next tick instead of the next sync.
    const scope = user.notifyScope as NotifyScope;
    const notifyingFollowIds = new Set(
      user.follows.filter((f) => followNotifies(scope, f, perMonthByFollow.get(f.id) ?? 0)).map((f) => f.id)
    );
    const followIdByEvent = new Map(user.events.map((e) => [e.id, e.followId]));

    /* ---- reminders ---- */
    // Events you added yourself always notify; imported ones obey the follow's policy.
    const track: TrackEvent[] = user.events.filter((e) => !e.followId || notifyingFollowIds.has(e.followId)).map(toTrack);
    const occ = expandAll(track, from, to, user.timezone);
    const due = reminderFires(occ).filter((f) => {
      const t = f.fireAt.getTime();
      // Due now (with catch-up for missed pings), but not for an event already well underway.
      return t <= now && t > now - CATCHUP_MS && f.occStart.getTime() > now - STALE_START_MS;
    });

    for (const fire of due) {
      // Atomic claim doubles as the dedupe guard — safe under overlapping pinger runs.
      if (!(await claimOnce(user.id, fire.key))) continue;
      const channel = channelFromNote(fire.note);
      const suffix = (fire.location ? ` · ${fire.location}` : "") + (channel ? ` · 📺 ${channel}` : "");
      const body =
        fire.minutes === 0
          ? "Starting now" + suffix
          : `${reminderLabel(fire.minutes).replace(" before", "")} — starts soon` + suffix;
      const delivered = await pushAll(user, fire.title, body, fire.key, fire.url ?? undefined, fire.eventId, {
        // "Starting now" and the last call before kick-off are the ones worth piercing Focus.
        timeSensitive: fire.minutes <= 15,
        followId: followIdByEvent.get(fire.eventId) ?? null,
        occStart: fire.occStart,
      });
      // The push never landed (transient gateway failure) — release the claim so we retry next run.
      if (!delivered) await releaseClaim(fire.key);
    }

    /* ---- live score-change & final alerts (ESPN team sports; skipped when the follow opts out) ---- */
    const liveCandidates = user.events.filter(
      (e) =>
        e.sourceProvider === "espn" &&
        e.followId && !mutedFollowIds.has(e.followId) && !noScoreFollowIds.has(e.followId) &&
        followRefById.get(e.followId)?.includes("/teams/") &&
        e.liveState !== "post" &&
        e.start.getTime() <= now + 15 * 60_000 &&
        e.start.getTime() >= now - 5 * 3600_000
    );
    if (liveCandidates.length) {
      const statuses = await getLiveStatuses(
        liveCandidates.map((e) => ({ eventId: e.id, sourceExtId: e.sourceExtId, followRef: followRefById.get(e.followId!) ?? null, start: e.start }))
      );
      // Live Activity tokens for these games, so the Lock Screen keeps moving with the app closed.
      const laTokens = apnsConfigured()
        ? await prisma.liveActivityToken.findMany({ where: { userId: user.id, eventId: { in: liveCandidates.map((e) => e.id) } } })
        : [];
      const tokensByEvent = new Map<string, typeof laTokens>();
      for (const t of laTokens) tokensByEvent.set(t.eventId, [...(tokensByEvent.get(t.eventId) ?? []), t]);
      for (const e of liveCandidates) {
        const st = statuses[e.id];
        if (!st) continue;
        const newScore = scoreString(st);
        // Spoiler shield: the user has told us they haven't watched this yet — don't push the
        // numbers at them. "all" suppresses live score pushes entirely; any non-"show" mode
        // strips the score from the Final push below.
        const shielded = user.spoilerMode !== "show" && !e.watchedAt;
        if (st.state === "in") {
          if (newScore && e.liveScore && newScore !== e.liveScore && !(shielded && user.spoilerMode === "all")) {
            // Throttle so a live game can't fire on every basket; stable tag replaces (not stacks).
            const bucket = Math.floor(now / SCORE_THROTTLE_MS);
            const scoreKey = `score:${e.id}:${bucket}`;
            if (await claimOnce(user.id, scoreKey)) {
              const delivered = await pushAll(user, `🚨 ${e.title}`, `${newScore}${st.detail ? " · " + st.detail : ""}`, `score-${e.id}`, e.url ?? undefined, e.id, {
                timeSensitive: true, // the game is happening right now
                followId: e.followId,
              });
              // Free the throttle bucket so the next actual score change can still alert (liveScore
              // advances below regardless, so this exact score won't re-fire — score alerts are lossy).
              if (!delivered) await releaseClaim(scoreKey);
            }
          }
          if (newScore !== e.liveScore || e.liveState !== "in") {
            await prisma.event.update({ where: { id: e.id }, data: { liveScore: newScore, liveState: "in" } });
          }
        } else if (st.state === "post" && e.liveState !== "post") {
          // Claim first so concurrent runs can't both send the Final push.
          const finalKey = `final:${e.id}`;
          if (await claimOnce(user.id, finalKey)) {
            const body = shielded ? "Full time — result hidden. Tap when you're ready." : newScore ?? "Final";
            const delivered = await pushAll(user, `Final · ${e.title}`, body, `final-${e.id}`, e.url ?? undefined, e.id, { followId: e.followId });
            if (delivered) {
              // Only mark "post" once the Final actually landed — otherwise the event drops out of
              // the live-candidate filter and the Final could never be retried.
              await prisma.event.update({ where: { id: e.id }, data: { liveScore: newScore, liveState: "post" } });
            } else {
              await releaseClaim(finalKey);
            }
          }
        }

        /* ---- Live Activity (Lock Screen / Dynamic Island) ---- */
        // The app can only refresh these while it's open, so the server drives them during
        // the game. Same spoiler rules as the pushes: never put a hidden score on-screen.
        const tokens = tokensByEvent.get(e.id) ?? [];
        if (tokens.length && (st.state === "in" || st.state === "post")) {
          const hideNumbers = shielded && (user.spoilerMode === "all" || st.state === "post");
          const content = {
            status: st.state,
            detail: hideNumbers ? (st.state === "post" ? "Full time — result hidden" : "Live — score hidden") : st.detail || (st.state === "post" ? "Final" : "Live"),
            ...(hideNumbers
              ? {}
              : {
                  homeName: st.home?.abbr ?? "",
                  homeScore: st.home?.score ?? "",
                  awayName: st.away?.abbr ?? "",
                  awayScore: st.away?.score ?? "",
                }),
          };
          for (const t of tokens) {
            const res = await sendLiveActivityUpdate(t.token, content, {
              end: st.state === "post",
              // Outlive the poll interval so a single missed tick doesn't grey the card.
              staleAfterSec: 300,
              // Leave the final score up for a few minutes, then let iOS dismiss it.
              dismissAfterSec: 10 * 60,
            });
            if (res === "gone" || st.state === "post") {
              await prisma.liveActivityToken.delete({ where: { id: t.id } }).catch(() => {});
            }
          }
        }
      }
    }
  }

  return { checkedUsers, sent };
}

export interface DigestResult {
  sent: number;
}

/**
 * Once-a-day "here's your day" summary of the next ~18h.
 * - force (dedicated morning pinger): always send.
 * - morning gate (unified tick): only when it's 7–10am in the user's timezone and
 *   they haven't had today's digest yet (deduped via ReminderLog).
 */
export async function runDigest({ force = false }: { force?: boolean } = {}): Promise<DigestResult> {
  // Not gated on pushReady() — see runReminders. Native push works without VAPID keys.
  const now = Date.now();
  const from = new Date(now);
  const to = new Date(now + 18 * 3600_000);

  const users = await prisma.user.findMany({
    include: {
      subscriptions: true,
      expoPushTokens: true,
      follows: true,
      events: { where: { start: { lte: to }, OR: [{ freq: { not: "none" } }, { start: { gte: from } }] } },
    },
  });
  let sent = 0;

  for (const user of users) {
    if (!user.subscriptions.length && !user.expoPushTokens.length) continue;

    if (!force) {
      const mod = minutesOfDayInTz(new Date(now), user.timezone);
      // 7am–noon window (not just 7–10): if the pinger was down through the early morning,
      // a later run still delivers today's digest. The once-per-day claim keeps it to one send.
      if (mod == null || mod < 7 * 60 || mod >= 12 * 60) continue;
      // Claim once per local day — the atomic create is also the concurrency guard.
      if (!(await claimOnce(user.id, `${user.id}:digest@${dateInTz(new Date(now), user.timezone)}`))) continue;
    }

    const muted = new Set(user.follows.filter((f) => f.muted).map((f) => f.id));
    const track: TrackEvent[] = user.events.filter((e) => !(e.followId && muted.has(e.followId))).map(toTrack);
    const occ = expandAll(track, from, to, user.timezone).filter((o) => !o.event.countUp);
    if (!occ.length) continue;

    // Include each item's local start time and the channel (if known) so the digest is actionable.
    const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: user.timezone, hour: "numeric", minute: "2-digit", hour12: true });
    const lines = occ.slice(0, 4).map((o) => {
      const when = o.event.allDay ? "All day" : fmtTime.format(o.start);
      const ch = channelFromNote(o.event.note);
      return `${when} ${o.event.title}${ch ? ` (📺 ${ch})` : ""}`;
    });
    const body = `${occ.length} today — ${lines.join(" · ")}${occ.length > 4 ? " · …" : ""}`;
    if (pushReady()) {
      for (const s of user.subscriptions) {
        const status = await sendPush(s, { title: "Your day 📡", body, tag: `digest-${dateInTz(new Date(now), user.timezone)}` });
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else if (status >= 200 && status < 300) sent++;
      }
    }
    sent += await sendExpo(user.expoPushTokens, { title: "Your day 📡", body });
  }

  return { sent };
}

export interface SyncResult {
  follows: number;
  added: number;
  failed: number;
  pruned: number;
  /** Per-follow failure reasons (capped) — without these a `failed: 12` is undiagnosable. */
  errors?: string[];
}

/** Re-import every followed source and push when new fixtures appear; prune stale past imports. */
export async function runSync(): Promise<SyncResult> {
  const users = await prisma.user.findMany({ include: { follows: true, subscriptions: true, expoPushTokens: true } });
  let follows = 0;
  let added = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const user of users) {
    let userAdded = 0;
    for (const f of user.follows) {
      follows++;
      // One retry: a serverless sync of many follows trips transient upstream/DB blips
      // (cold Neon compute, a flaky provider response) that succeed a moment later.
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await runFollowImport(user.id, f);
          userAdded += res.added;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (lastErr) {
        failed++;
        const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        console.error(`[sync] ${f.provider}:${f.ref} (${f.label}) failed:`, msg);
        if (errors.length < 10) errors.push(`${f.label}: ${msg.slice(0, 200)}`);
      }
    }
    added += userAdded;

    if (userAdded > 0 && (user.subscriptions.length || user.expoPushTokens.length)) {
      const body = `${userAdded} new event${userAdded > 1 ? "s" : ""} added from the things you follow.`;
      if (pushReady()) {
        for (const sub of user.subscriptions) {
          const status = await sendPush(sub, { title: "New on Sooncast 📡", body, tag: `newevents-${user.id}-${Date.now()}` });
          if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
      await sendExpo(user.expoPushTokens, { title: "New on Sooncast 📡", body });
    }
  }

  // Prune old auto-imported one-offs so the DB (and every /api/state payload) stays lean.
  // Keeps: manual events, recurring events, anything watched, anything <60 days old.
  const pruneBefore = new Date(Date.now() - 60 * 86400_000);
  const pruned = await prisma.event
    .deleteMany({ where: { followId: { not: null }, freq: "none", watchedAt: null, start: { lt: pruneBefore } } })
    .then((r) => r.count)
    .catch(() => 0);

  return { follows, added, failed, pruned, ...(errors.length ? { errors } : {}) };
}
