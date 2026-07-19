"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, ExternalLink, Pencil, Share2 } from "lucide-react";
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

// WMO weather codes -> emoji + label (compact).
function wmoInfo(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: "☀️", label: "Clear" };
  if (code <= 2) return { emoji: "🌤️", label: "Partly cloudy" };
  if (code === 3) return { emoji: "☁️", label: "Cloudy" };
  if (code <= 48) return { emoji: "🌫️", label: "Fog" };
  if (code <= 57) return { emoji: "🌦️", label: "Drizzle" };
  if (code <= 67) return { emoji: "🌧️", label: "Rain" };
  if (code <= 77) return { emoji: "🌨️", label: "Snow" };
  if (code <= 82) return { emoji: "🌧️", label: "Showers" };
  if (code <= 86) return { emoji: "🌨️", label: "Snow showers" };
  return { emoji: "⛈️", label: "Thunderstorm" };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
      if (yy > y + lineHeight * 2.2) { ctx.fillText(line + "…", x, yy); return yy; } // cap 3 lines
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
  return yy;
}

async function shareCountdown(event: ClientEvent, category: ClientCategory | undefined, cdText: string) {
  const start = new Date(event.start);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const accent = category?.color ?? "#5b8cff";
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, 1080, 1080);
  const grad = ctx.createRadialGradient(880, 140, 40, 880, 140, 760);
  grad.addColorStop(0, accent + "55");
  grad.addColorStop(1, "#0b0d1200");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = "#aab3c5";
  ctx.font = "600 34px sans-serif";
  ctx.fillText(`${category?.emoji ?? ""} ${(category?.name ?? "").toUpperCase()}`.trim(), 90, 210);

  ctx.fillStyle = "#eef2f9";
  ctx.font = "800 74px sans-serif";
  const titleEnd = wrapText(ctx, event.title, 90, 320, 900, 88);

  ctx.fillStyle = accent;
  ctx.font = "800 150px sans-serif";
  ctx.fillText(cdText, 90, titleEnd + 230);
  ctx.fillStyle = "#6f7a90";
  ctx.font = "600 30px sans-serif";
  ctx.fillText(`${event.countUp ? "since" : "until"} ${fmtLongDay(start)}`, 90, titleEnd + 290);

  ctx.fillStyle = "#6f7a90";
  ctx.font = "700 30px sans-serif";
  ctx.fillText("📡 Radarr", 90, 1000);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return;
  const file = new File([blob], "countdown.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: event.title }).catch(() => {});
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "countdown.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
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
  return (
    <Sheet open={!!event} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="sr-only">Event details</SheetTitle>
        </SheetHeader>
        <DetailBody event={event} category={category} onEdit={onEdit} />
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ event, category, onEdit }: { event: ClientEvent; category?: ClientCategory; onEdit: (e: ClientEvent) => void }) {
  const [weather, setWeather] = useState<{ max: number; min: number; code: number } | null>(null);

  const start = new Date(event.start);
  const dur = event.allDay ? 1440 : event.durationMin || 120;
  const end = new Date(start.getTime() + dur * 60000);
  const now = Date.now();
  const diff = start.getTime() - now;
  const cd = event.countUp ? humanCountdown(now - start.getTime()) : diff > 0 ? humanCountdown(diff) : now < end.getTime() ? "LIVE NOW" : "Passed";
  const color = category?.color ?? "var(--primary)";

  useEffect(() => {
    if (!event.location) return;
    const days = (start.getTime() - Date.now()) / 86400000;
    if (days < -0.5 || days > 15) return; // only within the forecast window
    let active = true;
    (async () => {
      try {
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(event.location!)}&count=1`).then((r) => r.json());
        const loc = geo?.results?.[0];
        if (!loc) return;
        const fc = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`
        ).then((r) => r.json());
        const idx = (fc?.daily?.time || []).indexOf(start.toISOString().slice(0, 10));
        if (idx >= 0 && active) {
          setWeather({ max: Math.round(fc.daily.temperature_2m_max[idx]), min: Math.round(fc.daily.temperature_2m_min[idx]), code: fc.daily.weather_code[idx] });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.location, event.start]);

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
    <div className="flex flex-col gap-5 px-4 pb-8">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `color-mix(in oklch, ${color} 18%, transparent)` }}>
          {category?.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight">{event.title}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{event.allDay ? fmtLongDay(start) : `${fmtLongDay(start)} · ${fmtTime(start)}`}</span>
            {weather && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                {wmoInfo(weather.code).emoji} {weather.max}°/{weather.min}°
              </span>
            )}
          </p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Share" onClick={() => shareCountdown(event, category, cd)}>
          <Share2 className="size-5" />
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <div className="tabular text-3xl font-bold tracking-tight">{cd}</div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{event.countUp ? "since" : diff > 0 ? "until start" : ""}</div>
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
  );
}
