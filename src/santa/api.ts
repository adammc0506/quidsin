// Secret Santa client: talks to /api/santa and remembers this device's private keys.
import { ApiError, callApi, copy, shareOrCopy } from "../lib/client";
export { ApiError, copy, shareOrCopy };

export type Person = { id: string; name: string; claimed: boolean };
export type Draw = {
  reference: string;
  name: string;
  budgetPence: number | null;
  exchangeDate: string | null;
  expiresAt: string;
  wishlists: boolean;
  people: Person[];
  canExtend?: boolean;
};
export type Me = {
  draw: Draw;
  me: { id: string; name: string; wishlist: string };
  recipient: { name: string; wishlist: string };
};



const call = <T>(path: string, init?: RequestInit) => callApi<T>("santa", path, init);

const post = <T>(path: string, data: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
  create: (d: { name: string; members: string[]; budgetPence?: number; exchangeDate?: string; wishlists: boolean; retentionDays: 30 | 90 }) =>
    post<{ reference: string; adminToken: string }>("/draws", d),
  draw: (ref: string) => call<Draw>(`/draws/${encodeURIComponent(ref)}`),
  claim: (ref: string, personId: string) => post<{ token: string }>(`/draws/${encodeURIComponent(ref)}/claim`, { personId }),
  me: (token: string) => call<Me>(`/me/${token}`),
  wishlist: (token: string, wishlist: string) =>
    call<{ wishlist: string }>(`/me/${token}/wishlist`, { method: "PUT", body: JSON.stringify({ wishlist }) }),
  admin: (token: string) => call<Draw>(`/admin/${token}`),
  release: (token: string, personId: string) => post<{ ok: true }>(`/admin/${token}/release`, { personId }),
  extend: (token: string) => post<{ expiresAt: string }>(`/admin/${token}/extend`, {}),
};

// ---------- this device's keys ----------

export type Saved = { ref: string; name: string; token?: string; admin?: string; me?: string };
const KEY = "santa:mine";

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
  get: (ref: string) => load().find((s) => s.ref === ref),
  save(entry: Saved) {
    const list = load().filter((s) => s.ref !== entry.ref);
    const old = load().find((s) => s.ref === entry.ref);
    list.unshift({ ...old, ...entry });
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
    } catch {
      /* storage blocked: links still work */
    }
  },
  forget(ref: string) {
    try {
      localStorage.setItem(KEY, JSON.stringify(load().filter((s) => s.ref !== ref)));
    } catch {
      /* ignore */
    }
  },
};

// ---------- references and links ----------

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function normaliseRef(input: string): string | null {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.startsWith("SS")) s = s.slice(2);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `SS-${s.slice(0, 4)}-${s.slice(4)}`;
}

const origin = () => (location.protocol.startsWith("http") ? location.origin : "https://tabandtally.co.uk");
export const groupLink = (ref: string) => `${origin()}/santa/#/d/${ref}`;
export const privateLink = (token: string) => `${origin()}/santa/#/me/${token}`;
export const adminLink = (token: string) => `${origin()}/santa/#/admin/${token}`;
