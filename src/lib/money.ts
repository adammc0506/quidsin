// Core money logic for QuidsIn. All amounts are integer pence — never floats.

export interface Member {
  id: string;
  name: string;
}

export interface Share {
  memberId: string;
  pence: number;
}

export interface Expense {
  id: string;
  description: string;
  amountPence: number;
  paidBy: string;
  shares: Share[];
  spentOn: string; // YYYY-MM-DD
  createdAt: string;
}

export interface Settlement {
  id: string;
  from: string; // member who paid
  to: string; // member who received
  amountPence: number;
  createdAt: string;
}

export interface Group {
  reference: string;
  name: string;
  currency: string;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  createdAt: string;
  /** When the group is deleted (cloud only). */
  expiresAt?: string | null;
  /** True while a "keep another month" extension is still allowed. */
  canExtend?: boolean;
}

export interface Transfer {
  from: string;
  to: string;
  amountPence: number;
}

/** Parse "12.34", "£12.3", "12" into pence. Returns null when invalid. */
export function parsePounds(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return parseInt(whole, 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
}

export function formatPence(pence: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(pence / 100);
}

/**
 * Split a total equally between participants. Any leftover pence go one each
 * to the first participants in the order given, so the shares always sum to the total.
 */
export function splitEqually(totalPence: number, participantIds: string[]): Share[] {
  if (participantIds.length === 0) return [];
  const base = Math.floor(totalPence / participantIds.length);
  let remainder = totalPence - base * participantIds.length;
  return participantIds.map((memberId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { memberId, pence: base + extra };
  });
}

/** Split by shares (e.g. 2:1:1). Leftover pence are handed out the same way as splitEqually. */
export function splitByWeights(totalPence: number, weights: { memberId: string; weight: number }[]): Share[] {
  const active = weights.filter((w) => w.weight > 0);
  const totalWeight = active.reduce((s, w) => s + w.weight, 0);
  if (totalWeight === 0) return [];
  const shares = active.map((w) => ({ memberId: w.memberId, pence: Math.floor((totalPence * w.weight) / totalWeight) }));
  let remainder = totalPence - shares.reduce((s, x) => s + x.pence, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % shares.length) {
    shares[i].pence += 1;
    remainder -= 1;
  }
  return shares;
}

/** Net position per member: positive = is owed money, negative = owes money. */
export function computeBalances(group: Pick<Group, "members" | "expenses" | "settlements">): Map<string, number> {
  const net = new Map<string, number>(group.members.map((m) => [m.id, 0]));
  const add = (id: string, delta: number) => net.set(id, (net.get(id) ?? 0) + delta);
  for (const e of group.expenses) {
    add(e.paidBy, e.amountPence);
    for (const s of e.shares) add(s.memberId, -s.pence);
  }
  for (const s of group.settlements) {
    add(s.from, s.amountPence);
    add(s.to, -s.amountPence);
  }
  return net;
}

/**
 * Debt simplification: repeatedly match the biggest debtor with the biggest
 * creditor. Totals owed never change; the number of transfers is at most n-1.
 */
export function simplifyDebts(balances: Map<string, number>): Transfer[] {
  const debtors = [...balances].filter(([, v]) => v < 0).map(([id, v]) => ({ id, amt: -v }));
  const creditors = [...balances].filter(([, v]) => v > 0).map(([id, v]) => ({ id, amt: v }));
  const transfers: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.amt - a.amt);
    creditors.sort((a, b) => b.amt - a.amt);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.amt, c.amt);
    transfers.push({ from: d.id, to: c.id, amountPence: amt });
    d.amt -= amt;
    c.amt -= amt;
    if (d.amt === 0) debtors.shift();
    if (c.amt === 0) creditors.shift();
  }
  return transfers;
}

export function groupTotal(group: Pick<Group, "expenses">): number {
  return group.expenses.reduce((s, e) => s + e.amountPence, 0);
}
