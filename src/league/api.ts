import { callApi, copy, shareOrCopy, ApiError } from "../lib/client";
import { linkTo, makeMine, makeRef } from "../lib/kit";
export { ApiError, copy, shareOrCopy };

export type Row = { id: string; name: string; played: number; won: number; drawn: number; lost: number; for: number; against: number; diff: number; points: number };
export type Match = { id: string; homeId: string; awayId: string; homeScore: number | null; awayScore: number | null };
export type League = {
  reference: string;
  name: string;
  winPoints: number;
  drawPoints: number;
  expiresAt: string;
  teams: { id: string; name: string }[];
  table: Row[];
  matches: Match[];
  canExtend?: boolean;
};

const call = <T>(path: string, init?: RequestInit) => callApi<T>("league", path, init);
const send = <T>(method: string, path: string, data?: unknown) => call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  create: (d: { name: string; teams: string[]; winPoints: number; drawPoints: number; retentionDays: 30 | 90 }) =>
    send<{ reference: string; adminToken: string }>("POST", "/leagues", d),
  get: (ref: string) => call<League>(`/leagues/${encodeURIComponent(ref)}`),
  admin: (token: string) => call<League>(`/admin/${token}`),
  addMatch: (token: string, homeId: string, awayId: string, homeScore: number, awayScore: number) =>
    send<League>("POST", `/admin/${token}/matches`, { homeId, awayId, homeScore, awayScore }),
  setResult: (token: string, id: string, homeScore: number | null, awayScore: number | null) =>
    send<League>("PUT", `/admin/${token}/matches/${id}`, { homeScore, awayScore }),
  deleteMatch: (token: string, id: string) => send<League>("DELETE", `/admin/${token}/matches/${id}`),
  fixtures: (token: string, legs: 1 | 2) => send<League>("POST", `/admin/${token}/fixtures`, { legs }),
  addTeam: (token: string, name: string) => send<League>("POST", `/admin/${token}/teams`, { name }),
  removeTeam: (token: string, id: string) => send<League>("DELETE", `/admin/${token}/teams/${id}`),
  extend: (token: string) => send<{ expiresAt: string }>("POST", `/admin/${token}/extend`, {}),
};

export const mine = makeMine("league:mine");
export const normaliseRef = makeRef("LG");
export const leagueLink = (ref: string) => linkTo("league", "l", ref);
export const adminLink = (token: string) => linkTo("league", "admin", token);
