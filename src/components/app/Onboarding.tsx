"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import type { CatalogItem } from "@/lib/client/types";

export function Onboarding({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.searchSources("").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [open]);

  function toggle(key: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  async function finish() {
    setBusy(true);
    const chosen = items.filter((i) => picked.has(i.provider + i.ref));
    let added = 0;
    for (const item of chosen) {
      try {
        const res = await api.addFollow({ provider: item.provider, ref: item.ref, label: item.label, categorySlug: item.categorySlug });
        added += res.result.added;
      } catch {
        /* skip limit/errors during onboarding */
      }
    }
    setBusy(false);
    if (added) toast.success(`Added ${added} events to Cusp`);
    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Cusp 📡</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pick a few things to follow and we&apos;ll pull in their whole schedule. You can add more (or your own) anytime.
        </p>
        <div className="my-3 flex flex-col gap-2">
          {items.map((item) => {
            const key = item.provider + item.ref;
            const on = picked.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${on ? "border-primary bg-primary/10" : "border-border bg-card"}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-sm">📡</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.label}</div>
                  {item.sublabel && <div className="truncate text-xs text-muted-foreground">{item.sublabel}</div>}
                </div>
                {on && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => { onDone(); onOpenChange(false); }}>
            Skip for now
          </Button>
          <Button onClick={finish} disabled={busy || picked.size === 0}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : `Add ${picked.size || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
