import { describe, expect, it } from "vitest";
import { dealItems } from "./deal";

const counts = (d: number[], people: number) => {
  const c = new Array(people).fill(0);
  d.forEach((p) => c[p]++);
  return c;
};
describe("dealItems", () => {
  it("gives everyone the same number when it divides evenly", () => {
    expect(counts(dealItems(32, 8), 8)).toEqual(new Array(8).fill(4));
  });
  it("never leaves anyone with more than one extra", () => {
    const c = counts(dealItems(32, 20), 20);
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
    expect(c.reduce((a, b) => a + b)).toBe(32);
  });
  it("with more people than items, some get none and nobody gets two", () => {
    const c = counts(dealItems(5, 8), 8);
    expect(Math.max(...c)).toBe(1);
    expect(c.filter((x) => x === 0).length).toBe(3);
  });
  it("is not always the same deal", () => {
    const seen = new Set(Array.from({ length: 30 }, () => dealItems(6, 3).join("")));
    expect(seen.size).toBeGreaterThan(5);
  });
  it("refuses empty input", () => {
    expect(() => dealItems(0, 3)).toThrow();
  });
});
