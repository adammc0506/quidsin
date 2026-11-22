import { callApi, copy, shareOrCopy, ApiError } from "../lib/client";
import { linkTo, makeMine, makeRef } from "../lib/kit";
export { ApiError, copy, shareOrCopy };

export type Status = "in" | "out" | "won";
export type Item = { id: string; label: string; status: Status; entrantId: string | null };
export type Sweep = {
  reference: string;
  name: string;
  about: string;
  expiresAt: string;
  entrants: { id: string; name: string }[];
  items: Item[];
  canExtend?: boolean;
};

const call = <T>(path: string, init?: RequestInit) => callApi<T>("sweep", path, init);
const send = <T>(method: string, path: string, data?: unknown) => call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  create: (d: { name: string; about: string; items: string[]; entrants: string[]; retentionDays: 30 | 90 }) =>
    send<{ reference: string; adminToken: string }>("POST", "/sweeps", d),
  get: (ref: string) => call<Sweep>(`/sweeps/${encodeURIComponent(ref)}`),
  admin: (token: string) => call<Sweep>(`/admin/${token}`),
  setStatus: (token: string, itemId: string, status: Status) => send<Sweep>("POST", `/admin/${token}/items/${itemId}`, { status }),
  extend: (token: string) => send<{ expiresAt: string }>("POST", `/admin/${token}/extend`, {}),
};

export const mine = makeMine("sweep:mine");
export const normaliseRef = makeRef("SW");
export const sweepLink = (ref: string) => linkTo("sweepstake", "s", ref);
export const adminLink = (token: string) => linkTo("sweepstake", "admin", token);
