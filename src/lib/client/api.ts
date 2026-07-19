import type { ClientEvent, ClientCategory, StateBundle, CatalogItem } from "./types";

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
  addFollow: (b: { provider: string; ref: string; label: string; categorySlug?: string | null }) =>
    req<{ result: { added: number; updated: number; skippedForLimit: number } }>("/api/follows", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  syncFollow: (id: string) => req<{ result: unknown }>(`/api/follows/${id}/sync`, { method: "POST" }),
  deleteFollow: (id: string) => req(`/api/follows/${id}`, { method: "DELETE" }),

  saveSettings: (b: {
    displayName?: string | null;
    timezone?: string;
    defaultReminders?: number[];
    quietStart?: number | null;
    quietEnd?: number | null;
  }) => req("/api/settings", { method: "PATCH", body: JSON.stringify(b) }),

  subscribePush: (sub: PushSubscriptionJSON) =>
    req("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  testPush: () => req<{ sent: number }>("/api/push/test", { method: "POST" }),

  checkout: () => req<{ url?: string }>("/api/billing/checkout", { method: "POST" }),
  portal: () => req<{ url?: string }>("/api/billing/portal", { method: "POST" }),
};
