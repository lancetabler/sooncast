"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Loader2, CalendarPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import type { CatalogItem, ClientCategory } from "@/lib/client/types";

export function Discover({ categories, onChanged }: { categories: ClientCategory[]; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [featured, setFeatured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // custom feed form
  const [feedUrl, setFeedUrl] = useState("");
  const [feedName, setFeedName] = useState("");
  const [feedCat, setFeedCat] = useState<string>(categories.find((c) => c.slug === "personal")?.slug ?? categories[0]?.slug ?? "personal");
  const [feedBusy, setFeedBusy] = useState(false);

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
    const key = item.provider + item.ref;
    setAddingKey(key);
    try {
      const res = await api.addFollow({ provider: item.provider, ref: item.ref, label: item.label, categorySlug: item.categorySlug });
      const { added, updated } = res.result;
      toast.success(`Following ${item.label}`, {
        description: `${added} added${updated ? `, ${updated} updated` : ""}`,
      });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast("Already following this");
      else toast.error(err instanceof ApiError ? err.message : "Couldn't follow that");
    } finally {
      setAddingKey(null);
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
          const key = item.provider + item.ref;
          return (
            <div key={key} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
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
              <button
                onClick={() => follow(item)}
                disabled={addingKey === key}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                {addingKey === key ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Follow
              </button>
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
