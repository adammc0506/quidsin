import { randomInt } from "./http";

/**
 * Deal items to people fairly: shuffle both, then hand the items out round the table,
 * so nobody gets more than one extra. Returns, for each item index, the index of the person who gets it.
 * If there are more people than items, some people simply get nothing.
 */
export function dealItems(items: number, people: number, rand: (n: number) => number = randomInt): number[] {
  if (items < 1 || people < 1) throw new RangeError("Need at least one item and one person");
  const shuffle = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const order = shuffle(items);
  const who = shuffle(people);
  const out = new Array<number>(items);
  order.forEach((item, k) => (out[item] = who[k % people]));
  return out;
}
