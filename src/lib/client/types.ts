export type { ClientEvent, ClientCategory } from "@/lib/serialize";
export type { ClientUser, ClientFollow, StateBundle } from "@/lib/state";
export type { TrackEvent, Occurrence } from "@/lib/domain/types";

export interface CatalogItem {
  provider: string;
  ref: string;
  label: string;
  sublabel?: string;
  categorySlug: string;
  imageUrl?: string;
  browse?: boolean;
}

export interface LiveStatus {
  state: "pre" | "in" | "post";
  detail: string;
  home?: { abbr: string; score: string };
  away?: { abbr: string; score: string };
}

export interface NewsItem {
  headline: string;
  description?: string;
  link?: string;
  image?: string;
}
export interface StandingRow {
  rank: number;
  team: string;
  logo?: string;
  record?: string;
  points?: string;
  highlight: boolean;
}
export interface ScoreTeam {
  abbr: string;
  name: string;
  score: string;
  logo?: string;
}
export interface ScoreGame {
  id: string;
  state: "pre" | "in" | "post";
  detail: string;
  startISO: string;
  home?: ScoreTeam;
  away?: ScoreTeam;
  favorite: boolean;
}
export interface LeagueOverview {
  ref: string;
  label: string;
  news: NewsItem[];
  standings: StandingRow[];
  scores: ScoreGame[];
}

export interface CronJobStatus {
  name: string;
  label: string;
  recommended: string;
  lastRun: string | null;
  url: string | null;
}
export interface CronStatus {
  appUrl: string;
  hasSecret: boolean;
  push: boolean;
  jobs: CronJobStatus[];
}
