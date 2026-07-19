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
export interface LeagueOverview {
  ref: string;
  label: string;
  news: NewsItem[];
  standings: StandingRow[];
}
