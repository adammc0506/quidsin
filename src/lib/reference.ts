// Unique group references like "QI-7KQ4-M9X2".
// Crockford Base32 alphabet: no I, L, O or U, so codes are easy to read aloud.
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateReference(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join("");
  return `QI-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Tidy what someone typed: upper-case, map look-alike letters, add dashes. */
export function normaliseReference(input: string): string | null {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.startsWith("QI")) s = s.slice(2);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `QI-${s.slice(0, 4)}-${s.slice(4)}`;
}
