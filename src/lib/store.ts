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
  /** "cloud" = shared online; "demo" = this device only. */
  mode: "cloud" | "demo";
  /** keepDays: 30 (default) or 90. Groups are deleted automatically after that. */
  createGroup(name: string, memberNames: string[], keepDays?: 30 | 90): Promise<string>;
  /** One "keep another month" extension, up to 3 months in total. */
  extendGroup(reference: string): Promise<void>;
  getGroup(reference: string): Promise<Group | null>;
  /** Keeps a group fresh where the backend supports it. Returns an unsubscribe function. */
  subscribe?(reference: string, onChange: (g: Group | null) => void, onError: (e: Error) => void): () => void;
  addMember(reference: string, name: string): Promise<void>;
  addExpense(reference: string, expense: NewExpense): Promise<void>;
  deleteExpense(reference: string, expenseId: string): Promise<void>;
  addSettlement(reference: string, from: string, to: string, amountPence: number): Promise<void>;
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---------- Cloudflare Worker + D1 (production) ----------
// The Worker API lives at /api on the same site, or at VITE_API_URL for the Android app.
const POLL_MS = 20000;

class ApiStore implements Store {
  mode = "cloud" as const;
  private listeners = new Map<string, Set<() => void>>();
  private base: string;
  constructor(base: string) {
    this.base = base;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/api${path}`, {
        ...init,
        headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      });
    } catch {
      throw new Error("Can't reach QuidsIn. Check your internet connection.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data as T;
  }
  private post(path: string, body: unknown) {
    return this.call(path, { method: "POST", body: JSON.stringify(body) });
  }
  /** After our own change, refresh everyone watching that group on this device. */
  private changed(reference: string) {
    this.listeners.get(reference)?.forEach((l) => l());
  }
  private g(reference: string) {
    return `/groups/${encodeURIComponent(reference)}`;
  }

  async createGroup(name: string, memberNames: string[], keepDays: 30 | 90 = 30) {
    const { reference } = await this.call<{ reference: string }>("/groups", {
      method: "POST",
      body: JSON.stringify({ name, members: memberNames, retentionDays: keepDays }),
    });
    return reference;
  }
  async extendGroup(reference: string) {
    await this.post(`${this.g(reference)}/extend`, {});
    this.changed(reference);
  }
  async getGroup(reference: string) {
    try {
      return await this.call<Group>(this.g(reference));
    } catch (e) {
      // 404 = no such group, 410 = it expired and was deleted.
      const status = (e as { status?: number }).status;
      if (status === 404 || status === 410) return null;
      throw e;
    }
  }
  subscribe(reference: string, onChange: (g: Group | null) => void, onError: (e: Error) => void) {
    let stopped = false;
    let lastJson = "";
    const refresh = async () => {
      if (stopped) return;
      try {
        const g = await this.getGroup(reference);
        const j = JSON.stringify(g);
        if (j !== lastJson) {
          lastJson = j;
          onChange(g);
        }
      } catch (e) {
        // Keep showing the last copy if a background refresh fails.
        if (!lastJson) onError(e as Error);
      }
    };
    const set = this.listeners.get(reference) ?? new Set();
    set.add(refresh);
    this.listeners.set(reference, set);
    // Poll only while the app is on screen, to save the free daily allowance.
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    refresh();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      set.delete(refresh);
    };
  }
  async addMember(reference: string, name: string) {
    await this.post(`${this.g(reference)}/members`, { name });
    this.changed(reference);
  }
  async addExpense(reference: string, e: NewExpense) {
    await this.post(`${this.g(reference)}/expenses`, e);
    this.changed(reference);
  }
  async deleteExpense(reference: string, expenseId: string) {
    await this.call(`${this.g(reference)}/expenses/${encodeURIComponent(expenseId)}`, { method: "DELETE" });
    this.changed(reference);
  }
  async addSettlement(reference: string, from: string, to: string, amountPence: number) {
    await this.post(`${this.g(reference)}/settlements`, { from, to, amountPence });
    this.changed(reference);
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
  async extendGroup() {
    /* demo groups stay on this device and never expire */
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

// VITE_API_URL: "/" for the website (same origin), the full Worker URL for the
// Android app, or unset for on-device demo mode.
const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
export const store: Store = apiUrl ? new ApiStore(apiUrl.replace(/\/+$/, "")) : new DemoStore();

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
