// Whip-round client: talks to /api/whip and remembers this device's links.
import { callApi, copy, shareOrCopy, ApiError } from "../lib/client";
export { ApiError, copy, shareOrCopy };

export type Entry = { id: string; name: string; confirmed: boolean; amountPence?: number };
export type Pot = {
  reference: string;
  name: string;
  about: string;
  suggestedPence: number | null;
  targetPence: number | null;
  closesOn: string | null;
  howToPay: string;
  showAmounts: boolean;
  closed: boolean;
  expiresAt: string;
  totalPence: number;
  receivedPence: number;
  entries: Entry[];
  canExtend?: boolean;
};

const call = <T>(path: string, init?: RequestInit) => callApi<T>("whip", path, init);
const send = <T>(method: string, path: string, data?: unknown) =>
  call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  create: (d: {
    name: string;
    about?: string;
    suggestedPence?: number;
    targetPence?: number;
    closesOn?: string;
    howToPay?: string;
    showAmounts: boolean;
    retentionDays: 30 | 90;
  }) => send<{ reference: string; adminToken: string }>("POST", "/pots", d),
  pot: (ref: string) => call<Pot>(`/pots/${encodeURIComponent(ref)}`),
  chipIn: (ref: string, name: string, amountPence: number) =>
    send<{ id: string }>("POST", `/pots/${encodeURIComponent(ref)}/entries`, { name, amountPence }),
  admin: (token: string) => call<Pot>(`/admin/${token}`),
  confirm: (token: string, id: string, confirmed: boolean) => send<{ ok: true }>("POST", `/admin/${token}/entries/${id}`, { confirmed }),
  remove: (token: string, id: string) => send<{ ok: true }>("DELETE", `/admin/${token}/entries/${id}`),
  close: (token: string, closed: boolean) => send<{ closed: boolean }>("POST", `/admin/${token}/closed`, { closed }),
  extend: (token: string) => send<{ expiresAt: string }>("POST", `/admin/${token}/extend`, {}),
};

// ---------- this device ----------

export type Saved = { ref: string; name: string; admin?: string };
const KEY = "whip:mine";
const NAME_KEY = "whip:myname";

function load(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export const mine = {
  all: load,
  save(e: Saved) {
    const old = load().find((s) => s.ref === e.ref);
    const list = [{ ...old, ...e }, ...load().filter((s) => s.ref !== e.ref)].slice(0, 20);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* storage blocked: links still work */
    }
  },
  myName: () => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  },
  rememberName(n: string) {
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* ignore */
    }
  },
};

// ---------- references and links ----------

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function normaliseRef(input: string): string | null {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.startsWith("WR")) s = s.slice(2);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `WR-${s.slice(0, 4)}-${s.slice(4)}`;
}
const origin = () => (location.protocol.startsWith("http") ? location.origin : "https://tabandtally.co.uk");
export const potLink = (ref: string) => `${origin()}/whipround/#/p/${ref}`;
export const adminLink = (token: string) => `${origin()}/whipround/#/admin/${token}`;
