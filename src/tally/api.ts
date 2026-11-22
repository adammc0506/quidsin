// Tally client: talks to /api/tally and remembers this device's boards.
import { callApi, copy, shareOrCopy, ApiError } from "../lib/client";
export { ApiError, copy, shareOrCopy };

export type Player = { id: string; name: string; total: number };
export type ScoreEvent = { id: string; playerId: string; points: number; createdAt: string };
export type Board = {
  reference: string;
  name: string;
  lowerWins: boolean;
  expiresAt: string;
  players: Player[];
  recent: ScoreEvent[];
  canExtend?: boolean;
};

const call = <T>(path: string, init?: RequestInit) => callApi<T>("tally", path, init);
const send = <T>(method: string, path: string, data?: unknown) =>
  call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  create: (d: { name: string; players: string[]; lowerWins: boolean; retentionDays: 30 | 90 }) =>
    send<{ reference: string; adminToken: string }>("POST", "/boards", d),
  board: (ref: string) => call<Board>(`/boards/${encodeURIComponent(ref)}`),
  admin: (token: string) => call<Board>(`/admin/${token}`),
  score: (token: string, playerId: string, points: number) => send<Board>("POST", `/admin/${token}/scores`, { playerId, points }),
  undo: (token: string) => send<Board>("DELETE", `/admin/${token}/scores/last`),
  reset: (token: string) => send<Board>("DELETE", `/admin/${token}/scores`),
  addPlayer: (token: string, name: string) => send<Board>("POST", `/admin/${token}/players`, { name }),
  removePlayer: (token: string, id: string) => send<Board>("DELETE", `/admin/${token}/players/${id}`),
  extend: (token: string) => send<{ expiresAt: string }>("POST", `/admin/${token}/extend`, {}),
};

// ---------- this device ----------

export type Saved = { ref: string; name: string; admin?: string };
const KEY = "tally:mine";

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
};

// ---------- references and links ----------

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function normaliseRef(input: string): string | null {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.startsWith("TL")) s = s.slice(2);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `TL-${s.slice(0, 4)}-${s.slice(4)}`;
}
const origin = () => (location.protocol.startsWith("http") ? location.origin : "https://tabandtally.co.uk");
export const boardLink = (ref: string) => `${origin()}/tally/#/b/${ref}`;
export const adminLink = (token: string) => `${origin()}/tally/#/admin/${token}`;
