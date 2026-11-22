// Tab & Tally Quiz Night API (/api/quiz/...), on its own D1 database.
// The quizmaster enters each team's score for each round; everyone else watches the leaderboard.

import { HttpError, body, cleanText, hashToken, json, newReference, newToken, now, refPattern, uid } from "./http";
import { expiryFor, extend, isExpired, parseRetention } from "./retention";

export interface QuizEnv {
  QUIZ: D1Database;
}

const REF_RE = refPattern("QZ");
const TOKEN_RE = /^[0-9a-z]{32}$/;
const MAX_TEAMS = 40;
const MAX_ROUNDS = 30;
const MAX_POINTS = 1000;

type QuizRow = { id: string; reference: string; name: string; created_at: string; expires_at: string; extended: number };
const COLS = "id, reference, name, created_at, expires_at, extended";

function live(q: QuizRow | null, missing = "Quiz not found"): QuizRow {
  if (!q) throw new HttpError(404, missing);
  if (isExpired(Date.parse(q.expires_at), Date.now())) throw new HttpError(410, "This quiz has expired and been deleted");
  return q;
}

async function view(env: QuizEnv, q: QuizRow, admin: boolean) {
  const teams = await env.QUIZ.prepare(
    `SELECT t.id, t.name, COALESCE(SUM(s.points), 0) AS total FROM teams t LEFT JOIN scores s ON s.team_id = t.id
     WHERE t.quiz_id = ? GROUP BY t.id ORDER BY t.position`,
  ).bind(q.id).all<{ id: string; name: string; total: number }>();
  const rounds = await env.QUIZ.prepare("SELECT id, name FROM rounds WHERE quiz_id = ? ORDER BY position").bind(q.id).all<{ id: string; name: string }>();
  const scores = await env.QUIZ.prepare("SELECT round_id AS roundId, team_id AS teamId, points FROM scores WHERE quiz_id = ?")
    .bind(q.id)
    .all<{ roundId: string; teamId: string; points: number }>();
  const out: Record<string, unknown> = { reference: q.reference, name: q.name, expiresAt: q.expires_at, teams: teams.results, rounds: rounds.results, scores: scores.results };
  if (admin) out.canExtend = extend(Date.parse(q.created_at), Date.parse(q.expires_at), q.extended === 1).ok;
  return json(out);
}

async function create(env: QuizEnv, req: Request) {
  const b = await body(req);
  const name = cleanText(b.name, "Name", 60);
  if (!Array.isArray(b.teams) || b.teams.length < 1 || b.teams.length > MAX_TEAMS) throw new HttpError(400, `Add between 1 and ${MAX_TEAMS} teams`);
  const teams = b.teams.map((t: unknown, i: number) => cleanText(t, `Team ${i + 1}`, 40));
  if (new Set(teams.map((t) => t.toLowerCase())).size !== teams.length) throw new HttpError(400, "Each team needs a different name");
  const n = b.rounds === undefined ? 6 : b.rounds;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_ROUNDS) throw new HttpError(400, `A quiz has between 1 and ${MAX_ROUNDS} rounds`);
  const retention = parseRetention(b.retentionDays);
  if (!retention) throw new HttpError(400, "Quizzes can be kept for 30 or 90 days");
  const id = uid();
  const created = now();
  const adminToken = newToken();
  const adminHash = await hashToken(adminToken);
  const expires = new Date(expiryFor(Date.parse(created), retention)).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference("QZ");
    try {
      await env.QUIZ.batch([
        env.QUIZ.prepare("INSERT INTO quizzes (id, reference, name, admin_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, reference, name, adminHash, created, expires),
        ...teams.map((t, i) => env.QUIZ.prepare("INSERT INTO teams (id, quiz_id, name, position) VALUES (?, ?, ?, ?)").bind(uid(), id, t, i)),
        ...Array.from({ length: n }, (_, i) => env.QUIZ.prepare("INSERT INTO rounds (id, quiz_id, name, position) VALUES (?, ?, ?, ?)").bind(uid(), id, `Round ${i + 1}`, i)),
      ]);
      return json({ reference, adminToken }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new HttpError(500, "Couldn't create a unique reference");
}

async function byAdmin(env: QuizEnv, token: string) {
  return live(await env.QUIZ.prepare(`SELECT ${COLS} FROM quizzes WHERE admin_hash = ?`).bind(await hashToken(token)).first<QuizRow>(), "This quizmaster link isn't valid");
}

async function setScore(env: QuizEnv, token: string, req: Request) {
  const q = await byAdmin(env, token);
  const x = await body(req);
  if (typeof x.roundId !== "string" || typeof x.teamId !== "string") throw new HttpError(400, "Choose a team and a round");
  const p = x.points;
  if (p === null) {
    await env.QUIZ.prepare("DELETE FROM scores WHERE round_id = ? AND team_id = ? AND quiz_id = ?").bind(x.roundId, x.teamId, q.id).run();
    return view(env, q, true);
  }
  if (typeof p !== "number" || !Number.isFinite(p) || Math.abs(p) > MAX_POINTS || Math.round(p * 2) !== p * 2) throw new HttpError(400, "Points must be a whole or half number");
  const r = await env.QUIZ.prepare(
    `INSERT INTO scores (round_id, team_id, quiz_id, points)
     SELECT r.id, t.id, ?, ? FROM rounds r, teams t WHERE r.id = ? AND r.quiz_id = ? AND t.id = ? AND t.quiz_id = ?
     ON CONFLICT (round_id, team_id) DO UPDATE SET points = excluded.points`,
  ).bind(q.id, p, x.roundId, q.id, x.teamId, q.id).run();
  if (r.meta.changes < 1) throw new HttpError(404, "That team or round isn't in this quiz");
  return view(env, q, true);
}

async function addRound(env: QuizEnv, token: string, req: Request) {
  const q = await byAdmin(env, token);
  const x = await body(req);
  const c = await env.QUIZ.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS pos FROM rounds WHERE quiz_id = ?").bind(q.id).first<{ n: number; pos: number }>();
  if ((c?.n ?? 0) >= MAX_ROUNDS) throw new HttpError(409, `A quiz holds up to ${MAX_ROUNDS} rounds`);
  const name = x.name === undefined || x.name === "" ? `Round ${(c?.n ?? 0) + 1}` : cleanText(x.name, "Round name", 40);
  await env.QUIZ.prepare("INSERT INTO rounds (id, quiz_id, name, position) VALUES (?, ?, ?, ?)").bind(uid(), q.id, name, (c?.pos ?? -1) + 1).run();
  return view(env, q, true);
}

async function renameRound(env: QuizEnv, token: string, id: string, req: Request) {
  const q = await byAdmin(env, token);
  const name = cleanText((await body(req)).name, "Round name", 40);
  const r = await env.QUIZ.prepare("UPDATE rounds SET name = ? WHERE id = ? AND quiz_id = ?").bind(name, id, q.id).run();
  if (r.meta.changes !== 1) throw new HttpError(404, "That round isn't in this quiz");
  return view(env, q, true);
}

async function removeRound(env: QuizEnv, token: string, id: string) {
  const q = await byAdmin(env, token);
  await env.QUIZ.batch([
    env.QUIZ.prepare("DELETE FROM scores WHERE round_id = ? AND quiz_id = ?").bind(id, q.id),
    env.QUIZ.prepare("DELETE FROM rounds WHERE id = ? AND quiz_id = ?").bind(id, q.id),
  ]);
  return view(env, q, true);
}

async function addTeam(env: QuizEnv, token: string, req: Request) {
  const q = await byAdmin(env, token);
  const name = cleanText((await body(req)).name, "Team name", 40);
  const c = await env.QUIZ.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS pos FROM teams WHERE quiz_id = ?").bind(q.id).first<{ n: number; pos: number }>();
  if ((c?.n ?? 0) >= MAX_TEAMS) throw new HttpError(409, `A quiz holds up to ${MAX_TEAMS} teams`);
  try {
    await env.QUIZ.prepare("INSERT INTO teams (id, quiz_id, name, position) VALUES (?, ?, ?, ?)").bind(uid(), q.id, name, (c?.pos ?? -1) + 1).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "A team already has that name");
    throw e;
  }
  return view(env, q, true);
}

async function removeTeam(env: QuizEnv, token: string, id: string) {
  const q = await byAdmin(env, token);
  await env.QUIZ.batch([
    env.QUIZ.prepare("DELETE FROM scores WHERE team_id = ? AND quiz_id = ?").bind(id, q.id),
    env.QUIZ.prepare("DELETE FROM teams WHERE id = ? AND quiz_id = ?").bind(id, q.id),
  ]);
  return view(env, q, true);
}

async function extendIt(env: QuizEnv, token: string) {
  const q = await byAdmin(env, token);
  const r = extend(Date.parse(q.created_at), Date.parse(q.expires_at), q.extended === 1);
  if (!r.ok) throw new HttpError(409, r.reason);
  const expiresAt = new Date(r.expiresMs).toISOString();
  await env.QUIZ.prepare("UPDATE quizzes SET expires_at = ?, extended = 1 WHERE id = ?").bind(expiresAt, q.id).run();
  return json({ expiresAt });
}

/** path is everything after /api/quiz */
export async function handleQuiz(req: Request, env: QuizEnv, path: string[]): Promise<Response> {
  const [kind, key, sub, id] = path;
  const m = req.method;
  if (kind === "quizzes" && !key) {
    if (m === "POST") return create(env, req);
    throw new HttpError(405, "Method not allowed");
  }
  if (kind === "quizzes") {
    const ref = decodeURIComponent(key).toUpperCase();
    if (!REF_RE.test(ref)) throw new HttpError(404, "Quiz not found");
    if (!sub && m === "GET") return view(env, live(await env.QUIZ.prepare(`SELECT ${COLS} FROM quizzes WHERE reference = ?`).bind(ref).first<QuizRow>()), false);
  }
  if (kind === "admin") {
    const token = (key ?? "").toLowerCase();
    if (!TOKEN_RE.test(token)) throw new HttpError(404, "This link isn't valid");
    if (!sub && m === "GET") return view(env, await byAdmin(env, token), true);
    if (sub === "scores" && m === "POST") return setScore(env, token, req);
    if (sub === "rounds" && !id && m === "POST") return addRound(env, token, req);
    if (sub === "rounds" && id && m === "PUT") return renameRound(env, token, id, req);
    if (sub === "rounds" && id && m === "DELETE") return removeRound(env, token, id);
    if (sub === "teams" && !id && m === "POST") return addTeam(env, token, req);
    if (sub === "teams" && id && m === "DELETE") return removeTeam(env, token, id);
    if (sub === "extend" && m === "POST") return extendIt(env, token);
  }
  throw new HttpError(404, "Not found");
}

export async function purgeQuiz(env: QuizEnv): Promise<number> {
  const t = now();
  const sub = "SELECT id FROM quizzes WHERE expires_at < ?";
  const r = await env.QUIZ.batch([
    env.QUIZ.prepare(`DELETE FROM scores WHERE quiz_id IN (${sub})`).bind(t),
    env.QUIZ.prepare(`DELETE FROM rounds WHERE quiz_id IN (${sub})`).bind(t),
    env.QUIZ.prepare(`DELETE FROM teams WHERE quiz_id IN (${sub})`).bind(t),
    env.QUIZ.prepare("DELETE FROM quizzes WHERE expires_at < ?").bind(t),
  ]);
  return r[3].meta.changes;
}
