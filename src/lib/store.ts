import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Expense, Group, Share } from "./money";
import { generateReference } from "./reference";

export interface NewExpense {
  description: string;
  amountPence: number;
  paidBy: string;
  shares: Share[];
  spentOn: string;
}

export interface Store {
  /** "supabase" = shared online; "demo" = this device only. */
  mode: "supabase" | "demo";
  createGroup(name: string, memberNames: string[]): Promise<string>;
  getGroup(reference: string): Promise<Group | null>;
  addMember(reference: string, name: string): Promise<void>;
  addExpense(reference: string, expense: NewExpense): Promise<void>;
  deleteExpense(reference: string, expenseId: string): Promise<void>;
  addSettlement(reference: string, from: string, to: string, amountPence: number): Promise<void>;
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---------- Supabase (production) ----------
// Every call goes through a SECURITY DEFINER function that takes the reference.
// Tables themselves are closed to the public, so the reference acts as the key.
class SupabaseStore implements Store {
  mode = "supabase" as const;
  private db: SupabaseClient;
  constructor(url: string, anonKey: string) {
    this.db = createClient(url, anonKey, { auth: { persistSession: false } });
  }
  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  createGroup(name: string, memberNames: string[]) {
    return this.rpc<string>("qi_create_group", { p_name: name, p_members: memberNames });
  }
  async getGroup(reference: string) {
    return (await this.rpc<Group | null>("qi_get_group", { p_ref: reference })) ?? null;
  }
  async addMember(reference: string, name: string) {
    await this.rpc("qi_add_member", { p_ref: reference, p_name: name });
  }
  async addExpense(reference: string, e: NewExpense) {
    await this.rpc("qi_add_expense", {
      p_ref: reference,
      p_description: e.description,
      p_amount_pence: e.amountPence,
      p_paid_by: e.paidBy,
      p_spent_on: e.spentOn,
      p_shares: e.shares,
    });
  }
  async deleteExpense(reference: string, expenseId: string) {
    await this.rpc("qi_delete_expense", { p_ref: reference, p_expense_id: expenseId });
  }
  async addSettlement(reference: string, from: string, to: string, amountPence: number) {
    await this.rpc("qi_add_settlement", { p_ref: reference, p_from: from, p_to: to, p_amount_pence: amountPence });
  }
}

// ---------- Demo (no backend configured) ----------
class DemoStore implements Store {
  mode = "demo" as const;
  private key = (ref: string) => `quidsin.demo.${ref}`;
  // In-memory copy so the demo still works where storage is blocked.
  private memory = new Map<string, Group>();
  private load(ref: string): Group | null {
    const mem = this.memory.get(ref);
    if (mem) return structuredClone(mem);
    try {
      const raw = localStorage.getItem(this.key(ref));
      return raw ? (JSON.parse(raw) as Group) : null;
    } catch {
      return null;
    }
  }
  private save(g: Group) {
    this.memory.set(g.reference, structuredClone(g));
    try {
      localStorage.setItem(this.key(g.reference), JSON.stringify(g));
    } catch {
      /* storage unavailable */
    }
  }
  private mutate(ref: string, fn: (g: Group) => void) {
    const g = this.load(ref);
    if (!g) throw new Error("Group not found");
    fn(g);
    this.save(g);
  }
  async createGroup(name: string, memberNames: string[]) {
    const reference = generateReference();
    this.save({
      reference,
      name,
      currency: "GBP",
      members: memberNames.map((n) => ({ id: uid(), name: n })),
      expenses: [],
      settlements: [],
      createdAt: now(),
    });
    return reference;
  }
  async getGroup(reference: string) {
    return this.load(reference);
  }
  async addMember(reference: string, name: string) {
    this.mutate(reference, (g) => g.members.push({ id: uid(), name }));
  }
  async addExpense(reference: string, e: NewExpense) {
    const expense: Expense = { ...e, id: uid(), createdAt: now() };
    this.mutate(reference, (g) => g.expenses.unshift(expense));
  }
  async deleteExpense(reference: string, expenseId: string) {
    this.mutate(reference, (g) => (g.expenses = g.expenses.filter((x) => x.id !== expenseId)));
  }
  async addSettlement(reference: string, from: string, to: string, amountPence: number) {
    this.mutate(reference, (g) => g.settlements.unshift({ id: uid(), from, to, amountPence, createdAt: now() }));
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const store: Store = url && key ? new SupabaseStore(url, key) : new DemoStore();

// ---------- "My groups" list kept on this device ----------
export interface RecentGroup {
  reference: string;
  name: string;
}
const RECENT_KEY = "quidsin.recent";
export function getRecent(): RecentGroup[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function rememberGroup(g: RecentGroup) {
  const list = [g, ...getRecent().filter((x) => x.reference !== g.reference)].slice(0, 20);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
export function forgetGroup(reference: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(getRecent().filter((x) => x.reference !== reference)));
  } catch {
    /* ignore */
  }
}
