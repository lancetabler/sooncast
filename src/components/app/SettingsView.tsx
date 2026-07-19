"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { BellRing, CalendarClock, Copy, LogOut, RefreshCw, Trash2, Plus, Download, Upload, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import { enablePush, isStandalone, pushSupported } from "@/lib/client/push";
import { REMINDER_PRESETS, reminderLabel } from "@/lib/domain/format";
import { buildICS } from "@/lib/domain/ics";
import { PALETTE, EMOJI_CHOICES } from "@/lib/domain/categories";
import type { StateBundle, TrackEvent } from "@/lib/client/types";
import type { ClientEvent } from "@/lib/client/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5">{children}</div>;
}

export function SettingsView({
  state, onChanged, onLogout,
}: {
  state: StateBundle;
  onChanged: () => void;
  onLogout: () => void;
}) {
  const { user, follows, categories, events } = state;
  const [defaults, setDefaults] = useState<number[]>(user.defaultReminders);
  const [pushBusy, setPushBusy] = useState(false);
  const webcal = user.feedUrl.replace(/^https?:\/\//, "webcal://");
  const { theme, setTheme } = useTheme();

  async function turnOnPush() {
    setPushBusy(true);
    const res = await enablePush();
    setPushBusy(false);
    if (res.ok) toast.success("Notifications on for this device");
    else toast.error(res.reason ?? "Couldn't enable notifications");
  }

  async function testPush() {
    try {
      const res = await api.testPush();
      toast.success(res.sent ? "Sent — check your notifications" : "No devices subscribed yet");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Test failed");
    }
  }

  async function toggleDefault(min: number) {
    const next = defaults.includes(min) ? defaults.filter((m) => m !== min) : [...defaults, min].sort((a, b) => a - b);
    setDefaults(next);
    try {
      await api.saveSettings({ defaultReminders: next });
    } catch {
      toast.error("Couldn't save");
    }
  }

  async function syncFollow(id: string, label: string) {
    toast(`Syncing ${label}…`);
    try {
      await api.syncFollow(id);
      toast.success(`${label} synced`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Sync failed");
    }
  }
  async function removeFollow(id: string, label: string) {
    if (!confirm(`Remove ${label} and its imported events?`)) return;
    await api.deleteFollow(id).catch(() => {});
    onChanged();
  }

  async function addCategory() {
    const name = prompt("Category name?");
    if (!name?.trim()) return;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const emoji = EMOJI_CHOICES[Math.floor(Math.random() * EMOJI_CHOICES.length)];
    try {
      await api.createCategory({ name: name.trim(), color, emoji });
      onChanged();
    } catch {
      toast.error("Couldn't add category");
    }
  }
  async function deleteCategory(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Its events stay but lose their category.`)) return;
    await api.deleteCategory(id).catch(() => {});
    onChanged();
  }

  function exportAll() {
    if (!events.length) return toast("Nothing to export yet");
    const emojiFor = new Map(categories.map((c) => [c.id, c.emoji]));
    const track: TrackEvent[] = events.map((e: ClientEvent) => ({ ...e, freq: e.freq as TrackEvent["freq"] }));
    const ics = buildICS(track, { calName: "Radarr", emojiPrefix: (ev) => emojiFor.get(ev.categoryId ?? "") ?? "" });
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "radarr-all.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success("Opening your calendar…");
  }

  async function downloadBackup() {
    try {
      const data = await api.backup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `radarr-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("Backup downloaded");
    } catch {
      toast.error("Backup failed");
    }
  }

  function restoreBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const res = await api.restore(data);
        toast.success(`Restored ${res.addedEvents} events, ${res.addedFollows} sources`);
        onChanged();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't restore that file");
      }
    };
    input.click();
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <Section title="Account">
        <Row>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.email}</div>
            <div className="text-xs text-muted-foreground">Signed in</div>
          </div>
        </Row>
        <Button variant="ghost" onClick={onLogout} className="justify-start text-muted-foreground">
          <LogOut data-icon="inline-start" /> Sign out
        </Button>
      </Section>

      <Section title="Notifications">
        <Row>
          <div className="min-w-0 pr-2">
            <div className="text-sm font-medium">Push on this device</div>
            <div className="text-xs text-muted-foreground">
              {pushSupported() ? "Get buzzed before events start." : "Not supported here — use the calendar feed below."}
            </div>
          </div>
          <Button size="sm" onClick={turnOnPush} disabled={pushBusy || !pushSupported()}>
            <BellRing data-icon="inline-start" /> Enable
          </Button>
        </Row>
        <Row>
          <div className="text-sm">Send a test notification</div>
          <Button size="sm" variant="secondary" onClick={testPush}>Test</Button>
        </Row>
        {!isStandalone() && (
          <p className="px-1 text-xs text-muted-foreground">
            On iPhone: Share → <b>Add to Home Screen</b>, then open Radarr from that icon before enabling push.
          </p>
        )}
      </Section>

      <Section title="Calendar feed — reliable iPhone alerts">
        <div className="rounded-xl border border-border/70 bg-card p-3.5">
          <p className="text-sm text-muted-foreground">
            Subscribe once in Apple/Google Calendar and it auto-updates as your events change. The calendar fires
            the alarms itself — the dependable way to be alerted when Radarr is closed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <a href={webcal}>
                <CalendarClock data-icon="inline-start" /> Add to Calendar
              </a>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { navigator.clipboard?.writeText(user.feedUrl); toast.success("Feed link copied"); }}
            >
              <Copy data-icon="inline-start" /> Copy link
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Default reminders">
        <div className="flex flex-wrap gap-2">
          {REMINDER_PRESETS.map((min) => {
            const on = defaults.includes(min);
            return (
              <button
                key={min}
                onClick={() => toggleDefault(min)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
              >
                {reminderLabel(min)}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={`Sources${follows.length ? ` · ${follows.length}` : ""}`}>
        {follows.length === 0 && <p className="px-1 text-xs text-muted-foreground">Follow leagues, teams and series from the Discover tab.</p>}
        {follows.map((f) => (
          <Row key={f.id}>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{f.label}</div>
              <div className="text-xs text-muted-foreground">
                {f.count} events{f.lastSync ? ` · synced ${new Date(f.lastSync).toLocaleDateString()}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" onClick={() => syncFollow(f.id, f.label)} aria-label="Sync">
                <RefreshCw className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => removeFollow(f.id, f.label)} aria-label="Remove" className="text-destructive">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Categories">
        {categories.map((c) => (
          <Row key={c.id}>
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg text-sm" style={{ background: `color-mix(in oklch, ${c.color} 20%, transparent)` }}>
                {c.emoji}
              </span>
              <span className="text-sm font-medium">{c.name}</span>
            </div>
            <Button size="icon" variant="ghost" onClick={() => deleteCategory(c.id, c.name)} aria-label="Delete" className="text-destructive">
              <Trash2 className="size-4" />
            </Button>
          </Row>
        ))}
        <Button variant="secondary" onClick={addCategory} className="justify-start">
          <Plus data-icon="inline-start" /> New category
        </Button>
      </Section>

      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-2">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`rounded-lg border py-2 text-sm capitalize transition ${theme === t ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Data">
        <Button variant="secondary" onClick={exportAll} className="justify-start">
          <Download data-icon="inline-start" /> Export all to Calendar (.ics)
        </Button>
        <Button variant="secondary" onClick={downloadBackup} className="justify-start">
          <Save data-icon="inline-start" /> Download full backup (.json)
        </Button>
        <Button variant="secondary" onClick={restoreBackup} className="justify-start">
          <Upload data-icon="inline-start" /> Restore from backup
        </Button>
      </Section>

      <p className="pt-2 text-center text-xs text-muted-foreground">Radarr · your data is private to your account.</p>
    </div>
  );
}
