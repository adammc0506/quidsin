import { callApi, copy, shareOrCopy, ApiError } from "../lib/client";
import { linkTo, makeMine, makeRef } from "../lib/kit";
export { ApiError, copy, shareOrCopy };

export type Team = { id: string; name: string; total: number };
export type Quiz = {
  reference: string;
  name: string;
  expiresAt: string;
  teams: Team[];
  rounds: { id: string; name: string }[];
  scores: { roundId: string; teamId: string; points: number }[];
  canExtend?: boolean;
};

const call = <T>(path: string, init?: RequestInit) => callApi<T>("quiz", path, init);
const send = <T>(method: string, path: string, data?: unknown) => call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  create: (d: { name: string; teams: string[]; rounds: number; retentionDays: 30 | 90 }) => send<{ reference: string; adminToken: string }>("POST", "/quizzes", d),
  get: (ref: string) => call<Quiz>(`/quizzes/${encodeURIComponent(ref)}`),
  admin: (token: string) => call<Quiz>(`/admin/${token}`),
  score: (token: string, roundId: string, teamId: string, points: number | null) => send<Quiz>("POST", `/admin/${token}/scores`, { roundId, teamId, points }),
  addRound: (token: string, name?: string) => send<Quiz>("POST", `/admin/${token}/rounds`, { name }),
  renameRound: (token: string, id: string, name: string) => send<Quiz>("PUT", `/admin/${token}/rounds/${id}`, { name }),
  removeRound: (token: string, id: string) => send<Quiz>("DELETE", `/admin/${token}/rounds/${id}`),
  addTeam: (token: string, name: string) => send<Quiz>("POST", `/admin/${token}/teams`, { name }),
  removeTeam: (token: string, id: string) => send<Quiz>("DELETE", `/admin/${token}/teams/${id}`),
  extend: (token: string) => send<{ expiresAt: string }>("POST", `/admin/${token}/extend`, {}),
};

export const mine = makeMine("quiz:mine");
export const normaliseRef = makeRef("QZ");
export const quizLink = (ref: string) => linkTo("quiz", "q", ref);
export const adminLink = (token: string) => linkTo("quiz", "admin", token);
