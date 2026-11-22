import { describe, expect, it } from "vitest";
import { DAY_MS, expiryFor, extend, isExpired, parseRetention } from "./retention";

const t0 = Date.parse("2026-11-22T10:00:00Z");

describe("retention", () => {
  it("defaults to 30 days and only accepts 30 or 90", () => {
    expect(parseRetention(undefined)).toBe(30);
    expect(parseRetention(30)).toBe(30);
    expect(parseRetention(90)).toBe(90);
    expect(parseRetention(60)).toBeNull();
    expect(parseRetention("90")).toBeNull();
  });

  it("sets the expiry from the creation time", () => {
    expect(expiryFor(t0, 30)).toBe(t0 + 30 * DAY_MS);
    expect(expiryFor(t0, 90)).toBe(t0 + 90 * DAY_MS);
  });

  it("treats a group as expired only after its expiry time", () => {
    const exp = expiryFor(t0, 30);
    expect(isExpired(exp, exp)).toBe(false);
    expect(isExpired(exp, exp + 1)).toBe(true);
    expect(isExpired(null, exp + 1e12)).toBe(false);
  });

  it("lets a 30-day group extend once, by a month", () => {
    const exp = expiryFor(t0, 30);
    const r = extend(t0, exp, false);
    expect(r).toEqual({ ok: true, expiresMs: exp + 30 * DAY_MS });
  });

  it("refuses a second extension", () => {
    const exp = expiryFor(t0, 30) + 30 * DAY_MS;
    expect(extend(t0, exp, true).ok).toBe(false);
  });

  it("refuses to go past 3 months in total", () => {
    expect(extend(t0, expiryFor(t0, 90), false).ok).toBe(false);
  });

  it("caps an extension at 90 days from creation", () => {
    const exp = t0 + 80 * DAY_MS; // e.g. an older group
    const r = extend(t0, exp, false);
    expect(r).toEqual({ ok: true, expiresMs: t0 + 90 * DAY_MS });
  });
});
