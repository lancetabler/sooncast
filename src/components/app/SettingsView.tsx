"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  BellRing, BellOff, CalendarClock, Copy, LogOut, RefreshCw, Trash2, Plus, Download, Upload, Save,
  Clock, Globe, Activity, KeyRound, CheckCircle2, AlertTriangle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog, TextPromptDialog } from "@/components/app/ConfirmDialog";
import { api, ApiError } from "@/lib/client/api";
import { enablePush, isStandalone, pushSupported } from "@/lib/client/push";
import { REMINDER_PRESETS, reminderLabel } from "@/lib/domain/format";
import { buildICS } from "@/lib/domain/ics";
import { PALETTE, EMOJI_CHOICES } from "@/lib/domain/categories";
import type { StateBundle, TrackEvent, CronStatus } from "@/lib/client/types";
import type { ClientEvent } from "@/lib/client/types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function minToTime(min: number) {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}
function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function ago(iso: string | null): string {
  if (!iso) return "never run";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function jobHealthy(name: string, iso: string | null): boolean {
  if (!iso) return false;
  const age = Date.now() - new Date(iso).getTime();
  return name === "reminders" ? age < 10 * 60_000 : age < 36 * 3600_000;
}

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

  const [name, setName] = useState(user.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [quietOn, setQuietOn] = useState(user.quietStart != null && user.quietEnd != null);
  const [quietStart, setQuietStart] = useState(user.quietStart ?? 22 * 60);
  const [quietEnd, setQuietEnd] = useState(user.quietEnd ?? 8 * 60);
  const [cron, setCron] = useState<CronStatus | null>(null);
  const [cpCur, setCpCur] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpBusy, setCpBusy] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [confirmDelAcct, setConfirmDelAcct] = useState(false);
  const [confirmFollow, setConfirmFollow] = useState<{ id: string; label: string } | null>(null);
  const [confirmCat, setConfirmCat] = useState<{ id: string; name: string } | null>(null);
  const [catPromptOpen, setCatPromptOpen] = useState(false);

  const timeZones = useMemo<string[]>(() => {
    try {
      const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
      return list && list.length ? list : [user.timezone];
    } catch {
      return [user.timezone];
    }
  }, [user.timezone]);

  useEffect(() => {
    api.cronStatus().then(setCron).catch(() => {});
  }, []);

  async function saveName() {
    setSavingName(true);
    try {
      await api.saveSettings({ displayName: name.trim() || null });
      toast.success("Name saved");
      onChanged();
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSavingName(false);
    }
  }
  async function saveTimezone(tz: string) {
    try {
      await api.saveSettings({ timezone: tz });
      toast.success("Time zone updated");
      onChanged();
    } catch {
      toast.error("Couldn't save");
    }
  }
  async function saveQuiet(on: boolean, s: number, e: number) {
    setQuietOn(on);
    setQuietStart(s);
    setQuietEnd(e);
    try {
      await api.saveSettings({ quietStart: on ? s : null, quietEnd: on ? e : null });
    } catch {
      toast.error("Couldn't save quiet hours");
    }
  }
  async function changePassword() {
    if (cpNew.length < 8) return toast.error("New password must be at least 8 characters");
    setCpBusy(true);
    try {
      await api.changePassword({ currentPassword: cpCur, newPassword: cpNew });
      toast.success("Password changed");
      setCpCur("");
      setCpNew("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't change password");
    } finally {
      setCpBusy(false);
    }
  }
  async function deleteAccount() {
    if (!delPw) return toast.error("Enter your password to confirm");
    setDelBusy(true);
    try {
      await api.deleteAccount({ password: delPw });
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete account");
      setDelBusy(false);
    }
  }

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
  async function removeFollow(id: string) {
    await api.deleteFollow(id).catch(() => {});
    onChanged();
  }
  async function toggleMute(id: string, muted: boolean) {
    try {
      await api.updateFollow(id, { muted: !muted });
      onChanged();
    } catch {
      toast.error("Couldn't update");
    }
  }

  async function addCategory(name: string) {
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const emoji = EMOJI_CHOICES[Math.floor(Math.random() * EMOJI_CHOICES.length)];
    try {
      await api.createCategory({ name, color, emoji });
      onChanged();
    } catch {
      toast.error("Couldn't add category");
    }
  }
  async function deleteCategory(id: string) {
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
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3.5">
          <label htmlFor="set-name" className="text-xs text-muted-foreground">Display name</label>
          <div className="flex gap-2">
            <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            <Button size="sm" onClick={saveName} disabled={savingName || name.trim() === (user.displayName ?? "")}>
              Save
            </Button>
          </div>
        </div>
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

      <Section title="Automations & delivery health">
        <div className="rounded-xl border border-border/70 bg-card p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <Activity className="size-4 text-primary" /> Background jobs
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            These keep reminders firing on time and schedules fresh. Point a free scheduler
            (<a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="text-primary">cron-job.org</a>)
            at each URL below at the suggested interval.
          </p>
          {!cron ? (
            <div className="py-2 text-xs text-muted-foreground">Checking…</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {cron.jobs.map((j) => {
                const healthy = jobHealthy(j.name, j.lastRun);
                return (
                  <div key={j.name} className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 shrink-0 rounded-full ${healthy ? "bg-emerald-400" : j.lastRun ? "bg-amber-400" : "bg-muted-foreground/50"}`} />
                      <span className="flex-1 text-sm font-medium">{j.label}</span>
                      <span className="text-[11px] text-muted-foreground">{j.recommended}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 pl-4">
                      <span className="text-[11px] text-muted-foreground">
                        {healthy ? <CheckCircle2 className="mr-1 inline size-3 text-emerald-400" /> : <AlertTriangle className="mr-1 inline size-3 text-amber-400" />}
                        Last run: {ago(j.lastRun)}
                      </span>
                      {j.url && (
                        <button
                          onClick={() => { navigator.clipboard?.writeText(j.url!); toast.success("URL copied"); }}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="size-3" /> Copy URL
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
                <span>Push {cron.push ? <span className="text-emerald-400">configured</span> : <span className="text-amber-400">not configured</span>}</span>
                {!cron.hasSecret && <span className="text-amber-400">CRON_SECRET not set — jobs are unprotected</span>}
                <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">
                  Set up pingers <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          )}
        </div>
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

      <Section title="Timing">
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3.5">
          <label htmlFor="set-tz" className="flex items-center gap-1.5 text-sm font-medium">
            <Globe className="size-4 text-primary" /> Time zone
          </label>
          <p className="text-xs text-muted-foreground">Used for quiet hours and your calendar feed.</p>
          <select
            id="set-tz"
            value={user.timezone}
            onChange={(e) => saveTimezone(e.target.value)}
            className="mt-1 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {(timeZones.includes(user.timezone) ? timeZones : [user.timezone, ...timeZones]).map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Clock className="size-4 text-primary" /> Quiet hours
            </span>
            <button
              onClick={() => saveQuiet(!quietOn, quietStart, quietEnd)}
              className={`relative h-6 w-11 rounded-full transition ${quietOn ? "bg-primary" : "bg-secondary"}`}
              aria-label="Toggle quiet hours"
            >
              <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${quietOn ? "left-[1.375rem]" : "left-0.5"}`} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">No notifications will be sent during this window.</p>
          {quietOn && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="time"
                value={minToTime(quietStart)}
                onChange={(e) => saveQuiet(true, timeToMin(e.target.value), quietEnd)}
                className="rounded-md border border-border bg-card px-2 py-1.5"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="time"
                value={minToTime(quietEnd)}
                onChange={(e) => saveQuiet(true, quietStart, timeToMin(e.target.value))}
                className="rounded-md border border-border bg-card px-2 py-1.5"
              />
            </div>
          )}
        </div>
      </Section>

      <Section title={`Sources${follows.length ? ` · ${follows.length}` : ""}`}>
        {follows.length === 0 && <p className="px-1 text-xs text-muted-foreground">Follow leagues, teams and series from the Discover tab.</p>}
        {follows.map((f) => (
          <Row key={f.id}>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{f.label}</div>
              <div className="text-xs text-muted-foreground">
                {f.count} events{f.muted ? " · muted" : ""}{f.lastSync ? ` · synced ${new Date(f.lastSync).toLocaleDateString()}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" onClick={() => toggleMute(f.id, f.muted)} aria-label={f.muted ? "Unmute" : "Mute"} className={f.muted ? "text-amber-400" : ""}>
                {f.muted ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => syncFollow(f.id, f.label)} aria-label="Sync">
                <RefreshCw className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setConfirmFollow({ id: f.id, label: f.label })} aria-label="Remove" className="text-destructive">
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
            <Button size="icon" variant="ghost" onClick={() => setConfirmCat({ id: c.id, name: c.name })} aria-label="Delete" className="text-destructive">
              <Trash2 className="size-4" />
            </Button>
          </Row>
        ))}
        <Button variant="secondary" onClick={() => setCatPromptOpen(true)} className="justify-start">
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

      <Section title="Security">
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3.5">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="size-4 text-primary" /> Change password
          </div>
          <Input type="password" autoComplete="current-password" value={cpCur} onChange={(e) => setCpCur(e.target.value)} placeholder="Current password" />
          <Input type="password" autoComplete="new-password" value={cpNew} onChange={(e) => setCpNew(e.target.value)} placeholder="New password (8+ characters)" />
          <Button size="sm" onClick={changePassword} disabled={cpBusy || !cpCur || !cpNew} className="self-start">
            {cpBusy ? "Saving…" : "Update password"}
          </Button>
        </div>
      </Section>

      <Section title="Danger zone">
        <div className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" /> Delete account
          </div>
          <p className="text-xs text-muted-foreground">Permanently removes your account, events, sources and history. This can&apos;t be undone.</p>
          <Input type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder="Confirm your password" />
          <Button size="sm" variant="destructive" onClick={() => setConfirmDelAcct(true)} disabled={delBusy || !delPw} className="self-start">
            {delBusy ? "Deleting…" : "Delete my account"}
          </Button>
        </div>
      </Section>

      <p className="pt-2 text-center text-xs text-muted-foreground">Radarr · your data is private to your account.</p>

      <ConfirmDialog
        open={!!confirmFollow}
        onOpenChange={(o) => !o && setConfirmFollow(null)}
        title={confirmFollow ? `Remove ${confirmFollow.label}?` : "Remove?"}
        description="Its imported events disappear from your Upcoming and Calendar."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (confirmFollow) await removeFollow(confirmFollow.id);
        }}
      />
      <ConfirmDialog
        open={!!confirmCat}
        onOpenChange={(o) => !o && setConfirmCat(null)}
        title={confirmCat ? `Delete "${confirmCat.name}"?` : "Delete?"}
        description="Its events stay but lose their category."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmCat) await deleteCategory(confirmCat.id);
        }}
      />
      <ConfirmDialog
        open={confirmDelAcct}
        onOpenChange={setConfirmDelAcct}
        title="Delete your account?"
        description="Permanently deletes your account and ALL your data. This cannot be undone."
        confirmLabel="Delete forever"
        onConfirm={async () => {
          await deleteAccount();
        }}
      />
      <TextPromptDialog
        open={catPromptOpen}
        onOpenChange={setCatPromptOpen}
        title="New category"
        placeholder="Category name"
        onSubmit={addCategory}
      />
    </div>
  );
}
