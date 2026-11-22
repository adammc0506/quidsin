import { describe, expect, it } from "vitest";
import { drawCycle } from "./draw";

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
