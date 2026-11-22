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
