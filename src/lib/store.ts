import { initializeApp } from "firebase/app";
import {
  arrayUnion,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfig, firebaseConfigured } from "../firebase-config";
import type { Expense, Group, Member, Settlement, Share } from "./money";
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
  createGroup(name: string, memberNames: string[]): Promise<string>;
  getGroup(reference: string): Promise<Group | null>;
  /** Live updates where the backend supports them. Returns an unsubscribe function. */
  subscribe?(reference: string, onChange: (g: Group | null) => void, onError: (e: Error) => void): () => void;
  addMember(reference: string, name: string): Promise<void>;
  addExpense(reference: string, expense: NewExpense): Promise<void>;
  deleteExpense(reference: string, expenseId: string): Promise<void>;
  addSettlement(reference: string, from: string, to: string, amountPence: number): Promise<void>;
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

/** Newest first, the way the app shows them. */
function tidy(g: Group): Group {
  return {
    ...g,
    expenses: [...(g.expenses ?? [])].sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt)),
    settlements: [...(g.settlements ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

// ---------- Firebase Firestore (production) ----------
// One document per group at groups/{reference}. Security rules allow reading a
// group only by its exact reference (no listing), so the reference is the key.
class FirebaseStore implements Store {
  mode = "cloud" as const;
  private db: Firestore;
  constructor() {
    this.db = getFirestore(initializeApp(firebaseConfig));
  }
  private ref(reference: string) {
    return doc(this.db, "groups", reference);
  }
  async createGroup(name: string, memberNames: string[]) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = generateReference();
      const created = await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(this.ref(reference));
        if (snap.exists()) return false;
        const group: Group = {
          reference,
          name,
          currency: "GBP",
          members: memberNames.map((n) => ({ id: uid(), name: n })),
          expenses: [],
          settlements: [],
          createdAt: now(),
        };
        tx.set(this.ref(reference), group);
        return true;
      });
      if (created) return reference;
    }
    throw new Error("Couldn't create a unique reference. Please try again.");
  }
  async getGroup(reference: string) {
    const snap = await getDoc(this.ref(reference));
    return snap.exists() ? tidy(snap.data() as Group) : null;
  }
  subscribe(reference: string, onChange: (g: Group | null) => void, onError: (e: Error) => void) {
    return onSnapshot(
      this.ref(reference),
      (snap) => {
        // An empty answer from the local cache isn't proof the group doesn't
        // exist: wait for the server before saying "not found".
        if (!snap.exists() && snap.metadata.fromCache) return;
        onChange(snap.exists() ? tidy(snap.data() as Group) : null);
      },
      (err) => onError(err),
    );
  }
  async addMember(reference: string, name: string) {
    const member: Member = { id: uid(), name };
    await updateDoc(this.ref(reference), { members: arrayUnion(member) });
  }
  async addExpense(reference: string, e: NewExpense) {
    const expense: Expense = { ...e, id: uid(), createdAt: now() };
    await updateDoc(this.ref(reference), { expenses: arrayUnion(expense) });
  }
  async deleteExpense(reference: string, expenseId: string) {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.ref(reference));
      if (!snap.exists()) throw new Error("Group not found");
      const expenses = (snap.data() as Group).expenses.filter((x) => x.id !== expenseId);
      tx.update(this.ref(reference), { expenses });
    });
  }
  async addSettlement(reference: string, from: string, to: string, amountPence: number) {
    const s: Settlement = { id: uid(), from, to, amountPence, createdAt: now() };
    await updateDoc(this.ref(reference), { settlements: arrayUnion(s) });
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

export const store: Store = firebaseConfigured ? new FirebaseStore() : new DemoStore();

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
