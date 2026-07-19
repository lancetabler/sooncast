"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Loader2, CalendarPlus, Check, Users, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import type { CatalogItem, ClientCategory, ClientFollow } from "@/lib/client/types";

const followKey = (provider: string, ref: string) => `${provider}::${ref}`;

// Module-scope so it keeps a stable identity across renders (otherwise inputs lose focus).
function FollowPill({
  item,
  followed,
  adding,
  onFollow,
  onUnfollow,
}: {
  item: CatalogItem;
  followed: boolean;
  adding: boolean;
  onFollow: (item: CatalogItem) => void;
  onUnfollow: (item: CatalogItem) => void;
}) {
  if (followed) {
    return (
      <button
        onClick={() => onUnfollow(item)}
        disabled={adding}
        title="Tap to unfollow"
        className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
      >
        {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 group-hover:hidden" />}
        <span className="group-hover:hidden">Following</span>
        <span className="hidden group-hover:inline">Unfollow</span>
      </button>
    );
  }
  return (
    <button
      onClick={() => onFollow(item)}
      disabled={adding}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
    >
      {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
      Follow
    </button>
  );
}

export function Discover({
  categories,
  follows,
  onChanged,
}: {
  categories: ClientCategory[];
  follows: ClientFollow[];
  onChanged: () => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [featured, setFeatured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // per-league team lists (favorite-team picker), lazily loaded
  const [openLeague, setOpenLeague] = useState<string | null>(null);
  const [teamCache, setTeamCache] = useState<Record<string, CatalogItem[]>>({});
  const [teamLoading, setTeamLoading] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState("");

  // custom feed form
  const [feedUrl, setFeedUrl] = useState("");
  const [feedName, setFeedName] = useState("");
  const [feedCat, setFeedCat] = useState<string>(categories.find((c) => c.slug === "personal")?.slug ?? categories[0]?.slug ?? "personal");
  const [feedBusy, setFeedBusy] = useState(false);

  const followedKeys = new Set(follows.map((f) => followKey(f.provider, f.ref)));
  const followIdByKey = new Map(follows.map((f) => [followKey(f.provider, f.ref), f.id]));

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchSources(q);
        setItems(res.items);
        setFeatured(res.featured);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, q ? 350 : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  async function follow(item: CatalogItem) {
    const key = followKey(item.provider, item.ref);
    setAddingKey(key);
    try {
      const res = await api.addFollow({ provider: item.provider, ref: item.ref, label: item.label, categorySlug: item.categorySlug });
      const { added, updated } = res.result;
      if (added === 0 && updated === 0) {
        toast.success(`Following ${item.label}`, { description: "No upcoming events yet — we'll import them once the schedule is posted." });
      } else {
        toast.success(`Following ${item.label}`, { description: `${added} added${updated ? `, ${updated} updated` : ""}` });
      }
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast("Already following this");
      else toast.error(err instanceof ApiError ? err.message : "Couldn't follow that");
    } finally {
      setAddingKey(null);
    }
  }

  async function unfollow(item: CatalogItem) {
    const key = followKey(item.provider, item.ref);
    const id = followIdByKey.get(key);
    if (!id) return;
    if (!confirm(`Unfollow ${item.label}? This removes its imported events.`)) return;
    setAddingKey(key);
    try {
      await api.deleteFollow(id);
      toast.success(`Unfollowed ${item.label}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't unfollow");
    } finally {
      setAddingKey(null);
    }
  }

  async function toggleTeams(item: CatalogItem) {
    if (openLeague === item.ref) {
      setOpenLeague(null);
      return;
    }
    setOpenLeague(item.ref);
    setTeamFilter("");
    if (!teamCache[item.ref]) {
      setTeamLoading(item.ref);
      try {
        const res = await api.leagueTeams(item.ref);
        setTeamCache((c) => ({ ...c, [item.ref]: res.items }));
      } catch {
        setTeamCache((c) => ({ ...c, [item.ref]: [] }));
      } finally {
        setTeamLoading(null);
      }
    }
  }

  async function addFeed() {
    const url = feedUrl.trim();
    if (!/^https?:\/\/|^webcal:\/\//i.test(url)) return toast.error("Paste a valid .ics or webcal link");
    setFeedBusy(true);
    try {
      const res = await api.addFollow({
        provider: "ics",
        ref: url,
        label: feedName.trim() || "Calendar feed",
        categorySlug: feedCat,
      });
      toast.success(`Added ${res.result.added} events from feed`);
      setFeedUrl("");
      setFeedName("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't load that feed");
    } finally {
      setFeedBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams, leagues, series, movies…" className="pl-9" />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {featured ? "Popular to follow" : loading ? "Searching…" : items.length ? "Results" : "No matches"}
      </p>

      {loading && !items.length && (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const canBrowse = !!item.browse;
          const isOpen = openLeague === item.ref;
          const teams = teamCache[item.ref] ?? [];
          const filtered = teamFilter.trim()
            ? teams.filter((t) => t.label.toLowerCase().includes(teamFilter.trim().toLowerCase()))
            : teams;
          return (
            <div key={followKey(item.provider, item.ref)} className="overflow-hidden rounded-xl border border-border/70 bg-card">
              <div className="flex items-center gap-3 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="size-9 shrink-0 rounded-lg object-contain" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm">📡</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.label}</div>
                  {item.sublabel && <div className="truncate text-xs text-muted-foreground">{item.sublabel}</div>}
                </div>
                {canBrowse && (
                  <button
                    onClick={() => toggleTeams(item)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Users className="size-3.5" /> Teams
                    <ChevronDown className={`size-3 transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
                <FollowPill item={item} followed={followedKeys.has(followKey(item.provider, item.ref))} adding={addingKey === followKey(item.provider, item.ref)} onFollow={follow} onUnfollow={unfollow} />
              </div>

              {canBrowse && isOpen && (
                <div className="border-t border-border/60 bg-secondary/30 p-3">
                  {teamLoading === item.ref ? (
                    <div className="flex justify-center py-4 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  ) : teams.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">Couldn&apos;t load teams — try Follow for the full league.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Input value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} placeholder="Filter teams…" className="h-8 text-sm" />
                      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto overscroll-contain">
                        {filtered.map((t) => (
                          <div key={t.ref} className="flex items-center gap-2 rounded-lg bg-card px-2 py-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {t.imageUrl ? (
                              <img src={t.imageUrl} alt="" className="size-6 shrink-0 object-contain" />
                            ) : (
                              <span className="size-6 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm">{t.label}</span>
                            <FollowPill item={t} followed={followedKeys.has(followKey(t.provider, t.ref))} adding={addingKey === followKey(t.provider, t.ref)} onFollow={follow} onUnfollow={unfollow} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add any calendar feed — covers leagues we don't list (e.g. a local league) */}
      {featured && (
        <div className="mt-2 rounded-xl border border-border/70 bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CalendarPlus className="size-4 text-primary" /> Add a calendar feed
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Paste any <b>.ics</b> or <b>webcal</b> link — a league schedule, a team calendar, anything. It imports and stays in sync.
          </p>
          <div className="flex flex-col gap-2">
            <Input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://…/schedule.ics" />
            <div className="flex gap-2">
              <Input value={feedName} onChange={(e) => setFeedName(e.target.value)} placeholder="Name it" className="flex-1" />
              <select
                value={feedCat}
                onChange={(e) => setFeedCat(e.target.value)}
                className="rounded-md border border-border bg-card px-2 text-sm"
              >
                {categories.filter((c) => c.slug).map((c) => (
                  <option key={c.id} value={c.slug!}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={addFeed} disabled={feedBusy} size="sm">
              {feedBusy ? <Loader2 className="size-4 animate-spin" /> : "Add feed"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
