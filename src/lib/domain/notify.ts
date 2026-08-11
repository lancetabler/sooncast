// Which follows are allowed to fire per-event reminders.
//
// A league-wide follow carries a whole season — the NHL alone is ~730 fixtures — so with the
// default three reminders per event, following two leagues means thousands of pushes a season.
// Scope decides the baseline; a per-follow `notify` override always wins, so any heuristic here
// is one tap away from being corrected by the user.

export type NotifyScope = "all" | "specific" | "manual";
export type FollowNotify = "on" | "off" | null | undefined;

/**
 * Is this follow a *specific* thing (one team, one film, one show) rather than an
 * everything-in-the-league subscription?
 */
export function isSpecificFollow(provider: string, ref: string): boolean {
  if (ref.includes("/teams/")) return true; // espn team schedule
  if (provider === "tmdb") return /^(movie|tv)\//.test(ref); // a picked film/show, not "upcoming"
  return false;
}

/** Does this follow get per-event reminder pushes? */
export function followNotifies(
  scope: NotifyScope,
  // `notify` is a free-form string in the DB row; anything unrecognised falls through to scope.
  follow: { provider: string; ref: string; muted: boolean; notify?: string | null }
): boolean {
  if (follow.muted) return false; // mute always wins
  if (follow.notify === "on") return true;
  if (follow.notify === "off") return false;
  if (scope === "all") return true;
  if (scope === "manual") return false;
  return isSpecificFollow(follow.provider, follow.ref);
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
        hint: "Reminders for the specific things you follow — your teams, films and shows. League-wide follows stay in the app and daily digest without buzzing you.",
      };
  }
}
