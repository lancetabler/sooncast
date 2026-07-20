"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Loader2, CalendarPlus, Check, Users, ChevronDown, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LeagueProfileSheet } from "@/components/app/LeagueProfileSheet";
import { api, ApiError } from "@/lib/client/api";
import { SEED_CATEGORIES } from "@/lib/domain/categories";
import type { CatalogItem, ClientCategory, ClientFollow } from "@/lib/client/types";

const followKey = (provider: string, ref: string) => `${provider}::${ref}`;

const seedBySlug = new Map(SEED_CATEGORIES.map((c) => [c.slug, c]));

// Bucket the featured catalog by sport so 50+ leagues stay scannable.
function groupItems(list: CatalogItem[]): Array<{ slug: string; items: CatalogItem[] }> {
  const order: string[] = [];
  const map = new Map<string, CatalogItem[]>();
  for (const it of list) {
    const key = it.categorySlug || "other";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(it);
  }
  return order.map((slug) => ({ slug, items: map.get(slug)! }));
}

function groupTitle(slug: string) {
  const seed = seedBySlug.get(slug);
  return seed ? `${seed.emoji} ${seed.name}` : slug;
}

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
  const [confirmItem, setConfirmItem] = useState<CatalogItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // league profile sheet (deep-dive info + past data)
  const [profileItem, setProfileItem] = useState<CatalogItem | null>(null);

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

  async function doUnfollow(item: CatalogItem) {
    const key = followKey(item.provider, item.ref);
    const id = followIdByKey.get(key);
    if (!id) return;
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

  const renderItem = (item: CatalogItem) => {
    const canBrowse = !!item.browse;
    const isOpen = openLeague === item.ref;
    const teams = teamCache[item.ref] ?? [];
    const filtered = teamFilter.trim()
      ? teams.filter((t) => t.label.toLowerCase().includes(teamFilter.trim().toLowerCase()))
      : teams;
    return (
      <div key={followKey(item.provider, item.ref)} className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="flex items-center gap-2 p-3">
          {/* Tap the logo/name to open the league's profile (what it is + past data). */}
          <button onClick={() => setProfileItem(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`About ${item.label}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="size-9 shrink-0 rounded-lg object-contain" />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm">📡</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-sm font-semibold">{item.label}</span>
                <Info className="size-3 shrink-0 text-muted-foreground/60" />
              </div>
              {item.sublabel && <div className="truncate text-xs text-muted-foreground">{item.sublabel}</div>}
            </div>
          </button>
          {canBrowse && (
            <button
              onClick={() => toggleTeams(item)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Users className="size-3.5" /> Teams
              <ChevronDown className={`size-3 transition ${isOpen ? "rotate-180" : ""}`} />
            </button>
          )}
          <FollowPill item={item} followed={followedKeys.has(followKey(item.provider, item.ref))} adding={addingKey === followKey(item.provider, item.ref)} onFollow={follow} onUnfollow={setConfirmItem} />
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
                      <FollowPill item={t} followed={followedKeys.has(followKey(t.provider, t.ref))} adding={addingKey === followKey(t.provider, t.ref)} onFollow={follow} onUnfollow={setConfirmItem} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams, leagues, series, movies…" className="pl-9" />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {featured ? "Everything you can follow" : loading ? "Searching…" : items.length ? "Results" : "No matches"}
      </p>

      {loading && !items.length && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] rounded-xl" />
          ))}
        </div>
      )}

      {featured ? (
        <div className="flex flex-col gap-5">
          {groupItems(items).map((g) => (
            <div key={g.slug} className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupTitle(g.slug)}</p>
              {g.items.map(renderItem)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">{items.map(renderItem)}</div>
      )}

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

      <LeagueProfileSheet
        item={profileItem}
        followed={!!profileItem && followedKeys.has(followKey(profileItem.provider, profileItem.ref))}
        adding={!!profileItem && addingKey === followKey(profileItem.provider, profileItem.ref)}
        onOpenChange={(o) => !o && setProfileItem(null)}
        onFollow={follow}
        onUnfollow={setConfirmItem}
      />

      <ConfirmDialog
        open={!!confirmItem}
        onOpenChange={(o) => !o && setConfirmItem(null)}
        title={confirmItem ? `Unfollow ${confirmItem.label}?` : "Unfollow?"}
        description="This removes its imported events from your Upcoming and Calendar."
        confirmLabel="Unfollow"
        onConfirm={async () => {
          if (confirmItem) await doUnfollow(confirmItem);
        }}
      />
    </div>
  );
}
