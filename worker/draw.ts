import { randomInt } from "./http";

/**
 * Secret Santa draw: shuffle everyone, then each person gives to the next one round the circle.
 * That is one single loop, so nobody draws themselves and no two people simply swap.
 * Returns a map of giver index -> receiver index.
 */
export function drawCycle(n: number, rand: (k: number) => number = randomInt): number[] {
  if (n < 3) throw new RangeError("A draw needs at least 3 people");
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rand(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const givesTo = new Array<number>(n);
  for (let k = 0; k < n; k++) givesTo[order[k]] = order[(k + 1) % n];
  return givesTo;
}

/**
 * Like drawCycle, but some pairs must not draw each other (couples, housemates). Each pair is banned in both directions.
 * First tries single loops (shuffles that keep banned pairs apart). If that fails, searches for any valid assignment
 * with no one drawing themselves, no banned pair and no simple swap. Returns null if the rules can't be met.
 */
export function drawWithExclusions(n: number, banned: [number, number][], rand: (k: number) => number = randomInt): number[] | null {
  if (n < 3) throw new RangeError("A draw needs at least 3 people");
  if (banned.length === 0) return drawCycle(n, rand);
  const no = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (const [a, b] of banned) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) throw new RangeError("Bad exclusion");
    no[a][b] = no[b][a] = true;
  }
  const shuffle = (xs: number[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  };
  // 1. Single loops by rejection.
  for (let t = 0; t < 3000; t++) {
    const order = shuffle(Array.from({ length: n }, (_, i) => i));
    let ok = true;
    for (let k = 0; k < n && ok; k++) ok = !no[order[k]][order[(k + 1) % n]];
    if (!ok) continue;
    const out = new Array<number>(n);
    for (let k = 0; k < n; k++) out[order[k]] = order[(k + 1) % n];
    return out;
  }
  // 2. Any valid assignment, by randomised search with a step limit.
  const givesTo = new Array<number>(n).fill(-1);
  const taken = new Array<boolean>(n).fill(false);
  const givers = shuffle(Array.from({ length: n }, (_, i) => i));
  let steps = 0;
  const place = (k: number): boolean => {
    if (k === n) return true;
    if (++steps > 200000) return false;
    const g = givers[k];
    for (const r of shuffle(Array.from({ length: n }, (_, i) => i))) {
      if (r === g || taken[r] || no[g][r] || givesTo[r] === g) continue;
      givesTo[g] = r;
      taken[r] = true;
      if (place(k + 1)) return true;
      givesTo[g] = -1;
      taken[r] = false;
    }
    return false;
  };
  return place(0) ? givesTo : null;
}
