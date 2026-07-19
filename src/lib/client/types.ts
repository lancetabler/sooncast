export type { ClientEvent, ClientCategory } from "@/lib/serialize";
export type { ClientUser, ClientFollow, StateBundle } from "@/lib/state";
export type { PlanLimits } from "@/lib/domain/plan";
export type { TrackEvent, Occurrence } from "@/lib/domain/types";

export interface CatalogItem {
  provider: string;
  ref: string;
  label: string;
  sublabel?: string;
  categorySlug: string;
  imageUrl?: string;
}
