import type { ClientEvent, ClientCategory, StateBundle, CatalogItem, LiveStatus, LeagueOverview, LeagueProfile, CronStatus } from "./types";

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = {
  register: (b: { email: string; password: string; displayName?: string; timezone?: string }) =>
    req<{ id: string }>("/api/auth/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: { email: string; password: string }) =>
    req<{ id: string }>("/api/auth/login", { method: "POST", body: JSON.stringify(b) }),
  logout: () => req("/api/auth/logout", { method: "POST" }),

  state: () => req<StateBundle>("/api/state"),

  createEvent: (b: Partial<ClientEvent>) =>
    req<ClientEvent>("/api/events", { method: "POST", body: JSON.stringify(b) }),
  updateEvent: (id: string, b: Partial<ClientEvent>) =>
    req<ClientEvent>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteEvent: (id: string) => req(`/api/events/${id}`, { method: "DELETE" }),

  createCategory: (b: { name: string; emoji?: string; color?: string }) =>
    req<ClientCategory>("/api/categories", { method: "POST", body: JSON.stringify(b) }),
  updateCategory: (id: string, b: Partial<ClientCategory>) =>
    req<ClientCategory>(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteCategory: (id: string) => req(`/api/categories/${id}`, { method: "DELETE" }),

  searchSources: (q: string) =>
    req<{ items: CatalogItem[]; featured: boolean }>(`/api/sources/search?q=${encodeURIComponent(q)}`),
  leagueTeams: (ref: string) =>
    req<{ items: CatalogItem[] }>(`/api/sources/teams?ref=${encodeURIComponent(ref)}`),
  addFollow: (b: { provider: string; ref: string; label: string; categorySlug?: string | null }) =>
    req<{ result: { added: number; updated: number } }>("/api/follows", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  syncFollow: (id: string) => req<{ result: unknown }>(`/api/follows/${id}/sync`, { method: "POST" }),
  updateFollow: (id: string, b: { muted?: boolean; scoreAlerts?: boolean }) => req(`/api/follows/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteFollow: (id: string) => req(`/api/follows/${id}`, { method: "DELETE" }),

  saveSettings: (b: {
    displayName?: string | null;
    timezone?: string;
    defaultReminders?: number[];
    quietStart?: number | null;
    quietEnd?: number | null;
    favoriteAthletes?: string[];
  }) => req("/api/settings", { method: "PATCH", body: JSON.stringify(b) }),

  cronStatus: () => req<CronStatus>("/api/cron/status"),
  changePassword: (b: { currentPassword: string; newPassword: string }) =>
    req("/api/auth/change-password", { method: "POST", body: JSON.stringify(b) }),
  deleteAccount: (b: { password: string }) =>
    req("/api/auth/delete", { method: "POST", body: JSON.stringify(b) }),

  subscribePush: (sub: PushSubscriptionJSON) =>
    req("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  testPush: () => req<{ sent: number }>("/api/push/test", { method: "POST" }),

  live: (ids: string[]) =>
    req<Record<string, LiveStatus>>(`/api/live?ids=${encodeURIComponent(ids.join(","))}`),

  sportsOverview: () => req<{ leagues: LeagueOverview[] }>("/api/sports/overview"),

  leagueProfile: (provider: string, ref: string) =>
    req<LeagueProfile>(`/api/sources/league?provider=${encodeURIComponent(provider)}&ref=${encodeURIComponent(ref)}`),

  backup: () => req<Record<string, unknown>>("/api/backup"),
  restore: (data: unknown) =>
    req<{ addedEvents: number; addedFollows: number }>("/api/backup", { method: "POST", body: JSON.stringify(data) }),
};
