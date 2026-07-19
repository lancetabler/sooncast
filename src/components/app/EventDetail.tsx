"use client";

import { CalendarPlus, ExternalLink, Pencil } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { buildICS } from "@/lib/domain/ics";
import { fmtLongDay, fmtTime, humanCountdown, reminderLabel } from "@/lib/domain/format";
import type { TrackEvent } from "@/lib/domain/types";
import type { ClientCategory, ClientEvent } from "@/lib/client/types";

function downloadICS(event: ClientEvent, emoji: string) {
  const track: TrackEvent = { ...event, freq: event.freq as TrackEvent["freq"] };
  const ics = buildICS([track], { calName: "Radarr", emojiPrefix: () => emoji });
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^\w]+/g, "-").slice(0, 40) || "event"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function EventDetail({
  event, category, onOpenChange, onEdit,
}: {
  event: ClientEvent | null;
  category?: ClientCategory;
  onOpenChange: (v: boolean) => void;
  onEdit: (e: ClientEvent) => void;
}) {
  if (!event) return null;
  const start = new Date(event.start);
  const dur = event.allDay ? 1440 : event.durationMin || 120;
  const end = new Date(start.getTime() + dur * 60000);
  const now = Date.now();
  const diff = start.getTime() - now;
  const cd = diff > 0 ? humanCountdown(diff) : now < end.getTime() ? "LIVE NOW" : "Passed";
  const color = category?.color ?? "var(--primary)";

  const rows: Array<[string, React.ReactNode]> = [
    ["Category", `${category?.emoji ?? ""} ${category?.name ?? "—"}`],
    ["When", event.allDay ? `${fmtLongDay(start)} · All day` : `${fmtLongDay(start)} · ${fmtTime(start)}`],
  ];
  if (event.freq && event.freq !== "none") rows.push(["Repeats", event.freq]);
  if (event.location) rows.push(["Location", event.location]);
  if (event.reminders.length) rows.push(["Reminders", event.reminders.map(reminderLabel).join(", ")]);
  if (event.sourceLabel) rows.push(["Source", event.sourceLabel]);
  if (event.url)
    rows.push([
      "Link",
      <a key="l" href={event.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">
        Open <ExternalLink className="size-3" />
      </a>,
    ]);

  return (
    <Sheet open={!!event} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="sr-only">Event details</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-8">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `color-mix(in oklch, ${color} 18%, transparent)` }}>
              {category?.emoji}
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{event.title}</h2>
              <p className="text-sm text-muted-foreground">
                {event.allDay ? fmtLongDay(start) : `${fmtLongDay(start)} · ${fmtTime(start)}`}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="tabular text-3xl font-bold tracking-tight">{cd}</div>
            {diff > 0 && <div className="text-xs uppercase tracking-wide text-muted-foreground">until start</div>}
          </div>

          {event.note && <p className="text-sm text-muted-foreground">{event.note}</p>}

          <div className="flex flex-col divide-y divide-border/60">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{k}</span>
                <span className="text-foreground">{v}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => downloadICS(event, category?.emoji ?? "")}>
              <CalendarPlus data-icon="inline-start" /> Add to Calendar
            </Button>
            <Button className="flex-1" onClick={() => onEdit(event)}>
              <Pencil data-icon="inline-start" /> Edit
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
