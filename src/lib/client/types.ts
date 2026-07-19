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
