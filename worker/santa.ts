// Tab & Tally Secret Santa API (/api/santa/...), on its own D1 database.
//
// Privacy model:
//  - The draw is made once, on the server, when the organiser creates it.
//  - The shared reference (SS-XXXX-XXXX) only lists names and whether each has been opened.
//  - Each person claims their name once and gets a private key; only that key reveals who they buy for.
//  - The organiser gets a separate key that can free a name tapped by mistake, but never shows the draw.
//  - Keys are stored as SHA-256 hashes.

import { drawWithExclusions } from "./draw";
import { HttpError, body, cleanText, hashToken, json, newReference, newToken, now, refPattern, uid } from "./http";
import { expiryFor, extend, isExpired, parseRetention } from "./retention";

export interface SantaEnv {
  SANTA: D1Database;
}

const REF_RE = refPattern("SS");
const TOKEN_RE = /^[0-9a-z]{32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PEOPLE = 50;
const MAX_BUDGET = 100_000; // £1,000
const MAX_WISHLIST = 1000;

type DrawRow = {
  id: string;
  reference: string;
  name: string;
  budget_pence: number | null;
  exchange_date: string | null;
  created_at: string;
  expires_at: string;
  extended: number;
  wishlists: number;
};
type PersonRow = { id: string; name: string; claimed: number };

const DRAW_COLS = "id, reference, name, budget_pence, exchange_date, created_at, expires_at, extended, wishlists";

function live(d: DrawRow | null, missing = "Draw not found"): DrawRow {
  if (!d) throw new HttpError(404, missing);
  if (isExpired(Date.parse(d.expires_at), Date.now())) throw new HttpError(410, "This draw has expired and been deleted");
  return d;
}

async function people(env: SantaEnv, drawId: string): Promise<PersonRow[]> {
  const r = await env.SANTA.prepare(
    "SELECT id, name, claim_hash IS NOT NULL AS claimed FROM participants WHERE draw_id = ? ORDER BY position",
  )
    .bind(drawId)
    .all<PersonRow>();
  return r.results;
}

const canExtend = (d: DrawRow) => extend(Date.parse(d.created_at), Date.parse(d.expires_at), d.extended === 1).ok;

async function publicView(env: SantaEnv, d: DrawRow) {
  return {
    reference: d.reference,
    name: d.name,
    budgetPence: d.budget_pence,
    exchangeDate: d.exchange_date,
    expiresAt: d.expires_at,
    wishlists: d.wishlists === 1,
    people: (await people(env, d.id)).map((p) => ({ id: p.id, name: p.name, claimed: p.claimed === 1 })),
  };
}

// ---------- organiser creates the draw ----------

async function createDraw(env: SantaEnv, req: Request) {
  const b = await body(req);
  const name = cleanText(b.name, "Name", 60);
  if (!Array.isArray(b.members)) throw new HttpError(400, "members must be a list");
  const members = b.members.map((m, i) => cleanText(m, `Person ${i + 1}`, 40));
  if (members.length < 3 || members.length > MAX_PEOPLE)
    throw new HttpError(400, `A Secret Santa needs between 3 and ${MAX_PEOPLE} people`);
  if (new Set(members.map((m) => m.toLowerCase())).size !== members.length)
    throw new HttpError(400, "Each person needs a different name");

  let budget: number | null = null;
  if (b.budgetPence !== undefined && b.budgetPence !== null) {
    if (typeof b.budgetPence !== "number" || !Number.isInteger(b.budgetPence) || b.budgetPence < 1 || b.budgetPence > MAX_BUDGET)
      throw new HttpError(400, "Budget must be between 1p and £1,000");
    budget = b.budgetPence;
  }
  let date: string | null = null;
  if (b.exchangeDate !== undefined && b.exchangeDate !== null && b.exchangeDate !== "") {
    if (typeof b.exchangeDate !== "string" || !DATE_RE.test(b.exchangeDate) || isNaN(Date.parse(b.exchangeDate)))
      throw new HttpError(400, "Exchange date must be a date");
    date = b.exchangeDate;
  }
  if (b.wishlists !== undefined && typeof b.wishlists !== "boolean") throw new HttpError(400, "wishlists must be true or false");
  const wishlists = b.wishlists === false ? 0 : 1;
  const retention = parseRetention(b.retentionDays);
  if (!retention) throw new HttpError(400, "Draws can be kept for 30 or 90 days");

  // Pairs who must not draw each other, as positions in the members list. Used for the draw only, never stored.
  const banned: [number, number][] = [];
  if (b.exclusions !== undefined && b.exclusions !== null) {
    if (!Array.isArray(b.exclusions) || b.exclusions.length > 100) throw new HttpError(400, "Too many pairs to keep apart");
    for (const x of b.exclusions) {
      const ok = Array.isArray(x) && x.length === 2 && x.every((v) => Number.isInteger(v) && v >= 0 && v < members.length) && x[0] !== x[1];
      if (!ok) throw new HttpError(400, "Each pair must be two different people in the list");
      banned.push([x[0], x[1]]);
    }
  }
  const ids = members.map(() => uid());
  const givesTo = drawWithExclusions(members.length, banned);
  if (!givesTo) throw new HttpError(400, "Those pairs leave no way to draw everyone. Remove one or two pairs and try again.");
  const adminToken = newToken();
  const adminHash = await hashToken(adminToken);
  const did = uid();
  const created = now();
  const expires = new Date(expiryFor(Date.parse(created), retention)).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference("SS");
    try {
      await env.SANTA.batch([
        env.SANTA.prepare(
          "INSERT INTO draws (id, reference, name, budget_pence, exchange_date, admin_hash, created_at, expires_at, wishlists) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(did, reference, name, budget, date, adminHash, created, expires, wishlists),
        ...members.map((m, i) =>
          env.SANTA.prepare(
            "INSERT INTO participants (id, draw_id, name, position, gives_to) VALUES (?, ?, ?, ?, ?)",
          ).bind(ids[i], did, m, i, ids[givesTo[i]]),
        ),
      ]);
      return json({ reference, adminToken }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new HttpError(500, "Couldn't create a unique reference");
}

// ---------- everyone: view names, claim yours ----------

async function getDraw(env: SantaEnv, ref: string) {
  const d = live(await env.SANTA.prepare(`SELECT ${DRAW_COLS} FROM draws WHERE reference = ?`).bind(ref).first<DrawRow>());
  return json(await publicView(env, d));
}

async function claim(env: SantaEnv, ref: string, req: Request) {
  const d = live(await env.SANTA.prepare(`SELECT ${DRAW_COLS} FROM draws WHERE reference = ?`).bind(ref).first<DrawRow>());
  const b = await body(req);
  if (typeof b.personId !== "string") throw new HttpError(400, "Choose your name");
  const token = newToken();
  const r = await env.SANTA.prepare(
    "UPDATE participants SET claim_hash = ?, claimed_at = ? WHERE id = ? AND draw_id = ? AND claim_hash IS NULL",
  )
    .bind(await hashToken(token), now(), b.personId, d.id)
    .run();
  if (r.meta.changes !== 1) {
    const exists = await env.SANTA.prepare("SELECT 1 FROM participants WHERE id = ? AND draw_id = ?").bind(b.personId, d.id).first();
    if (!exists) throw new HttpError(404, "That name isn't in this draw");
    throw new HttpError(409, "That name has already been opened on another phone. Ask the organiser to free it if this is you.");
  }
  return json({ token }, 201);
}

// ---------- a person's private page ----------

async function personByToken(env: SantaEnv, token: string) {
  const p = await env.SANTA.prepare(
    "SELECT id, draw_id, name, gives_to, wishlist FROM participants WHERE claim_hash = ?",
  )
    .bind(await hashToken(token))
    .first<{ id: string; draw_id: string; name: string; gives_to: string; wishlist: string }>();
  if (!p) throw new HttpError(404, "This private link isn't valid any more. Open the group link and choose your name again.");
  const d = live(await env.SANTA.prepare(`SELECT ${DRAW_COLS} FROM draws WHERE id = ?`).bind(p.draw_id).first<DrawRow>());
  return { p, d };
}

async function getMe(env: SantaEnv, token: string) {
  const { p, d } = await personByToken(env, token);
  const to = await env.SANTA.prepare("SELECT name, wishlist FROM participants WHERE id = ?")
    .bind(p.gives_to)
    .first<{ name: string; wishlist: string }>();
  return json({
    draw: await publicView(env, d),
    me: { id: p.id, name: p.name, wishlist: p.wishlist },
    recipient: { name: to?.name ?? "", wishlist: d.wishlists === 1 ? (to?.wishlist ?? "") : "" },
  });
}

async function setWishlist(env: SantaEnv, token: string, req: Request) {
  const { p, d } = await personByToken(env, token);
  if (d.wishlists !== 1) throw new HttpError(403, "Wishlists are switched off for this draw");
  const b = await body(req);
  if (typeof b.wishlist !== "string") throw new HttpError(400, "Wishlist must be text");
  const w = b.wishlist.replace(/\r\n/g, "\n").trim();
  if (w.length > MAX_WISHLIST) throw new HttpError(400, `Wishlist is too long (max ${MAX_WISHLIST} characters)`);
  await env.SANTA.prepare("UPDATE participants SET wishlist = ? WHERE id = ?").bind(w, p.id).run();
  return json({ wishlist: w });
}

// ---------- organiser page ----------

async function drawByAdmin(env: SantaEnv, token: string) {
  return live(
    await env.SANTA.prepare(`SELECT ${DRAW_COLS} FROM draws WHERE admin_hash = ?`).bind(await hashToken(token)).first<DrawRow>(),
    "This organiser link isn't valid",
  );
}

async function getAdmin(env: SantaEnv, token: string) {
  const d = await drawByAdmin(env, token);
  return json({ ...(await publicView(env, d)), canExtend: canExtend(d) });
}

async function release(env: SantaEnv, token: string, req: Request) {
  const d = await drawByAdmin(env, token);
  const b = await body(req);
  if (typeof b.personId !== "string") throw new HttpError(400, "Choose a name to free");
  const r = await env.SANTA.prepare(
    "UPDATE participants SET claim_hash = NULL, claimed_at = NULL WHERE id = ? AND draw_id = ?",
  )
    .bind(b.personId, d.id)
    .run();
  if (r.meta.changes !== 1) throw new HttpError(404, "That name isn't in this draw");
  return json({ ok: true });
}

async function extendDraw(env: SantaEnv, token: string) {
  const d = await drawByAdmin(env, token);
  const r = extend(Date.parse(d.created_at), Date.parse(d.expires_at), d.extended === 1);
  if (!r.ok) throw new HttpError(409, r.reason);
  const expiresAt = new Date(r.expiresMs).toISOString();
  await env.SANTA.prepare("UPDATE draws SET expires_at = ?, extended = 1 WHERE id = ?").bind(expiresAt, d.id).run();
  return json({ expiresAt });
}

// ---------- routing and clean-up ----------

/** path is everything after /api/santa */
export async function handleSanta(req: Request, env: SantaEnv, path: string[]): Promise<Response> {
  const [kind, key, sub] = path;
  const m = req.method;
  if (kind === "draws" && !key) {
    if (m === "POST") return createDraw(env, req);
    throw new HttpError(405, "Method not allowed");
  }
  if (kind === "draws") {
    const ref = decodeURIComponent(key).toUpperCase();
    if (!REF_RE.test(ref)) throw new HttpError(404, "Draw not found");
    if (!sub && m === "GET") return getDraw(env, ref);
    if (sub === "claim" && m === "POST") return claim(env, ref, req);
  }
  if (kind === "me" || kind === "admin") {
    const token = (key ?? "").toLowerCase();
    if (!TOKEN_RE.test(token)) throw new HttpError(404, "This link isn't valid");
    if (kind === "me" && !sub && m === "GET") return getMe(env, token);
    if (kind === "me" && sub === "wishlist" && m === "PUT") return setWishlist(env, token, req);
    if (kind === "admin" && !sub && m === "GET") return getAdmin(env, token);
    if (kind === "admin" && sub === "release" && m === "POST") return release(env, token, req);
    if (kind === "admin" && sub === "extend" && m === "POST") return extendDraw(env, token);
  }
  throw new HttpError(404, "Not found");
}

export async function purgeSanta(env: SantaEnv): Promise<number> {
  const t = now();
  const r = await env.SANTA.batch([
    env.SANTA.prepare("DELETE FROM participants WHERE draw_id IN (SELECT id FROM draws WHERE expires_at < ?)").bind(t),
    env.SANTA.prepare("DELETE FROM draws WHERE expires_at < ?").bind(t),
  ]);
  return r[1].meta.changes;
}
