// Tab & Tally Whip-round API (/api/whip/...), on its own D1 database.
// People add what they've chipped in; the organiser ticks off what they've received.
// The service never holds money and refuses notes that look like bank details.

import { looksLikeAccountDetails } from "./guard";
import { HttpError, body, cleanText, hashToken, json, newReference, newToken, now, refPattern, uid } from "./http";
import { expiryFor, extend, isExpired, parseRetention } from "./retention";

export interface WhipEnv {
  WHIP: D1Database;
}

const REF_RE = refPattern("WR");
const TOKEN_RE = /^[0-9a-z]{32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PENCE = 10_000_000; // £100,000
const MAX_ENTRIES = 200;

type PotRow = {
  id: string;
  reference: string;
  name: string;
  about: string;
  suggested_pence: number | null;
  target_pence: number | null;
  closes_on: string | null;
  how_to_pay: string;
  show_amounts: number;
  closed: number;
  created_at: string;
  expires_at: string;
  extended: number;
};
type EntryRow = { id: string; name: string; amount_pence: number; confirmed: number; created_at: string };

const POT_COLS =
  "id, reference, name, about, suggested_pence, target_pence, closes_on, how_to_pay, show_amounts, closed, created_at, expires_at, extended";

function live(p: PotRow | null, missing = "Whip-round not found"): PotRow {
  if (!p) throw new HttpError(404, missing);
  if (isExpired(Date.parse(p.expires_at), Date.now())) throw new HttpError(410, "This whip-round has expired and been deleted");
  return p;
}

function optionalPence(v: unknown, field: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > MAX_PENCE)
    throw new HttpError(400, `${field} must be a whole number of pence`);
  return v;
}

function optionalText(v: unknown, field: string, max: number): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new HttpError(400, `${field} must be text`);
  const s = v.replace(/\r\n/g, "\n").trim();
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters)`);
  return s;
}

/** The public page. Amounts are hidden from contributors unless the organiser chose to show them. */
async function view(env: WhipEnv, p: PotRow, asOrganiser: boolean) {
  const rows = (
    await env.WHIP.prepare(
      "SELECT id, name, amount_pence, confirmed, created_at FROM entries WHERE pot_id = ? ORDER BY created_at",
    )
      .bind(p.id)
      .all<EntryRow>()
  ).results;
  const showAmounts = asOrganiser || p.show_amounts === 1;
  const total = rows.reduce((t, e) => t + e.amount_pence, 0);
  const received = rows.filter((e) => e.confirmed === 1).reduce((t, e) => t + e.amount_pence, 0);
  return {
    reference: p.reference,
    name: p.name,
    about: p.about,
    suggestedPence: p.suggested_pence,
    targetPence: p.target_pence,
    closesOn: p.closes_on,
    howToPay: p.how_to_pay,
    showAmounts: p.show_amounts === 1,
    closed: p.closed === 1,
    expiresAt: p.expires_at,
    totalPence: total,
    receivedPence: received,
    entries: rows.map((e) => ({
      id: e.id,
      name: e.name,
      confirmed: e.confirmed === 1,
      ...(showAmounts ? { amountPence: e.amount_pence } : {}),
    })),
  };
}

// ---------- create ----------

async function createPot(env: WhipEnv, req: Request) {
  const b = await body(req);
  const name = cleanText(b.name, "Name", 80);
  const about = optionalText(b.about, "Details", 500);
  const howToPay = optionalText(b.howToPay, "How to pay", 300);
  if (looksLikeAccountDetails(howToPay))
    throw new HttpError(400, "Please don't put account or card numbers here. Share those privately, for example in the group chat.");
  const suggested = optionalPence(b.suggestedPence, "Suggested amount");
  const target = optionalPence(b.targetPence, "Target");
  let closesOn: string | null = null;
  if (b.closesOn !== undefined && b.closesOn !== null && b.closesOn !== "") {
    if (typeof b.closesOn !== "string" || !DATE_RE.test(b.closesOn) || isNaN(Date.parse(b.closesOn)))
      throw new HttpError(400, "Closing date must be a date");
    closesOn = b.closesOn;
  }
  const retention = parseRetention(b.retentionDays);
  if (!retention) throw new HttpError(400, "Whip-rounds can be kept for 30 or 90 days");

  const adminToken = newToken();
  const adminHash = await hashToken(adminToken);
  const id = uid();
  const created = now();
  const expires = new Date(expiryFor(Date.parse(created), retention)).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference("WR");
    try {
      await env.WHIP.prepare(
        `INSERT INTO pots (id, reference, name, about, suggested_pence, target_pence, closes_on, how_to_pay, show_amounts, admin_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, reference, name, about, suggested, target, closesOn, howToPay, b.showAmounts === true ? 1 : 0, adminHash, created, expires)
        .run();
      return json({ reference, adminToken }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new HttpError(500, "Couldn't create a unique reference");
}

// ---------- everyone ----------

async function potByRef(env: WhipEnv, ref: string) {
  return live(await env.WHIP.prepare(`SELECT ${POT_COLS} FROM pots WHERE reference = ?`).bind(ref).first<PotRow>());
}

async function getPot(env: WhipEnv, ref: string) {
  return json(await view(env, await potByRef(env, ref), false));
}

async function addEntry(env: WhipEnv, ref: string, req: Request) {
  const p = await potByRef(env, ref);
  if (p.closed === 1) throw new HttpError(409, "This whip-round is closed");
  const b = await body(req);
  const name = cleanText(b.name, "Your name", 40);
  const amount = optionalPence(b.amountPence, "Amount");
  if (!amount) throw new HttpError(400, "Enter how much you chipped in");
  const n = await env.WHIP.prepare("SELECT COUNT(*) AS n FROM entries WHERE pot_id = ?").bind(p.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_ENTRIES) throw new HttpError(409, "This whip-round has reached its limit of 200 contributions");
  const id = uid();
  await env.WHIP.prepare("INSERT INTO entries (id, pot_id, name, amount_pence, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, p.id, name, amount, now())
    .run();
  return json({ id }, 201);
}

// ---------- organiser ----------

async function potByAdmin(env: WhipEnv, token: string) {
  return live(
    await env.WHIP.prepare(`SELECT ${POT_COLS} FROM pots WHERE admin_hash = ?`).bind(await hashToken(token)).first<PotRow>(),
    "This organiser link isn't valid",
  );
}

async function getAdmin(env: WhipEnv, token: string) {
  const p = await potByAdmin(env, token);
  return json({
    ...(await view(env, p, true)),
    canExtend: extend(Date.parse(p.created_at), Date.parse(p.expires_at), p.extended === 1).ok,
  });
}

async function setConfirmed(env: WhipEnv, token: string, entryId: string, req: Request) {
  const p = await potByAdmin(env, token);
  const b = await body(req);
  if (typeof b.confirmed !== "boolean") throw new HttpError(400, "confirmed must be true or false");
  const r = await env.WHIP.prepare("UPDATE entries SET confirmed = ? WHERE id = ? AND pot_id = ?")
    .bind(b.confirmed ? 1 : 0, entryId, p.id)
    .run();
  if (r.meta.changes !== 1) throw new HttpError(404, "Contribution not found");
  return json({ ok: true });
}

async function deleteEntry(env: WhipEnv, token: string, entryId: string) {
  const p = await potByAdmin(env, token);
  const r = await env.WHIP.prepare("DELETE FROM entries WHERE id = ? AND pot_id = ?").bind(entryId, p.id).run();
  if (r.meta.changes !== 1) throw new HttpError(404, "Contribution not found");
  return json({ ok: true });
}

async function setClosed(env: WhipEnv, token: string, req: Request) {
  const p = await potByAdmin(env, token);
  const b = await body(req);
  if (typeof b.closed !== "boolean") throw new HttpError(400, "closed must be true or false");
  await env.WHIP.prepare("UPDATE pots SET closed = ? WHERE id = ?").bind(b.closed ? 1 : 0, p.id).run();
  return json({ closed: b.closed });
}

async function extendPot(env: WhipEnv, token: string) {
  const p = await potByAdmin(env, token);
  const r = extend(Date.parse(p.created_at), Date.parse(p.expires_at), p.extended === 1);
  if (!r.ok) throw new HttpError(409, r.reason);
  const expiresAt = new Date(r.expiresMs).toISOString();
  await env.WHIP.prepare("UPDATE pots SET expires_at = ?, extended = 1 WHERE id = ?").bind(expiresAt, p.id).run();
  return json({ expiresAt });
}

// ---------- routing and clean-up ----------

/** path is everything after /api/whip */
export async function handleWhip(req: Request, env: WhipEnv, path: string[]): Promise<Response> {
  const [kind, key, sub, id] = path;
  const m = req.method;
  if (kind === "pots" && !key) {
    if (m === "POST") return createPot(env, req);
    throw new HttpError(405, "Method not allowed");
  }
  if (kind === "pots") {
    const ref = decodeURIComponent(key).toUpperCase();
    if (!REF_RE.test(ref)) throw new HttpError(404, "Whip-round not found");
    if (!sub && m === "GET") return getPot(env, ref);
    if (sub === "entries" && m === "POST") return addEntry(env, ref, req);
  }
  if (kind === "admin") {
    const token = (key ?? "").toLowerCase();
    if (!TOKEN_RE.test(token)) throw new HttpError(404, "This link isn't valid");
    if (!sub && m === "GET") return getAdmin(env, token);
    if (sub === "entries" && id && m === "POST") return setConfirmed(env, token, id, req);
    if (sub === "entries" && id && m === "DELETE") return deleteEntry(env, token, id);
    if (sub === "closed" && m === "POST") return setClosed(env, token, req);
    if (sub === "extend" && m === "POST") return extendPot(env, token);
  }
  throw new HttpError(404, "Not found");
}

export async function purgeWhip(env: WhipEnv): Promise<number> {
  const t = now();
  const r = await env.WHIP.batch([
    env.WHIP.prepare("DELETE FROM entries WHERE pot_id IN (SELECT id FROM pots WHERE expires_at < ?)").bind(t),
    env.WHIP.prepare("DELETE FROM pots WHERE expires_at < ?").bind(t),
  ]);
  return r[1].meta.changes;
}
