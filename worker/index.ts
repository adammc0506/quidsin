// QuidsIn API on Cloudflare Workers + D1.
// The Worker also serves the web app from ./dist (static assets, free).
// Every group endpoint needs the group's reference, which acts as its key.

import { HttpError, body, cleanText, cors, json, newReference, now, refPattern, uid } from "./http";
import { expiryFor, extend, isExpired, parseRetention } from "./retention";
import { handleSanta, purgeSanta, type SantaEnv } from "./santa";
import { handleTally, purgeTally, type TallyEnv } from "./tally";
import { handleWhip, purgeWhip, type WhipEnv } from "./whip";

interface Env extends SantaEnv, WhipEnv, TallyEnv {
  DB: D1Database;
}

const REF_RE = refPattern("QI");
const newGroupRef = () => newReference("QI");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PENCE = 100_000_000; // £1m per expense







function pence(v: unknown, field: string, allowZero = false): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < (allowZero ? 0 : 1) || v > MAX_PENCE)
    throw new HttpError(400, `${field} must be a whole number of pence`);
  return v;
}


function assertLive(expiresAt: string | null) {
  if (isExpired(expiresAt ? Date.parse(expiresAt) : null, Date.now()))
    throw new HttpError(410, "This group has expired and been deleted");
}

async function groupId(env: Env, ref: string): Promise<string> {
  const row = await env.DB.prepare("SELECT id, expires_at FROM groups WHERE reference = ?")
    .bind(ref)
    .first<{ id: string; expires_at: string | null }>();
  if (!row) throw new HttpError(404, "Group not found");
  assertLive(row.expires_at);
  return row.id;
}

async function memberIds(env: Env, gid: string): Promise<Set<string>> {
  const { results } = await env.DB.prepare("SELECT id FROM members WHERE group_id = ?").bind(gid).all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

// ---------- handlers ----------

async function createGroup(env: Env, req: Request) {
  const b = await body(req);
  const name = cleanText(b.name, "Group name", 80);
  if (!Array.isArray(b.members)) throw new HttpError(400, "members must be a list");
  const members = b.members.map((m, i) => cleanText(m, `Person ${i + 1}`, 40));
  if (members.length < 2 || members.length > 50) throw new HttpError(400, "A group needs between 2 and 50 people");
  if (new Set(members.map((m) => m.toLowerCase())).size !== members.length)
    throw new HttpError(400, "Each person needs a different name");

  const retention = parseRetention(b.retentionDays);
  if (!retention) throw new HttpError(400, "Groups can be kept for 30 or 90 days");

  const gid = uid();
  const created = now();
  const expires = new Date(expiryFor(Date.parse(created), retention)).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newGroupRef();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO groups (id, reference, name, currency, created_at, expires_at) VALUES (?, ?, ?, 'GBP', ?, ?)",
        ).bind(gid, reference, name, created, expires),
        ...members.map((m, i) =>
          env.DB.prepare("INSERT INTO members (id, group_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)").bind(
            uid(),
            gid,
            m,
            i,
            created,
          ),
        ),
      ]);
      return json({ reference }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e; // retry only on a reference clash
    }
  }
  throw new HttpError(500, "Couldn't create a unique reference");
}

async function getGroup(env: Env, ref: string) {
  const g = await env.DB.prepare(
    "SELECT id, reference, name, currency, created_at, expires_at, extended FROM groups WHERE reference = ?",
  )
    .bind(ref)
    .first<{
      id: string;
      reference: string;
      name: string;
      currency: string;
      created_at: string;
      expires_at: string | null;
      extended: number;
    }>();
  if (!g) throw new HttpError(404, "Group not found");
  assertLive(g.expires_at);

  const [members, expenses, shares, settlements] = await env.DB.batch([
    env.DB.prepare("SELECT id, name FROM members WHERE group_id = ? ORDER BY position, created_at").bind(g.id),
    env.DB.prepare(
      "SELECT id, description, amount_pence, paid_by, spent_on, created_at FROM expenses WHERE group_id = ? ORDER BY spent_on DESC, created_at DESC",
    ).bind(g.id),
    env.DB.prepare("SELECT expense_id, member_id, share_pence FROM expense_shares WHERE group_id = ?").bind(g.id),
    env.DB.prepare(
      "SELECT id, from_member, to_member, amount_pence, created_at FROM settlements WHERE group_id = ? ORDER BY created_at DESC",
    ).bind(g.id),
  ]);

  const byExpense = new Map<string, { memberId: string; pence: number }[]>();
  for (const s of shares.results as { expense_id: string; member_id: string; share_pence: number }[]) {
    const list = byExpense.get(s.expense_id) ?? [];
    list.push({ memberId: s.member_id, pence: s.share_pence });
    byExpense.set(s.expense_id, list);
  }

  return json({
    reference: g.reference,
    name: g.name,
    currency: g.currency,
    createdAt: g.created_at,
    expiresAt: g.expires_at,
    canExtend: g.expires_at ? extend(Date.parse(g.created_at), Date.parse(g.expires_at), g.extended === 1).ok : false,
    members: members.results,
    expenses: (expenses.results as Record<string, string | number>[]).map((e) => ({
      id: e.id,
      description: e.description,
      amountPence: e.amount_pence,
      paidBy: e.paid_by,
      spentOn: e.spent_on,
      createdAt: e.created_at,
      shares: byExpense.get(e.id as string) ?? [],
    })),
    settlements: (settlements.results as Record<string, string | number>[]).map((s) => ({
      id: s.id,
      from: s.from_member,
      to: s.to_member,
      amountPence: s.amount_pence,
      createdAt: s.created_at,
    })),
  });
}

async function addMember(env: Env, ref: string, req: Request) {
  const gid = await groupId(env, ref);
  const name = cleanText((await body(req)).name, "Name", 40);
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS n, MAX(position) AS p, SUM(LOWER(name) = LOWER(?)) AS dup FROM members WHERE group_id = ?",
  )
    .bind(name, gid)
    .first<{ n: number; p: number; dup: number | null }>();
  if ((existing?.n ?? 0) >= 50) throw new HttpError(400, "A group can have up to 50 people");
  if (existing?.dup) throw new HttpError(409, "Someone in this group already has that name");
  try {
    await env.DB.prepare("INSERT INTO members (id, group_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(uid(), gid, name, (existing?.p ?? 0) + 1, now())
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Someone in this group already has that name");
    throw e;
  }
  return json({ ok: true }, 201);
}

async function addExpense(env: Env, ref: string, req: Request) {
  const gid = await groupId(env, ref);
  const b = await body(req);
  const description = cleanText(b.description, "Description", 120);
  const amount = pence(b.amountPence, "Amount");
  const spentOn = typeof b.spentOn === "string" && DATE_RE.test(b.spentOn) ? b.spentOn : now().slice(0, 10);
  const members = await memberIds(env, gid);
  if (typeof b.paidBy !== "string" || !members.has(b.paidBy)) throw new HttpError(400, "Payer is not in this group");
  if (!Array.isArray(b.shares) || b.shares.length === 0) throw new HttpError(400, "Add at least one share");

  const seen = new Set<string>();
  const shares = b.shares.map((s) => {
    const x = s as Record<string, unknown>;
    if (typeof x.memberId !== "string" || !members.has(x.memberId)) throw new HttpError(400, "Share for someone not in this group");
    if (seen.has(x.memberId)) throw new HttpError(400, "Each person can only have one share");
    seen.add(x.memberId);
    return { memberId: x.memberId, pence: pence(x.pence, "Share", true) };
  });
  if (shares.reduce((t, s) => t + s.pence, 0) !== amount) throw new HttpError(400, "Shares must add up to the total");

  const id = uid();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO expenses (id, group_id, description, amount_pence, paid_by, spent_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, gid, description, amount, b.paidBy, spentOn, now()),
    ...shares.map((s) =>
      env.DB.prepare("INSERT INTO expense_shares (expense_id, group_id, member_id, share_pence) VALUES (?, ?, ?, ?)").bind(
        id,
        gid,
        s.memberId,
        s.pence,
      ),
    ),
  ]);
  return json({ id }, 201);
}

async function deleteExpense(env: Env, ref: string, expenseId: string) {
  const gid = await groupId(env, ref);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM expense_shares WHERE expense_id = ? AND group_id = ?").bind(expenseId, gid),
    env.DB.prepare("DELETE FROM expenses WHERE id = ? AND group_id = ?").bind(expenseId, gid),
  ]);
  return json({ ok: true });
}

async function addSettlement(env: Env, ref: string, req: Request) {
  const gid = await groupId(env, ref);
  const b = await body(req);
  const members = await memberIds(env, gid);
  if (typeof b.from !== "string" || typeof b.to !== "string" || !members.has(b.from) || !members.has(b.to) || b.from === b.to)
    throw new HttpError(400, "Both people must be in this group");
  const amount = pence(b.amountPence, "Amount");
  const id = uid();
  await env.DB.prepare("INSERT INTO settlements (id, group_id, from_member, to_member, amount_pence, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, gid, b.from, b.to, amount, now())
    .run();
  return json({ id }, 201);
}

async function extendGroup(env: Env, ref: string) {
  const g = await env.DB.prepare("SELECT id, created_at, expires_at, extended FROM groups WHERE reference = ?")
    .bind(ref)
    .first<{ id: string; created_at: string; expires_at: string | null; extended: number }>();
  if (!g) throw new HttpError(404, "Group not found");
  assertLive(g.expires_at);
  if (!g.expires_at) throw new HttpError(409, "This group has no expiry date");
  const r = extend(Date.parse(g.created_at), Date.parse(g.expires_at), g.extended === 1);
  if (!r.ok) throw new HttpError(409, r.reason);
  const expiresAt = new Date(r.expiresMs).toISOString();
  await env.DB.prepare("UPDATE groups SET expires_at = ?, extended = 1 WHERE id = ?").bind(expiresAt, g.id).run();
  return json({ expiresAt });
}

// Runs daily (see wrangler.toml). Deletes expired groups and everything in them.
async function purgeExpired(env: Env): Promise<number> {
  const t = now();
  const expired = "SELECT id FROM groups WHERE expires_at IS NOT NULL AND expires_at < ?";
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM settlements WHERE group_id IN (${expired})`).bind(t),
    env.DB.prepare(`DELETE FROM expense_shares WHERE group_id IN (${expired})`).bind(t),
    env.DB.prepare(`DELETE FROM expenses WHERE group_id IN (${expired})`).bind(t),
    env.DB.prepare(`DELETE FROM members WHERE group_id IN (${expired})`).bind(t),
    env.DB.prepare("DELETE FROM groups WHERE expires_at IS NOT NULL AND expires_at < ?").bind(t),
  ]);
  return results[4].meta.changes;
}

// ---------- router ----------

async function handleApi(req: Request, env: Env, path: string[]): Promise<Response> {
  // path: ["api", "groups", ref?, sub?, id?]
  if (path[1] !== "groups") throw new HttpError(404, "Not found");
  if (path.length === 2) {
    if (req.method === "POST") return createGroup(env, req);
    throw new HttpError(405, "Method not allowed");
  }
  const ref = decodeURIComponent(path[2]).toUpperCase();
  if (!REF_RE.test(ref)) throw new HttpError(404, "Group not found");
  const sub = path[3];
  if (!sub && req.method === "GET") return getGroup(env, ref);
  if (sub === "members" && req.method === "POST") return addMember(env, ref, req);
  if (sub === "expenses" && req.method === "POST" && !path[4]) return addExpense(env, ref, req);
  if (sub === "expenses" && req.method === "DELETE" && path[4]) return deleteExpense(env, ref, path[4]);
  if (sub === "settlements" && req.method === "POST") return addSettlement(env, ref, req);
  if (sub === "extend" && req.method === "POST") return extendGroup(env, ref);
  throw new HttpError(404, "Not found");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean);
    if (path[0] !== "api") return new Response("Not found", { status: 404 }); // static assets are served before this
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (path[1] === "santa") return await handleSanta(req, env, path.slice(2));
      if (path[1] === "whip") return await handleWhip(req, env, path.slice(2));
      if (path[1] === "tally") return await handleTally(req, env, path.slice(2));
      return await handleApi(req, env, path);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong" }, 500);
    }
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(purgeExpired(env).then((n) => console.log(`Purged ${n} expired QuidsIn group(s)`)));
    ctx.waitUntil(purgeSanta(env).then((n) => console.log(`Purged ${n} expired Secret Santa draw(s)`)));
    ctx.waitUntil(purgeTally(env).then((n) => console.log(`Purged ${n} expired scoreboard(s)`)));
    ctx.waitUntil(purgeWhip(env).then((n) => console.log(`Purged ${n} expired whip-round(s)`)));
  },
} satisfies ExportedHandler<Env>;
