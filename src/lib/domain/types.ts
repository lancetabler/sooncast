export type Freq = "none" | "daily" | "weekly" | "biweekly" | "monthly";

export interface TrackEvent {
  id: string;
  title: string;
  categoryId?: string | null;
  start: string; // ISO instant
  allDay: boolean;
  durationMin: number;
  freq: Freq;
  until?: string | null;
  reminders: number[]; // minutes before start
  countUp?: boolean;
  location?: string | null;
  url?: string | null;
  note?: string | null;
  imageUrl?: string | null;
}

export interface Occurrence {
  event: TrackEvent;
  start: Date;
  end: Date;
  key: string; // eventId@startISO
}

export interface ReminderFire {
  key: string; // occKey#minutes
  eventId: string;
  title: string;
  fireAt: Date;
  occStart: Date;
  minutes: number;
  location?: string | null;
  url?: string | null;
}
