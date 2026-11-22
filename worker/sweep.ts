// Tab & Tally Sweepstake API (/api/sweep/...), on its own D1 database.
// Items (teams, horses, numbers) are dealt to people at random once, at creation. Everyone can see the result.

import { dealItems as deal } from "./deal";
import { HttpError, body, cleanText, hashToken, json, newReference, newToken, now, refPattern, uid } from "./http";
import { expiryFor, extend, isExpired, parseRetention } from "./retention";

export interface SweepEnv {
  SWEEP: D1Database;
}

const REF_RE = refPattern("SW");
const TOKEN_RE = /^[0-9a-z]{32}$/;
const MAX = 64;
const STATUSES = ["in", "out", "won"];

type SweepRow = { id: string; reference: string; name: string; about: string; created_at: string; expires_at: string; extended: number };
const COLS = "id, reference, name, about, created_at, expires_at, extended";

function live(s: SweepRow | null, missing = "Sweepstake not found"): SweepRow {
  if (!s) throw new HttpError(404, missing);
  if (isExpired(Date.parse(s.expires_at), Date.now())) throw new HttpError(410, "This sweepstake has expired and been deleted");
  return s;
}

async function view(env: SweepEnv, s: SweepRow, admin: boolean) {
  const entrants = await env.SWEEP.prepare("SELECT id, name FROM entrants WHERE sweep_id = ? ORDER BY position").bind(s.id).all<{ id: string; name: string }>();
  const items = await env.SWEEP.prepare("SELECT id, label, status, entrant_id AS entrantId FROM items WHERE sweep_id = ? ORDER BY position")
    .bind(s.id)
    .all<{ id: string; label: string; status: string; entrantId: string | null }>();
  const out: Record<string, unknown> = {
    reference: s.reference,
    name: s.name,
    about: s.about,
    expiresAt: s.expires_at,
    entrants: entrants.results,
    items: items.results,
  };
  if (admin) out.canExtend = extend(Date.parse(s.created_at), Date.parse(s.expires_at), s.extended === 1).ok;
  return json(out);
}

function list(v: unknown, what: string, min: number): string[] {
  if (!Array.isArray(v)) throw new HttpError(400, `${what} must be a list`);
  if (v.length < min || v.length > MAX) throw new HttpError(400, `Add between ${min} and ${MAX} ${what}`);
  const out = v.map((x, i) => cleanText(x, `${what} ${i + 1}`, 40));
  if (new Set(out.map((x) => x.toLowerCase())).size !== out.length) throw new HttpError(400, `Each of the ${what} needs a different name`);
  return out;
}

async function create(env: SweepEnv, req: Request) {
  const b = await body(req);
  const name = cleanText(b.name, "Name", 60);
  const about = typeof b.about === "string" ? b.about.trim().slice(0, 300) : "";
  const entrants = list(b.entrants, "people", 2);
  const items = list(b.items, "items", 2);
  const retention = parseRetention(b.retentionDays);
  if (!retention) throw new HttpError(400, "Sweepstakes can be kept for 30 or 90 days");
  const owner = deal(items.length, entrants.length);

  const eIds = entrants.map(() => uid());
  const id = uid();
  const created = now();
  const adminToken = newToken();
  const adminHash = await hashToken(adminToken);
  const expires = new Date(expiryFor(Date.parse(created), retention)).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference("SW");
    try {
      await env.SWEEP.batch([
        env.SWEEP.prepare("INSERT INTO sweeps (id, reference, name, about, admin_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, reference, name, about, adminHash, created, expires),
        ...entrants.map((n, i) => env.SWEEP.prepare("INSERT INTO entrants (id, sweep_id, name, position) VALUES (?, ?, ?, ?)").bind(eIds[i], id, n, i)),
        ...items.map((label, i) => env.SWEEP.prepare("INSERT INTO items (id, sweep_id, label, position, entrant_id) VALUES (?, ?, ?, ?, ?)").bind(uid(), id, label, i, eIds[owner[i]])),
      ]);
      return json({ reference, adminToken }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new HttpError(500, "Couldn't create a unique reference");
}

async function byAdmin(env: SweepEnv, token: string) {
  return live(await env.SWEEP.prepare(`SELECT ${COLS} FROM sweeps WHERE admin_hash = ?`).bind(await hashToken(token)).first<SweepRow>(), "This organiser link isn't valid");
}

async function setStatus(env: SweepEnv, token: string, itemId: string, req: Request) {
  const s = await byAdmin(env, token);
  const x = await body(req);
  if (typeof x.status !== "string" || !STATUSES.includes(x.status)) throw new HttpError(400, "Status must be in, out or won");
  const r = await env.SWEEP.prepare("UPDATE items SET status = ? WHERE id = ? AND sweep_id = ?").bind(x.status, itemId, s.id).run();
  if (r.meta.changes !== 1) throw new HttpError(404, "That item isn't in this sweepstake");
  return view(env, s, true);
}

async function extendIt(env: SweepEnv, token: string) {
  const s = await byAdmin(env, token);
  const r = extend(Date.parse(s.created_at), Date.parse(s.expires_at), s.extended === 1);
  if (!r.ok) throw new HttpError(409, r.reason);
  const expiresAt = new Date(r.expiresMs).toISOString();
  await env.SWEEP.prepare("UPDATE sweeps SET expires_at = ?, extended = 1 WHERE id = ?").bind(expiresAt, s.id).run();
  return json({ expiresAt });
}

/** path is everything after /api/sweep */
export async function handleSweep(req: Request, env: SweepEnv, path: string[]): Promise<Response> {
  const [kind, key, sub, id] = path;
  const m = req.method;
  if (kind === "sweeps" && !key) {
    if (m === "POST") return create(env, req);
    throw new HttpError(405, "Method not allowed");
  }
  if (kind === "sweeps") {
    const ref = decodeURIComponent(key).toUpperCase();
    if (!REF_RE.test(ref)) throw new HttpError(404, "Sweepstake not found");
    if (!sub && m === "GET") return view(env, live(await env.SWEEP.prepare(`SELECT ${COLS} FROM sweeps WHERE reference = ?`).bind(ref).first<SweepRow>()), false);
  }
  if (kind === "admin") {
    const token = (key ?? "").toLowerCase();
    if (!TOKEN_RE.test(token)) throw new HttpError(404, "This link isn't valid");
    if (!sub && m === "GET") return view(env, await byAdmin(env, token), true);
    if (sub === "items" && id && m === "POST") return setStatus(env, token, id, req);
    if (sub === "extend" && m === "POST") return extendIt(env, token);
  }
  throw new HttpError(404, "Not found");
}

export async function purgeSweep(env: SweepEnv): Promise<number> {
  const t = now();
  const r = await env.SWEEP.batch([
    env.SWEEP.prepare("DELETE FROM items WHERE sweep_id IN (SELECT id FROM sweeps WHERE expires_at < ?)").bind(t),
    env.SWEEP.prepare("DELETE FROM entrants WHERE sweep_id IN (SELECT id FROM sweeps WHERE expires_at < ?)").bind(t),
    env.SWEEP.prepare("DELETE FROM sweeps WHERE expires_at < ?").bind(t),
  ]);
  return r[2].meta.changes;
}
