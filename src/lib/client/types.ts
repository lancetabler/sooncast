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
  description?: string;
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
  /** Set for race/tournament/card events that have no home/away pairing. */
  name?: string;
  /** Winner's name for finished races/tournaments. */
  winner?: string;
  favorite: boolean;
}
export interface LiveBoardRow {
  pos: number;
  name: string;
  detail?: string;
}
/** Real-time running order (OpenF1 / NASCAR live feed) while a session is on track. */
export interface LiveBoard {
  title: string;
  rows: LiveBoardRow[];
}
export interface LeagueOverview {
  ref: string;
  label: string;
  news: NewsItem[];
  standings: StandingRow[];
  scores: ScoreGame[];
  live?: LiveBoard;
}

export interface Champion {
  season: string;
  name: string;
}
export interface LeagueProfile {
  label: string;
  description?: string;
  logo?: string;
  website?: string;
  meta: Array<{ label: string; value: string }>;
  standingsTitle: string;
  standings: StandingRow[];
  results: ScoreGame[];
  champions: Champion[];
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
