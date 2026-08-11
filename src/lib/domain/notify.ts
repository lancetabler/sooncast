// Which follows are allowed to fire per-event reminders.
//
// A league-wide follow carries a whole season — the NHL alone is ~730 fixtures — so with the
// default three reminders per event, following two leagues means thousands of pushes a season.
// Scope decides the baseline; a per-follow `notify` override always wins, so any heuristic here
// is one tap away from being corrected by the user.

export type NotifyScope = "all" | "specific" | "manual";
export type FollowNotify = "on" | "off" | null | undefined;

/**
 * Above this many events a month, a follow is a firehose rather than a set of appointments.
 *
 * The budget that matters is *pushes*, not events: each event carries the user's default
 * reminders (three, out of the box), so ten events a month is already ~30 notifications from
 * a single follow. Measured against real data: F1/IndyCar/WTA ~6 a month and NASCAR ~4 stay on
 * — those are appointments; the all-releases movie feed (~21), NFL (~40) and NHL (~200) don't
 * — those belong in the feed and the daily digest.
 */
export const BUSY_FOLLOW_PER_MONTH = 10;

/**
 * Is this follow a *specific* thing (one team, one film, one show) rather than an
 * everything-in-the-league subscription?
 */
export function isSpecificFollow(provider: string, ref: string): boolean {
  if (ref.includes("/teams/")) return true; // espn team schedule
  if (provider === "tmdb") return /^(movie|tv)\//.test(ref); // a picked film/show, not "upcoming"
  return false;
}

/**
 * Does this follow get per-event reminder pushes?
 *
 * `upcomingPerMonth` (when known) is what makes the default sane: judging by *type* alone
 * silenced whole racing series, which fire a handful of times a month and are exactly what
 * someone wants a reminder for. Volume is the thing that actually hurts.
 */
export function followNotifies(
  scope: NotifyScope,
  // `notify` is a free-form string in the DB row; anything unrecognised falls through to scope.
  follow: { provider: string; ref: string; muted: boolean; notify?: string | null },
  upcomingPerMonth?: number
): boolean {
  if (follow.muted) return false; // mute always wins
  if (follow.notify === "on") return true;
  if (follow.notify === "off") return false;
  if (scope === "all") return true;
  if (scope === "manual") return false;
  if (isSpecificFollow(follow.provider, follow.ref)) return true;
  return upcomingPerMonth !== undefined && upcomingPerMonth <= BUSY_FOLLOW_PER_MONTH;
}

/** Human-readable explanation for the Settings screen. */
export function scopeLabel(scope: NotifyScope): { label: string; hint: string } {
  switch (scope) {
    case "all":
      return {
        label: "Everything",
        hint: "Every event from everything you follow gets reminders. Following a whole league can mean hundreds a month.",
      };
    case "manual":
      return {
        label: "Only what I pick",
        hint: "No reminders unless you switch a follow on below. Everything still appears in the app and your daily digest.",
      };
    default:
      return {
        label: "My teams & picks",
        hint: "Reminders for your teams, films and any series with a handful of dates a month. Busy league-wide follows stay in the app and your daily digest without buzzing you — switch any of them on below.",
      };
  }
}
