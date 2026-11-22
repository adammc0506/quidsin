// Killer Pool client: talks to /api/killer and remembers this device's games.
import { callApi, copy, shareOrCopy, ApiError } from "../lib/client";
export { ApiError, copy, shareOrCopy };

export type Player = { id: string; name: string; lives: number; killer: boolean; blacks: number; ball: number | null };
export type Rules = { mode: "balls" | "turns"; blackPays: boolean; killerRequired: boolean; ownLoses: boolean; scratchLoses: boolean; secretBalls: boolean };
export type GameEvent = {
  id: string;
  kind: "own" | "pot" | "scratch" | "adjust" | "hit" | "miss" | "black" | "skip";
  shooterId: string | null;
  victimId: string | null;
  livesPlayerId: string | null;
  livesDelta: number | null;
  killerPlayerId: string | null;
  blackPlayerId: string | null;
};
export type Game = {
  reference: string;
  name: string;
  startLives: number;
  rules: Rules;
  expiresAt: string;
  winnerId: string | null;
  turnId: string | null;
  players: Player[];
  recent: GameEvent[];
  canExtend?: boolean;
};
export type Setup = {
  mode: "balls" | "turns";
  blackPays: boolean;
  name: string;
  players: { name: string; ball?: number }[];
  lives: number;
  killerRequired: boolean;
  ownLoses: boolean;
  scratchLoses: boolean;
  secretBalls: boolean;
  retentionDays: 30 | 90;
};
export type Act =
  | { type: "own" | "scratch" | "hit" | "miss" | "black" | "skip"; shooterId: string }
  | { type: "rerack" }
  | { type: "pot"; shooterId: string; victimId: string }
  | { type: "adjust"; playerId: string; delta: 1 | -1 };

const call = <T>(path: string, init?: RequestInit) => callApi<T>("killer", path, init);
const send = <T>(method: string, path: string, data?: unknown) =>
  call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  create: (d: Setup) => send<{ reference: string; adminToken: string }>("POST", "/games", d),
  game: (ref: string) => call<Game>(`/games/${encodeURIComponent(ref)}`),
  admin: (token: string) => call<Game>(`/admin/${token}`),
  act: (token: string, a: Act) => send<Game>("POST", `/admin/${token}/actions`, a),
  undo: (token: string) => send<Game>("DELETE", `/admin/${token}/events/last`),
  restart: (token: string, reshuffle: boolean) => send<Game>("POST", `/admin/${token}/restart`, { reshuffle }),
  extend: (token: string) => send<{ expiresAt: string }>("POST", `/admin/${token}/extend`, {}),
};

// ---------- this device ----------

export type Saved = { ref: string; name: string; admin?: string };
const KEY = "killer:mine";
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
  if (s.startsWith("KP")) s = s.slice(2);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `KP-${s.slice(0, 4)}-${s.slice(4)}`;
}
const origin = () => (location.protocol.startsWith("http") ? location.origin : "https://tabandtally.co.uk");
export const gameLink = (ref: string) => `${origin()}/killerpool/#/g/${ref}`;
export const adminLink = (token: string) => `${origin()}/killerpool/#/admin/${token}`;
