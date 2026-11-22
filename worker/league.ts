// Tab & Tally League API (/api/league/...), on its own D1 database.
// The organiser enters results; the table is worked out from them. Anyone with the LG- code can watch.

import { HttpError, body, cleanText, hashToken, json, newReference, newToken, now, refPattern, uid } from "./http";
import { expiryFor, extend, isExpired, parseRetention } from "./retention";
import { leagueTable, roundRobin } from "./table";

export interface LeagueEnv {
  LEAGUE: D1Database;
}

const REF_RE = refPattern("LG");
const TOKEN_RE = /^[0-9a-z]{32}$/;
const MAX_TEAMS = 20;
const MAX_MATCHES = 500;
const MAX_SCORE = 999;

type LeagueRow = { id: string; reference: string; name: string; win_points: number; draw_points: number; created_at: string; expires_at: string; extended: number };
const COLS = "id, reference, name, win_points, draw_points, created_at, expires_at, extended";

function live(l: LeagueRow | null, missing = "League not found"): LeagueRow {
  if (!l) throw new HttpError(404, missing);
  if (isExpired(Date.parse(l.expires_at), Date.now())) throw new HttpError(410, "This league has expired and been deleted");
  return l;
}

type MatchRow = { id: string; homeId: string; awayId: string; homeScore: number | null; awayScore: number | null };

async function view(env: LeagueEnv, l: LeagueRow, admin: boolean) {
  const teams = await env.LEAGUE.prepare("SELECT id, name FROM teams WHERE league_id = ? ORDER BY position").bind(l.id).all<{ id: string; name: string }>();
  const matches = await env.LEAGUE.prepare(
    "SELECT id, home_id AS homeId, away_id AS awayId, home_score AS homeScore, away_score AS awayScore FROM matches WHERE league_id = ? ORDER BY position",
  ).bind(l.id).all<MatchRow>();
  const results = matches.results.filter((m) => m.homeScore !== null && m.awayScore !== null).map((m) => ({
    homeId: m.homeId, awayId: m.awayId, homeScore: m.homeScore as number, awayScore: m.awayScore as number,
  }));
  const out: Record<string, unknown> = {
    reference: l.reference,
    name: l.name,
    winPoints: l.win_points,
    drawPoints: l.draw_points,
    expiresAt: l.expires_at,
    teams: teams.results,
    table: leagueTable(teams.results, results, l.win_points, l.draw_points),
    matches: matches.results,
  };
  if (admin) out.canExtend = extend(Date.parse(l.created_at), Date.parse(l.expires_at), l.extended === 1).ok;
  return json(out);
}

function points(v: unknown, d: number, field: string): number {
  if (v === undefined) return d;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 20) throw new HttpError(400, `${field} must be a whole number from 0 to 20`);
  return v;
}

async function create(env: LeagueEnv, req: Request) {
  const b = await body(req);
  const name = cleanText(b.name, "Name", 60);
  if (!Array.isArray(b.teams) || b.teams.length < 2 || b.teams.length > MAX_TEAMS) throw new HttpError(400, `Add between 2 and ${MAX_TEAMS} teams or players`);
  const teams = b.teams.map((t: unknown, i: number) => cleanText(t, `Team ${i + 1}`, 40));
  if (new Set(teams.map((t) => t.toLowerCase())).size !== teams.length) throw new HttpError(400, "Each team needs a different name");
  const win = points(b.winPoints, 3, "Points for a win");
  const draw = points(b.drawPoints, 1, "Points for a draw");
  const retention = parseRetention(b.retentionDays);
  if (!retention) throw new HttpError(400, "Leagues can be kept for 30 or 90 days");
  const id = uid();
  const created = now();
  const adminToken = newToken();
  const adminHash = await hashToken(adminToken);
  const expires = new Date(expiryFor(Date.parse(created), retention)).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference("LG");
    try {
      await env.LEAGUE.batch([
        env.LEAGUE.prepare("INSERT INTO leagues (id, reference, name, win_points, draw_points, admin_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, reference, name, win, draw, adminHash, created, expires),
        ...teams.map((t, i) => env.LEAGUE.prepare("INSERT INTO teams (id, league_id, name, position) VALUES (?, ?, ?, ?)").bind(uid(), id, t, i)),
      ]);
      return json({ reference, adminToken }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new HttpError(500, "Couldn't create a unique reference");
}

async function byAdmin(env: LeagueEnv, token: string) {
  return live(await env.LEAGUE.prepare(`SELECT ${COLS} FROM leagues WHERE admin_hash = ?`).bind(await hashToken(token)).first<LeagueRow>(), "This organiser link isn't valid");
}

function score(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_SCORE) throw new HttpError(400, `${field} must be a whole number from 0 to ${MAX_SCORE}`);
  return v;
}

async function count(env: LeagueEnv, leagueId: string): Promise<{ n: number; pos: number }> {
  return (await env.LEAGUE.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS pos FROM matches WHERE league_id = ?").bind(leagueId).first<{ n: number; pos: number }>()) ?? { n: 0, pos: -1 };
}

/** Record a result for a new match between two teams, or add it as a played match. */
async function addMatch(env: LeagueEnv, token: string, req: Request) {
  const l = await byAdmin(env, token);
  const x = await body(req);
  if (typeof x.homeId !== "string" || typeof x.awayId !== "string" || x.homeId === x.awayId) throw new HttpError(400, "Choose two different teams");
  const hs = score(x.homeScore, "Home score");
  const as = score(x.awayScore, "Away score");
  const c = await count(env, l.id);
  if (c.n >= MAX_MATCHES) throw new HttpError(409, "This league is full");
  const r = await env.LEAGUE.prepare(
    `INSERT INTO matches (id, league_id, home_id, away_id, home_score, away_score, position, played_at)
     SELECT ?, ?, h.id, a.id, ?, ?, ?, ? FROM teams h, teams a WHERE h.id = ? AND h.league_id = ? AND a.id = ? AND a.league_id = ?`,
  ).bind(uid(), l.id, hs, as, c.pos + 1, now(), x.homeId, l.id, x.awayId, l.id).run();
  if (r.meta.changes !== 1) throw new HttpError(404, "Those teams aren't in this league");
  return view(env, l, true);
}

async function setResult(env: LeagueEnv, token: string, id: string, req: Request) {
  const l = await byAdmin(env, token);
  const x = await body(req);
  if (x.homeScore === null && x.awayScore === null) {
    await env.LEAGUE.prepare("UPDATE matches SET home_score = NULL, away_score = NULL, played_at = NULL WHERE id = ? AND league_id = ?").bind(id, l.id).run();
    return view(env, l, true);
  }
  const r = await env.LEAGUE.prepare("UPDATE matches SET home_score = ?, away_score = ?, played_at = ? WHERE id = ? AND league_id = ?")
    .bind(score(x.homeScore, "Home score"), score(x.awayScore, "Away score"), now(), id, l.id).run();
  if (r.meta.changes !== 1) throw new HttpError(404, "That match isn't in this league");
  return view(env, l, true);
}

async function deleteMatch(env: LeagueEnv, token: string, id: string) {
  const l = await byAdmin(env, token);
  await env.LEAGUE.prepare("DELETE FROM matches WHERE id = ? AND league_id = ?").bind(id, l.id).run();
  return view(env, l, true);
}

async function makeFixtures(env: LeagueEnv, token: string, req: Request) {
  const l = await byAdmin(env, token);
  const x = await body(req);
  const legs = x.legs === 2 ? 2 : 1;
  const teams = await env.LEAGUE.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY position").bind(l.id).all<{ id: string }>();
  const pairs = roundRobin(teams.results.length, legs);
  const c = await count(env, l.id);
  if (c.n + pairs.length > MAX_MATCHES) throw new HttpError(409, "That would be too many matches for one league");
  await env.LEAGUE.batch(
    pairs.map(([a, b], i) =>
      env.LEAGUE.prepare("INSERT INTO matches (id, league_id, home_id, away_id, position) VALUES (?, ?, ?, ?, ?)").bind(uid(), l.id, teams.results[a].id, teams.results[b].id, c.pos + 1 + i),
    ),
  );
  return view(env, l, true);
}

async function addTeam(env: LeagueEnv, token: string, req: Request) {
  const l = await byAdmin(env, token);
  const name = cleanText((await body(req)).name, "Team name", 40);
  const c = await env.LEAGUE.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS pos FROM teams WHERE league_id = ?").bind(l.id).first<{ n: number; pos: number }>();
  if ((c?.n ?? 0) >= MAX_TEAMS) throw new HttpError(409, `A league holds up to ${MAX_TEAMS} teams`);
  try {
    await env.LEAGUE.prepare("INSERT INTO teams (id, league_id, name, position) VALUES (?, ?, ?, ?)").bind(uid(), l.id, name, (c?.pos ?? -1) + 1).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "A team already has that name");
    throw e;
  }
  return view(env, l, true);
}

async function removeTeam(env: LeagueEnv, token: string, id: string) {
  const l = await byAdmin(env, token);
  await env.LEAGUE.batch([
    env.LEAGUE.prepare("DELETE FROM matches WHERE league_id = ? AND (home_id = ? OR away_id = ?)").bind(l.id, id, id),
    env.LEAGUE.prepare("DELETE FROM teams WHERE id = ? AND league_id = ?").bind(id, l.id),
  ]);
  return view(env, l, true);
}

async function extendIt(env: LeagueEnv, token: string) {
  const l = await byAdmin(env, token);
  const r = extend(Date.parse(l.created_at), Date.parse(l.expires_at), l.extended === 1);
  if (!r.ok) throw new HttpError(409, r.reason);
  const expiresAt = new Date(r.expiresMs).toISOString();
  await env.LEAGUE.prepare("UPDATE leagues SET expires_at = ?, extended = 1 WHERE id = ?").bind(expiresAt, l.id).run();
  return json({ expiresAt });
}

/** path is everything after /api/league */
export async function handleLeague(req: Request, env: LeagueEnv, path: string[]): Promise<Response> {
  const [kind, key, sub, id] = path;
  const m = req.method;
  if (kind === "leagues" && !key) {
    if (m === "POST") return create(env, req);
    throw new HttpError(405, "Method not allowed");
  }
  if (kind === "leagues") {
    const ref = decodeURIComponent(key).toUpperCase();
    if (!REF_RE.test(ref)) throw new HttpError(404, "League not found");
    if (!sub && m === "GET") return view(env, live(await env.LEAGUE.prepare(`SELECT ${COLS} FROM leagues WHERE reference = ?`).bind(ref).first<LeagueRow>()), false);
  }
  if (kind === "admin") {
    const token = (key ?? "").toLowerCase();
    if (!TOKEN_RE.test(token)) throw new HttpError(404, "This link isn't valid");
    if (!sub && m === "GET") return view(env, await byAdmin(env, token), true);
    if (sub === "matches" && !id && m === "POST") return addMatch(env, token, req);
    if (sub === "matches" && id && m === "PUT") return setResult(env, token, id, req);
    if (sub === "matches" && id && m === "DELETE") return deleteMatch(env, token, id);
    if (sub === "fixtures" && m === "POST") return makeFixtures(env, token, req);
    if (sub === "teams" && !id && m === "POST") return addTeam(env, token, req);
    if (sub === "teams" && id && m === "DELETE") return removeTeam(env, token, id);
    if (sub === "extend" && m === "POST") return extendIt(env, token);
  }
  throw new HttpError(404, "Not found");
}

export async function purgeLeague(env: LeagueEnv): Promise<number> {
  const t = now();
  const sub = "SELECT id FROM leagues WHERE expires_at < ?";
  const r = await env.LEAGUE.batch([
    env.LEAGUE.prepare(`DELETE FROM matches WHERE league_id IN (${sub})`).bind(t),
    env.LEAGUE.prepare(`DELETE FROM teams WHERE league_id IN (${sub})`).bind(t),
    env.LEAGUE.prepare("DELETE FROM leagues WHERE expires_at < ?").bind(t),
  ]);
  return r[2].meta.changes;
}
