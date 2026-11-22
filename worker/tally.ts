// Tab & Tally score keeper API (/api/tally/...), on its own D1 database.
// The scorekeeper's private link changes scores; the shared TL- code lets everyone else watch.

import { HttpError, body, cleanText, hashToken, json, newReference, newToken, now, refPattern, uid } from "./http";
import { expiryFor, extend, isExpired, parseRetention } from "./retention";

export interface TallyEnv {
  TALLY: D1Database;
}

const REF_RE = refPattern("TL");
const TOKEN_RE = /^[0-9a-z]{32}$/;
const MAX_PLAYERS = 20;
const MAX_SCORES = 2000;
const MAX_POINTS = 100_000;
const RECENT = 30;

type BoardRow = {
  id: string;
  reference: string;
  name: string;
  lower_wins: number;
  created_at: string;
  expires_at: string;
  extended: number;
};
const BOARD_COLS = "id, reference, name, lower_wins, created_at, expires_at, extended";

function live(b: BoardRow | null, missing = "Scoreboard not found"): BoardRow {
  if (!b) throw new HttpError(404, missing);
  if (isExpired(Date.parse(b.expires_at), Date.now())) throw new HttpError(410, "This scoreboard has expired and been deleted");
  return b;
}

async function view(env: TallyEnv, b: BoardRow, admin: boolean) {
  const players = await env.TALLY.prepare(
    `SELECT p.id, p.name, COALESCE(SUM(s.points), 0) AS total
     FROM players p LEFT JOIN scores s ON s.player_id = p.id
     WHERE p.board_id = ? GROUP BY p.id ORDER BY p.position`,
  )
    .bind(b.id)
    .all<{ id: string; name: string; total: number }>();
  const recent = await env.TALLY.prepare(
    "SELECT id, player_id AS playerId, points, created_at AS createdAt FROM scores WHERE board_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
  )
    .bind(b.id, RECENT)
    .all<{ id: string; playerId: string; points: number; createdAt: string }>();
  const out: Record<string, unknown> = {
    reference: b.reference,
    name: b.name,
    lowerWins: b.lower_wins === 1,
    expiresAt: b.expires_at,
    players: players.results,
    recent: recent.results,
  };
  if (admin) out.canExtend = extend(Date.parse(b.created_at), Date.parse(b.expires_at), b.extended === 1).ok;
  return json(out);
}

async function createBoard(env: TallyEnv, req: Request) {
  const b = await body(req);
  const name = cleanText(b.name, "Name", 60);
  if (!Array.isArray(b.players)) throw new HttpError(400, "players must be a list");
  const players = b.players.map((m, i) => cleanText(m, `Player ${i + 1}`, 40));
  if (players.length < 1 || players.length > MAX_PLAYERS) throw new HttpError(400, `Add between 1 and ${MAX_PLAYERS} players`);
  if (new Set(players.map((p) => p.toLowerCase())).size !== players.length) throw new HttpError(400, "Each player needs a different name");
  if (b.lowerWins !== undefined && typeof b.lowerWins !== "boolean") throw new HttpError(400, "lowerWins must be true or false");
  const retention = parseRetention(b.retentionDays);
  if (!retention) throw new HttpError(400, "Scoreboards can be kept for 30 or 90 days");

  const adminToken = newToken();
  const adminHash = await hashToken(adminToken);
  const id = uid();
  const created = now();
  const expires = new Date(expiryFor(Date.parse(created), retention)).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference("TL");
    try {
      await env.TALLY.batch([
        env.TALLY.prepare(
          "INSERT INTO boards (id, reference, name, lower_wins, admin_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).bind(id, reference, name, b.lowerWins ? 1 : 0, adminHash, created, expires),
        ...players.map((p, i) =>
          env.TALLY.prepare("INSERT INTO players (id, board_id, name, position) VALUES (?, ?, ?, ?)").bind(uid(), id, p, i),
        ),
      ]);
      return json({ reference, adminToken }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new HttpError(500, "Couldn't create a unique reference");
}

async function getBoard(env: TallyEnv, ref: string) {
  const b = live(await env.TALLY.prepare(`SELECT ${BOARD_COLS} FROM boards WHERE reference = ?`).bind(ref).first<BoardRow>());
  return view(env, b, false);
}

async function byAdmin(env: TallyEnv, token: string): Promise<BoardRow> {
  const b = await env.TALLY.prepare(`SELECT ${BOARD_COLS} FROM boards WHERE admin_hash = ?`)
    .bind(await hashToken(token))
    .first<BoardRow>();
  return live(b, "This scorekeeper link isn't valid");
}

async function getAdmin(env: TallyEnv, token: string) {
  return view(env, await byAdmin(env, token), true);
}

async function addScore(env: TallyEnv, token: string, req: Request) {
  const b = await byAdmin(env, token);
  const x = await body(req);
  if (typeof x.playerId !== "string") throw new HttpError(400, "Choose a player");
  if (typeof x.points !== "number" || !Number.isInteger(x.points) || x.points === 0 || Math.abs(x.points) > MAX_POINTS)
    throw new HttpError(400, `Points must be a whole number up to ${MAX_POINTS}`);
  const n = await env.TALLY.prepare("SELECT COUNT(*) AS n FROM scores WHERE board_id = ?").bind(b.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_SCORES) throw new HttpError(409, "This scoreboard is full. Start a new one.");
  const r = await env.TALLY.prepare(
    "INSERT INTO scores (id, board_id, player_id, points, created_at) SELECT ?, ?, id, ?, ? FROM players WHERE id = ? AND board_id = ?",
  )
    .bind(uid(), b.id, x.points, now(), x.playerId, b.id)
    .run();
  if (r.meta.changes !== 1) throw new HttpError(404, "That player isn't on this scoreboard");
  return view(env, b, true);
}

async function undoLast(env: TallyEnv, token: string) {
  const b = await byAdmin(env, token);
  await env.TALLY.prepare(
    "DELETE FROM scores WHERE rowid = (SELECT rowid FROM scores WHERE board_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1)",
  )
    .bind(b.id)
    .run();
  return view(env, b, true);
}

async function resetScores(env: TallyEnv, token: string) {
  const b = await byAdmin(env, token);
  await env.TALLY.prepare("DELETE FROM scores WHERE board_id = ?").bind(b.id).run();
  return view(env, b, true);
}

async function addPlayer(env: TallyEnv, token: string, req: Request) {
  const b = await byAdmin(env, token);
  const x = await body(req);
  const name = cleanText(x.name, "Name", 40);
  const c = await env.TALLY.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS pos FROM players WHERE board_id = ?")
    .bind(b.id)
    .first<{ n: number; pos: number }>();
  if ((c?.n ?? 0) >= MAX_PLAYERS) throw new HttpError(409, `A scoreboard holds up to ${MAX_PLAYERS} players`);
  try {
    await env.TALLY.prepare("INSERT INTO players (id, board_id, name, position) VALUES (?, ?, ?, ?)")
      .bind(uid(), b.id, name, (c?.pos ?? -1) + 1)
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Someone already has that name");
    throw e;
  }
  return view(env, b, true);
}

async function removePlayer(env: TallyEnv, token: string, id: string) {
  const b = await byAdmin(env, token);
  await env.TALLY.batch([
    env.TALLY.prepare("DELETE FROM scores WHERE player_id = ? AND board_id = ?").bind(id, b.id),
    env.TALLY.prepare("DELETE FROM players WHERE id = ? AND board_id = ?").bind(id, b.id),
  ]);
  return view(env, b, true);
}

async function extendBoard(env: TallyEnv, token: string) {
  const b = await byAdmin(env, token);
  const r = extend(Date.parse(b.created_at), Date.parse(b.expires_at), b.extended === 1);
  if (!r.ok) throw new HttpError(409, r.reason);
  const expiresAt = new Date(r.expiresMs).toISOString();
  await env.TALLY.prepare("UPDATE boards SET expires_at = ?, extended = 1 WHERE id = ?").bind(expiresAt, b.id).run();
  return json({ expiresAt });
}

/** path is everything after /api/tally */
export async function handleTally(req: Request, env: TallyEnv, path: string[]): Promise<Response> {
  const [kind, key, sub, id] = path;
  const m = req.method;
  if (kind === "boards" && !key) {
    if (m === "POST") return createBoard(env, req);
    throw new HttpError(405, "Method not allowed");
  }
  if (kind === "boards") {
    const ref = decodeURIComponent(key).toUpperCase();
    if (!REF_RE.test(ref)) throw new HttpError(404, "Scoreboard not found");
    if (!sub && m === "GET") return getBoard(env, ref);
  }
  if (kind === "admin") {
    const token = (key ?? "").toLowerCase();
    if (!TOKEN_RE.test(token)) throw new HttpError(404, "This link isn't valid");
    if (!sub && m === "GET") return getAdmin(env, token);
    if (sub === "scores" && !id && m === "POST") return addScore(env, token, req);
    if (sub === "scores" && id === "last" && m === "DELETE") return undoLast(env, token);
    if (sub === "scores" && !id && m === "DELETE") return resetScores(env, token);
    if (sub === "players" && !id && m === "POST") return addPlayer(env, token, req);
    if (sub === "players" && id && m === "DELETE") return removePlayer(env, token, id);
    if (sub === "extend" && m === "POST") return extendBoard(env, token);
  }
  throw new HttpError(404, "Not found");
}

export async function purgeTally(env: TallyEnv): Promise<number> {
  const t = now();
  const r = await env.TALLY.batch([
    env.TALLY.prepare("DELETE FROM scores WHERE board_id IN (SELECT id FROM boards WHERE expires_at < ?)").bind(t),
    env.TALLY.prepare("DELETE FROM players WHERE board_id IN (SELECT id FROM boards WHERE expires_at < ?)").bind(t),
    env.TALLY.prepare("DELETE FROM boards WHERE expires_at < ?").bind(t),
  ]);
  return r[2].meta.changes;
}
