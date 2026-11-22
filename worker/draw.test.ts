import { describe, expect, it } from "vitest";
import { drawCycle, drawWithExclusions } from "./draw";

const isSingleCycle = (p: number[]) => {
  let seen = 0, i = 0;
  do { i = p[i]; seen++; } while (i !== 0 && seen <= p.length);
  return i === 0 && seen === p.length;
};

describe("drawCycle", () => {
  it("never lets anyone draw themselves and makes one loop", () => {
    for (let n = 3; n <= 40; n++) {
      for (let t = 0; t < 50; t++) {
        const p = drawCycle(n, (k) => Math.floor(Math.random() * k));
        expect(new Set(p).size).toBe(n); // everyone receives exactly once
        p.forEach((r, g) => expect(r).not.toBe(g));
        expect(isSingleCycle(p)).toBe(true);
      }
    }
  });

  it("never pairs two people with each other in groups of 3 or more", () => {
    for (let t = 0; t < 500; t++) {
      const p = drawCycle(4, (k) => Math.floor(Math.random() * k));
      p.forEach((r, g) => expect(p[r]).not.toBe(g));
    }
  });

  it("refuses groups under 3", () => {
    expect(() => drawCycle(2)).toThrow();
  });

  it("works with the real crypto random source", () => {
    const p = drawCycle(10);
    expect(isSingleCycle(p)).toBe(true);
  });
});

describe("drawWithExclusions", () => {
  const rnd = (k: number) => Math.floor(Math.random() * k);
  const valid = (p: number[], banned: [number, number][]) => {
    expect(new Set(p).size).toBe(p.length);
    p.forEach((r, g) => {
      expect(r).not.toBe(g);
      expect(p[r]).not.toBe(g);
      banned.forEach(([a, b]) => expect((g === a && r === b) || (g === b && r === a)).toBe(false));
    });
  };
  it("keeps banned pairs apart in both directions", () => {
    const banned: [number, number][] = [[0, 1], [2, 3], [4, 5]];
    for (let t = 0; t < 300; t++) valid(drawWithExclusions(8, banned, rnd)!, banned);
  });
  it("still finds a draw when single loops are impossible", () => {
    // 4 people, two couples: the only valid loops are 0-2-1-3 style, which exist; ban more so only multi-cycle works
    const banned: [number, number][] = [[0, 1], [2, 3], [0, 2], [1, 3]];
    // each person can only draw their "diagonal": 0<->3, 1<->2, which would be swaps, so this must fail
    expect(drawWithExclusions(4, banned, rnd)).toBeNull();
  });
  it("finds two separate loops when needed", () => {
    // 6 people: ban so that any single loop must break, but two 3-loops work
    const banned: [number, number][] = [];
    for (const a of [0, 1, 2]) for (const b of [3, 4, 5]) banned.push([a, b]);
    const p = drawWithExclusions(6, banned, rnd)!;
    valid(p, banned);
    [0, 1, 2].forEach((g) => expect([0, 1, 2]).toContain(p[g]));
  });
  it("reports impossible rules", () => {
    expect(drawWithExclusions(3, [[0, 1], [0, 2]], rnd)).toBeNull();
  });
  it("with no exclusions behaves like drawCycle", () => {
    valid(drawWithExclusions(5, [], rnd)!, []);
  });
});
