// Secret Santa client: talks to /api/santa and remembers this device's private keys.

export type Person = { id: string; name: string; claimed: boolean };
export type Draw = {
  reference: string;
  name: string;
  budgetPence: number | null;
  exchangeDate: string | null;
  expiresAt: string;
  people: Person[];
  canExtend?: boolean;
};
export type Me = {
  draw: Draw;
  me: { id: string; name: string; wishlist: string };
  recipient: { name: string; wishlist: string };
};

const base = (import.meta.env.VITE_API_URL || "/").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/santa${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Can't reach Tab & Tally. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

const post = <T>(path: string, data: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
  create: (d: { name: string; members: string[]; budgetPence?: number; exchangeDate?: string; retentionDays: 30 | 90 }) =>
    post<{ reference: string; adminToken: string }>("/draws", d),
  draw: (ref: string) => call<Draw>(`/draws/${encodeURIComponent(ref)}`),
  claim: (ref: string, personId: string) => post<{ token: string }>(`/draws/${encodeURIComponent(ref)}/claim`, { personId }),
  me: (token: string) => call<Me>(`/me/${token}`),
  wishlist: (token: string, wishlist: string) =>
    call<{ wishlist: string }>(`/me/${token}/wishlist`, { method: "PUT", body: JSON.stringify({ wishlist }) }),
  admin: (token: string) => call<Draw>(`/admin/${token}`),
  release: (token: string, personId: string) => post<{ ok: true }>(`/admin/${token}/release`, { personId }),
  extend: (token: string) => post<{ expiresAt: string }>(`/admin/${token}/extend`, {}),
};

// ---------- this device's keys ----------

export type Saved = { ref: string; name: string; token?: string; admin?: string; me?: string };
const KEY = "santa:mine";

function load(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const mine = {
  all: load,
  get: (ref: string) => load().find((s) => s.ref === ref),
  save(entry: Saved) {
    const list = load().filter((s) => s.ref !== entry.ref);
    const old = load().find((s) => s.ref === entry.ref);
    list.unshift({ ...old, ...entry });
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
    } catch {
      /* storage blocked: links still work */
    }
  },
  forget(ref: string) {
    try {
      localStorage.setItem(KEY, JSON.stringify(load().filter((s) => s.ref !== ref)));
    } catch {
      /* ignore */
    }
  },
};

// ---------- references and links ----------

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function normaliseRef(input: string): string | null {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.startsWith("SS")) s = s.slice(2);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `SS-${s.slice(0, 4)}-${s.slice(4)}`;
}

const origin = () => (location.protocol.startsWith("http") ? location.origin : "https://tabandtally.co.uk");
export const groupLink = (ref: string) => `${origin()}/santa/#/d/${ref}`;
export const privateLink = (token: string) => `${origin()}/santa/#/me/${token}`;
export const adminLink = (token: string) => `${origin()}/santa/#/admin/${token}`;

/** Share sheet if available, otherwise copy. Returns "shared" | "copied" | "failed". */
export async function shareOrCopy(title: string, text: string, url: string): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "failed";
    }
  }
  return copy(`${text} ${url}`);
}

export async function copy(value: string): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(value);
    return "copied";
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      /* ignore */
    }
    ta.remove();
    return ok ? "copied" : "failed";
  }
}
