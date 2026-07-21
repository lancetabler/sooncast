"use client";

import { useState } from "react";
import * as chrono from "chrono-node";
import { toast } from "sonner";
import { Bell, Trash2, Wand2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { api, ApiError } from "@/lib/client/api";
import { REMINDER_PRESETS, reminderLabel } from "@/lib/domain/format";
import type { ClientCategory, ClientEvent } from "@/lib/client/types";

const FREQS: Array<[string, string]> = [
  ["none", "Once"], ["daily", "Daily"], ["weekly", "Weekly"], ["biweekly", "2 wks"], ["monthly", "Monthly"],
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInput(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: ClientEvent | null;
  categories: ClientCategory[];
  defaultReminders: number[];
  onSaved: () => void;
  now: number;
}) {
  const { open, onOpenChange, event } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? "Edit" : "Track something"}</DialogTitle>
        </DialogHeader>
        {/* Mount the form only while open and key it per event, so its initial state is
            seeded once from props — no state-syncing effect, no impure Date.now() in render. */}
        {open && <EventForm key={event?.id ?? "new"} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function EventForm({
  onOpenChange, event, categories, defaultReminders, onSaved, now,
}: {
  onOpenChange: (v: boolean) => void;
  event: ClientEvent | null;
  categories: ClientCategory[];
  defaultReminders: number[];
  onSaved: () => void;
  now: number;
}) {
  const isEdit = !!event;
  const [f, setF] = useState(() => {
    const base = event ? new Date(event.start) : new Date(now + 3600_000);
    return {
      title: event?.title ?? "",
      categoryId: event?.categoryId ?? categories.find((c) => c.slug === "personal")?.id ?? categories[0]?.id ?? null,
      date: toDateInput(base),
      time: toTimeInput(base),
      allDay: event?.allDay ?? false,
      countUp: event?.countUp ?? false,
      freq: event?.freq ?? "none",
      reminders: event?.reminders ?? defaultReminders,
      tags: (event?.tags ?? []).join(", "),
      location: event?.location ?? "",
      url: event?.url ?? "",
      note: event?.note ?? "",
    };
  });
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function applyQuick() {
    const text = quick.trim();
    if (!text) return;
    const results = chrono.parse(text, new Date(), { forwardDate: true });
    if (!results.length) {
      setF((s) => ({ ...s, title: text }));
      setQuick("");
      return;
    }
    const r = results[0];
    const dt = r.start.date();
    const hasTime = r.start.isCertain("hour");
    const title = (text.slice(0, r.index) + text.slice(r.index + r.text.length)).replace(/\s+/g, " ").trim() || text;
    setF((s) => ({ ...s, title, date: toDateInput(dt), time: toTimeInput(dt), allDay: !hasTime }));
    setQuick("");
    toast.success("Filled from your text");
  }

  function toggleReminder(min: number) {
    setF((s) => {
      if (s.reminders.includes(min)) return { ...s, reminders: s.reminders.filter((m) => m !== min) };
      return { ...s, reminders: [...s.reminders, min].sort((a, b) => a - b) };
    });
  }

  async function save() {
    if (!f.title.trim()) return toast.error("Give it a name");
    if (!f.date) return toast.error("Pick a date");
    setBusy(true);
    // All-day events are anchored at noon UTC so they land on the right calendar day everywhere.
    const start = f.allDay
      ? new Date(`${f.date}T12:00:00Z`).toISOString()
      : new Date(`${f.date}T${f.time || "12:00"}`).toISOString();
    const payload: Partial<ClientEvent> = {
      title: f.title.trim(),
      categoryId: f.categoryId,
      start,
      allDay: f.allDay,
      countUp: f.countUp,
      freq: f.freq,
      reminders: f.reminders,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20),
      location: f.location.trim() || null,
      url: f.url.trim() || null,
      note: f.note.trim() || null,
    };
    try {
      if (isEdit && event) await api.updateEvent(event.id, payload);
      else await api.createEvent(payload);
      toast.success(isEdit ? "Saved" : "Tracking it");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    try {
      await api.deleteEvent(event.id);
      toast.success("Deleted");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Couldn't delete");
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {!isEdit && (
          <div className="flex gap-2 rounded-xl border border-dashed border-border bg-secondary/40 p-2">
            <Input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyQuick(); } }}
              placeholder="Type it: “Bruins friday 7pm”"
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button type="button" variant="secondary" size="sm" onClick={applyQuick} disabled={!quick.trim()}>
              <Wand2 data-icon="inline-start" /> Fill
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="ev-title">What is it?</Label>
          <Input id="ev-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. British Grand Prix" autoFocus />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Category</Label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = f.categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setF({ ...f, categoryId: c.id })}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition"
                  style={{
                    borderColor: on ? c.color : "var(--border)",
                    background: on ? `color-mix(in oklch, ${c.color} 18%, transparent)` : "transparent",
                    color: on ? "var(--foreground)" : "var(--muted-foreground)",
                  }}
                >
                  <span>{c.emoji}</span>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="ev-date">Date</Label>
            <Input id="ev-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          {!f.allDay && (
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="ev-time">Time</Label>
              <Input id="ev-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
            </div>
          )}
        </div>

        <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <span className="text-sm">All-day</span>
          <Switch checked={f.allDay} onCheckedChange={(v) => setF({ ...f, allDay: v })} />
        </label>

        <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <span className="flex flex-col">
            <span className="text-sm">Count up</span>
            <span className="text-xs text-muted-foreground">Show time since (anniversaries, milestones)</span>
          </span>
          <Switch checked={f.countUp} onCheckedChange={(v) => setF({ ...f, countUp: v })} />
        </label>

        <div className="flex flex-col gap-2">
          <Label>Repeats</Label>
          <ToggleGroup
            type="single"
            value={f.freq}
            onValueChange={(v) => v && setF({ ...f, freq: v })}
            variant="outline"
            className="w-full"
          >
            {FREQS.map(([v, l]) => (
              <ToggleGroupItem key={v} value={v} className="flex-1 text-xs">
                {l}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5">
            <Bell className="size-3.5" /> Reminders
          </Label>
          <div className="flex flex-wrap gap-2">
            {REMINDER_PRESETS.map((min) => {
              const on = f.reminders.includes(min);
              return (
                <button
                  key={min}
                  type="button"
                  onClick={() => toggleReminder(min)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
                >
                  {reminderLabel(min)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            On iPhone, add the event to your calendar for alerts when Sooncast is closed — or enable push in Settings.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ev-tags">Tags <span className="text-muted-foreground">(optional, comma-separated)</span></Label>
          <Input id="ev-tags" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="watch-live, playoffs, must-see" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ev-loc">Location <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="ev-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Silverstone" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ev-url">Link <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="ev-url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="Where to watch / buy" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ev-note">Notes <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea id="ev-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Anything to remember" />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {isEdit ? (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive">
            <Trash2 data-icon="inline-start" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save" : "Add to Sooncast"}
        </Button>
      </DialogFooter>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this event?"
        description="It disappears from your Upcoming, Calendar and reminders."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </>
  );
}
