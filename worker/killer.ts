// Tab & Tally Killer Pool API (/api/killer/...), on its own D1 database.
// A referee records pots. Watchers follow lives live with the shared KP- code.

import { HttpError, body, cleanText, hashToken, json, newReference, newToken, now, randomInt, refPattern, uid } from "./http";
import { assignBalls, decide, winner, type Action, type P } from "./killerrules";
import { expiryFor, extend, isExpired, parseRetention } from "./retention";

export interface KillerEnv {
  KILLER: D1Database;
}

const REF_RE = refPattern("KP");
const TOKEN_RE = /^[0-9a-z]{32}$/;
const MAX_PLAYERS = 15;
const MAX_EVENTS = 1000;
const RECENT = 30;

type GameRow = {
  id: string;
  reference: string;
  name: string;
  start_lives: number;
  killer_required: number;
  own_loses: number;
  scratch_loses: number;
  secret_balls: number;
  created_at: string;
  expires_at: string;
  extended: number;
};
type PlayerRow = { id: string; name: string; ball: number; lives: number; killer: number };
const GAME_COLS =
  "id, reference, name, start_lives, killer_required, own_loses, scratch_loses, secret_balls, created_at, expires_at, extended";

function live(g: GameRow | null, missing = "Game not found"): GameRow {
  if (!g) throw new HttpError(404, missing);
  if (isExpired(Date.parse(g.expires_at), Date.now())) throw new HttpError(410, "This game has expired and been deleted");
  return g;
}

const rulesOf = (g: GameRow) => ({
  killerRequired: g.killer_required === 1,
  ownLoses: g.own_loses === 1,
  scratchLoses: g.scratch_loses === 1,
});

async function playersOf(env: KillerEnv, gameId: string): Promise<PlayerRow[]> {
  const r = await env.KILLER.prepare("SELECT id, name, ball, lives, killer FROM players WHERE game_id = ? ORDER BY position")
    .bind(gameId)
    .all<PlayerRow>();
  return r.results;
}
const asP = (rows: PlayerRow[]): P[] => rows.map((p) => ({ id: p.id, name: p.name, lives: p.lives, killer: p.killer === 1 }));

async function view(env: KillerEnv, g: GameRow, admin: boolean) {
  const rows = await playersOf(env, g.id);
  const win = winner(asP(rows));
  const showAll = admin || g.secret_balls !== 1 || !!win;
  const events = await env.KILLER.prepare(
    "SELECT id, kind, shooter_id AS shooterId, victim_id AS victimId, lives_player_id AS livesPlayerId, lives_delta AS livesDelta, killer_player_id AS killerPlayerId FROM events WHERE game_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
  )
    .bind(g.id, RECENT)
    .all();
  const out: Record<string, unknown> = {
    reference: g.reference,
    name: g.name,
    startLives: g.start_lives,
    rules: { ...rulesOf(g), secretBalls: g.secret_balls === 1 },
    expiresAt: g.expires_at,
    winnerId: win?.id ?? null,
    players: rows.map((p) => ({
      id: p.id,
      name: p.name,
      lives: p.lives,
      killer: p.killer === 1,
      ball: showAll || p.lives <= 0 ? p.ball : null,
    })),
    recent: events.results,
  };
  if (admin) out.canExtend = extend(Date.parse(g.created_at), Date.parse(g.expires_at), g.extended === 1).ok;
  return json(out);
}

// ---------- create ----------

async function createGame(env: KillerEnv, req: Request) {
  const b = await body(req);
  const name = cleanText(b.name, "Name", 60);
  if (!Array.isArray(b.players)) throw new HttpError(400, "players must be a list");
  if (b.players.length < 2 || b.players.length > MAX_PLAYERS) throw new HttpError(400, `Killer needs between 2 and ${MAX_PLAYERS} players`);
  const names: string[] = [];
  const chosen: (number | null)[] = [];
  b.players.forEach((raw: unknown, i: number) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    names.push(cleanText(o.name, `Player ${i + 1}`, 40));
    const ball = o.ball;
    if (ball === undefined || ball === null) chosen.push(null);
    else if (typeof ball === "number" && Number.isInteger(ball) && ball >= 1 && ball <= 15) chosen.push(ball);
    else throw new HttpError(400, "Ball numbers go from 1 to 15");
  });
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new HttpError(400, "Each player needs a different name");
  const balls = assignBalls(names.length, chosen, randomInt);
  if (!balls) throw new HttpError(400, "Two players can't have the same ball");

  const lives = b.lives === undefined ? 3 : b.lives;
  if (typeof lives !== "number" || !Number.isInteger(lives) || lives < 1 || lives > 9) throw new HttpError(400, "Lives must be between 1 and 9");
  const flag = (k: string, d: boolean) => {
    const v = b[k];
    if (v === undefined) return d ? 1 : 0;
    if (typeof v !== "boolean") throw new HttpError(400, `${k} must be true or false`);
    return v ? 1 : 0;
  };
  const killerRequired = flag("killerRequired", true);
  const ownLoses = flag("ownLoses", true);
  const scratchLoses = flag("scratchLoses", true);
  const secretBalls = flag("secretBalls", false);
  const retention = parseRetention(b.retentionDays);
  if (!retention) throw new HttpError(400, "Games can be kept for 30 or 90 days");

  const adminToken = newToken();
  const adminHash = await hashToken(adminToken);
  const id = uid();
  const created = now();
  const expires = new Date(expiryFor(Date.parse(created), retention)).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference("KP");
    try {
      await env.KILLER.batch([
        env.KILLER.prepare(
          "INSERT INTO games (id, reference, name, start_lives, killer_required, own_loses, scratch_loses, secret_balls, admin_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(id, reference, name, lives, killerRequired, ownLoses, scratchLoses, secretBalls, adminHash, created, expires),
        ...names.map((n, i) =>
          env.KILLER.prepare("INSERT INTO players (id, game_id, name, position, ball, lives) VALUES (?, ?, ?, ?, ?, ?)").bind(
            uid(), id, n, i, balls[i], lives,
          ),
        ),
      ]);
      return json({ reference, adminToken }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new HttpError(500, "Couldn't create a unique reference");
}

// ---------- view ----------

async function getGame(env: KillerEnv, ref: string) {
  const g = live(await env.KILLER.prepare(`SELECT ${GAME_COLS} FROM games WHERE reference = ?`).bind(ref).first<GameRow>());
  return view(env, g, false);
}

async function byAdmin(env: KillerEnv, token: string): Promise<GameRow> {
  const g = await env.KILLER.prepare(`SELECT ${GAME_COLS} FROM games WHERE admin_hash = ?`).bind(await hashToken(token)).first<GameRow>();
  return live(g, "This referee link isn't valid");
}

// ---------- referee ----------

async function act(env: KillerEnv, token: string, req: Request) {
  const g = await byAdmin(env, token);
  const x = await body(req);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  let a: Action;
  switch (x.type) {
    case "own":
    case "scratch":
      a = { type: x.type, shooterId: str(x.shooterId) };
      break;
    case "pot":
      a = { type: "pot", shooterId: str(x.shooterId), victimId: str(x.victimId) };
      break;
    case "adjust":
      if (x.delta !== 1 && x.delta !== -1) throw new HttpError(400, "delta must be 1 or -1");
      a = { type: "adjust", playerId: str(x.playerId), delta: x.delta };
      break;
    default:
      throw new HttpError(400, "Unknown action");
  }
  const n = await env.KILLER.prepare("SELECT COUNT(*) AS n FROM events WHERE game_id = ?").bind(g.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_EVENTS) throw new HttpError(409, "This game is full. Start a new one.");
  const o = decide(rulesOf(g), asP(await playersOf(env, g.id)), a);
  if ("error" in o) throw new HttpError(409, o.error);
  const stmts = [
    env.KILLER.prepare(
      "INSERT INTO events (id, game_id, kind, shooter_id, victim_id, lives_player_id, lives_delta, killer_player_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(uid(), g.id, o.kind, o.shooterId ?? null, o.victimId ?? null, o.livesPlayerId ?? null, o.livesDelta ?? null, o.killerPlayerId ?? null, now()),
  ];
  if (o.livesPlayerId)
    stmts.push(env.KILLER.prepare("UPDATE players SET lives = lives + ? WHERE id = ? AND game_id = ?").bind(o.livesDelta, o.livesPlayerId, g.id));
  if (o.killerPlayerId) stmts.push(env.KILLER.prepare("UPDATE players SET killer = 1 WHERE id = ? AND game_id = ?").bind(o.killerPlayerId, g.id));
  await env.KILLER.batch(stmts);
  return view(env, g, true);
}

async function undo(env: KillerEnv, token: string) {
  const g = await byAdmin(env, token);
  const e = await env.KILLER.prepare(
    "SELECT rowid AS rid, lives_player_id AS lp, lives_delta AS ld, killer_player_id AS kp FROM events WHERE game_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
  )
    .bind(g.id)
    .first<{ rid: number; lp: string | null; ld: number | null; kp: string | null }>();
  if (e) {
    const stmts = [env.KILLER.prepare("DELETE FROM events WHERE rowid = ?").bind(e.rid)];
    if (e.lp && e.ld) stmts.push(env.KILLER.prepare("UPDATE players SET lives = lives - ? WHERE id = ? AND game_id = ?").bind(e.ld, e.lp, g.id));
    if (e.kp) stmts.push(env.KILLER.prepare("UPDATE players SET killer = 0 WHERE id = ? AND game_id = ?").bind(e.kp, g.id));
    await env.KILLER.batch(stmts);
  }
  return view(env, g, true);
}

async function restart(env: KillerEnv, token: string, req: Request) {
  const g = await byAdmin(env, token);
  const x = await body(req);
  const rows = await playersOf(env, g.id);
  const stmts = [
    env.KILLER.prepare("DELETE FROM events WHERE game_id = ?").bind(g.id),
    env.KILLER.prepare("UPDATE players SET lives = ?, killer = 0 WHERE game_id = ?").bind(g.start_lives, g.id),
  ];
  if (x.reshuffle === true) {
    const balls = assignBalls(rows.length, rows.map(() => null), randomInt)!;
    // Move through 100+ first so the unique (game, ball) pairs never clash mid-update.
    stmts.push(env.KILLER.prepare("UPDATE players SET ball = ball + 100 WHERE game_id = ?").bind(g.id));
    rows.forEach((p, i) => stmts.push(env.KILLER.prepare("UPDATE players SET ball = ? WHERE id = ?").bind(balls[i], p.id)));
  }
  await env.KILLER.batch(stmts);
  return view(env, g, true);
}

async function extendGame(env: KillerEnv, token: string) {
  const g = await byAdmin(env, token);
  const r = extend(Date.parse(g.created_at), Date.parse(g.expires_at), g.extended === 1);
  if (!r.ok) throw new HttpError(409, r.reason);
  const expiresAt = new Date(r.expiresMs).toISOString();
  await env.KILLER.prepare("UPDATE games SET expires_at = ?, extended = 1 WHERE id = ?").bind(expiresAt, g.id).run();
  return json({ expiresAt });
}

// ---------- routing and clean-up ----------

/** path is everything after /api/killer */
export async function handleKiller(req: Request, env: KillerEnv, path: string[]): Promise<Response> {
  const [kind, key, sub, id] = path;
  const m = req.method;
  if (kind === "games" && !key) {
    if (m === "POST") return createGame(env, req);
    throw new HttpError(405, "Method not allowed");
  }
  if (kind === "games") {
    const ref = decodeURIComponent(key).toUpperCase();
    if (!REF_RE.test(ref)) throw new HttpError(404, "Game not found");
    if (!sub && m === "GET") return getGame(env, ref);
  }
  if (kind === "admin") {
    const token = (key ?? "").toLowerCase();
    if (!TOKEN_RE.test(token)) throw new HttpError(404, "This link isn't valid");
    if (!sub && m === "GET") return view(env, await byAdmin(env, token), true);
    if (sub === "actions" && m === "POST") return act(env, token, req);
    if (sub === "events" && id === "last" && m === "DELETE") return undo(env, token);
    if (sub === "restart" && m === "POST") return restart(env, token, req);
    if (sub === "extend" && m === "POST") return extendGame(env, token);
  }
  throw new HttpError(404, "Not found");
}

export async function purgeKiller(env: KillerEnv): Promise<number> {
  const t = now();
  const r = await env.KILLER.batch([
    env.KILLER.prepare("DELETE FROM events WHERE game_id IN (SELECT id FROM games WHERE expires_at < ?)").bind(t),
    env.KILLER.prepare("DELETE FROM players WHERE game_id IN (SELECT id FROM games WHERE expires_at < ?)").bind(t),
    env.KILLER.prepare("DELETE FROM games WHERE expires_at < ?").bind(t),
  ]);
  return r[2].meta.changes;
}
