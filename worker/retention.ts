// Tab & Tally retention rules, shared by every tool.
// Groups live 30 days by default, or 90 if chosen at creation.
// One "keep another month" extension is allowed, never beyond 90 days in total.

export const DAY_MS = 86_400_000;
export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 90;
export const EXTENSION_DAYS = 30;

export type Retention = 30 | 90;

/** Accepts 30 or 90 (or nothing, meaning the 30-day default). */
export function parseRetention(v: unknown): Retention | null {
  if (v === undefined || v === null) return DEFAULT_DAYS;
  return v === 30 || v === 90 ? v : null;
}

export function expiryFor(createdMs: number, days: Retention): number {
  return createdMs + days * DAY_MS;
}

export function isExpired(expiresMs: number | null, nowMs: number): boolean {
  return expiresMs !== null && expiresMs < nowMs;
}

export type Extension = { ok: true; expiresMs: number } | { ok: false; reason: string };

export function extend(createdMs: number, expiresMs: number, alreadyExtended: boolean): Extension {
  if (alreadyExtended) return { ok: false, reason: "This group has already been extended once" };
  const next = Math.min(expiresMs + EXTENSION_DAYS * DAY_MS, createdMs + MAX_DAYS * DAY_MS);
  if (next <= expiresMs) return { ok: false, reason: "This group is already kept for the maximum 3 months" };
  return { ok: true, expiresMs: next };
}
