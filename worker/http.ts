// Small helpers shared by every Tab & Tally API.

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford Base32

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
  });

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

/** Uniform random integer in [0, n) using rejection sampling (no modulo bias). */
export function randomInt(n: number): number {
  if (n <= 0 || n > 2 ** 32) throw new RangeError("n out of range");
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export function newReference(prefix: string): string {
  const s = Array.from({ length: 8 }, () => ALPHABET[randomInt(32)]).join("");
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}

export const refPattern = (prefix: string) => new RegExp(`^${prefix}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$`);

/** A long random secret for private links (160 bits). */
export function newToken(): string {
  return Array.from({ length: 32 }, () => ALPHABET[randomInt(32)]).join("").toLowerCase();
}

/** Secrets are stored hashed, so a database leak can't be used to open anyone's link. */
export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token.toLowerCase()));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function cleanText(v: unknown, field: string, max: number): string {
  if (typeof v !== "string") throw new HttpError(400, `${field} is required`);
  const s = v.trim().replace(/\s+/g, " ");
  if (!s) throw new HttpError(400, `${field} is required`);
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max})`);
  return s;
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (b && typeof b === "object") return b as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "Invalid JSON body");
}
