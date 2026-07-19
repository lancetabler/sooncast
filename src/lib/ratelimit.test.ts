import { describe, it, expect } from "vitest";
import { checkRate, type RateState } from "./ratelimit";

describe("checkRate", () => {
  it("allows up to the limit, then blocks", () => {
    const store = new Map<string, RateState>();
    const now = 1000;
    expect(checkRate(store, "k", 3, 60_000, now).ok).toBe(true);
    expect(checkRate(store, "k", 3, 60_000, now).ok).toBe(true);
    expect(checkRate(store, "k", 3, 60_000, now).ok).toBe(true);
    const blocked = checkRate(store, "k", 3, 60_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window passes", () => {
    const store = new Map<string, RateState>();
    checkRate(store, "k", 1, 60_000, 1000);
    expect(checkRate(store, "k", 1, 60_000, 1000).ok).toBe(false);
    expect(checkRate(store, "k", 1, 60_000, 62_000).ok).toBe(true); // window elapsed
  });

  it("tracks keys independently", () => {
    const store = new Map<string, RateState>();
    checkRate(store, "a", 1, 60_000, 1000);
    expect(checkRate(store, "b", 1, 60_000, 1000).ok).toBe(true);
  });
});
