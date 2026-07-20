"use client";

import { CalendarDays, Compass, ListChecks, Plus, Settings2, Trophy, User } from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from "@/components/ui/command";
import type { ClientEvent } from "@/lib/client/types";

type View = "upcoming" | "calendar" | "scores" | "discover" | "profile";

export function CommandPalette({
  open, onOpenChange, events, onNavigate, onNew, onSettings, onOpenEvent, now,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  events: ClientEvent[];
  onNavigate: (v: View) => void;
  onNew: () => void;
  onSettings: () => void;
  onOpenEvent: (e: ClientEvent) => void;
  now: number;
}) {
  const upcoming = events
    .filter((e) => new Date(e.start).getTime() > now - 3 * 3600_000)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 50);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Jump anywhere or add something">
      <CommandInput placeholder="Search events, jump to a tab, or add…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem value="new event add create" onSelect={() => run(onNew)}>
            <Plus /> New event <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem value="settings preferences" onSelect={() => run(onSettings)}>
            <Settings2 /> Settings
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Go to">
          <CommandItem value="upcoming list" onSelect={() => run(() => onNavigate("upcoming"))}>
            <ListChecks /> Upcoming
          </CommandItem>
          <CommandItem value="calendar month" onSelect={() => run(() => onNavigate("calendar"))}>
            <CalendarDays /> Calendar
          </CommandItem>
          <CommandItem value="scores standings" onSelect={() => run(() => onNavigate("scores"))}>
            <Trophy /> Scores
          </CommandItem>
          <CommandItem value="discover follow sources" onSelect={() => run(() => onNavigate("discover"))}>
            <Compass /> Discover
          </CommandItem>
          <CommandItem value="profile stats watched" onSelect={() => run(() => onNavigate("profile"))}>
            <User /> Profile
          </CommandItem>
        </CommandGroup>
        {upcoming.length > 0 && (
          <CommandGroup heading="Upcoming events">
            {upcoming.map((e) => (
              <CommandItem key={e.id} value={`${e.title} ${e.id}`} onSelect={() => run(() => onOpenEvent(e))}>
                {e.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
