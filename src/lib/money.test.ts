import { describe, expect, it } from "vitest";
import { computeBalances, parsePounds, simplifyDebts, splitByWeights, splitEqually } from "./money";
import { generateReference, normaliseReference } from "./reference";

const sum = (xs: { pence: number }[]) => xs.reduce((s, x) => s + x.pence, 0);

describe("parsePounds", () => {
  it("parses common inputs", () => {
    expect(parsePounds("12.34")).toBe(1234);
    expect(parsePounds("£1,200.5")).toBe(120050);
    expect(parsePounds("7")).toBe(700);
    expect(parsePounds("1.234")).toBeNull();
    expect(parsePounds("abc")).toBeNull();
  });
});

describe("splits", () => {
  it("equal split always sums to the total", () => {
    const s = splitEqually(1000, ["a", "b", "c"]);
    expect(s.map((x) => x.pence)).toEqual([334, 333, 333]);
    expect(sum(s)).toBe(1000);
  });
  it("weighted split sums to the total", () => {
    const s = splitByWeights(1001, [
      { memberId: "a", weight: 2 },
      { memberId: "b", weight: 1 },
      { memberId: "c", weight: 0 },
    ]);
    expect(s).toHaveLength(2);
    expect(sum(s)).toBe(1001);
  });
});

describe("balances and simplification", () => {
  const members = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id }));
  const group = {
    members,
    settlements: [{ id: "s1", from: "b", to: "a", amountPence: 500, createdAt: "" }],
    expenses: [
      { id: "1", description: "", amountPence: 5000, paidBy: "a", shares: splitEqually(5000, ["a", "b", "c", "d", "e"]), spentOn: "", createdAt: "" },
      { id: "2", description: "", amountPence: 3000, paidBy: "c", shares: splitEqually(3000, ["b", "c", "d"]), spentOn: "", createdAt: "" },
      { id: "3", description: "", amountPence: 1234, paidBy: "e", shares: splitEqually(1234, ["a", "e"]), spentOn: "", createdAt: "" },
    ],
  };
  it("balances net to zero", () => {
    const b = computeBalances(group);
    expect([...b.values()].reduce((s, v) => s + v, 0)).toBe(0);
    expect(b.get("a")).toBe(5000 - 1000 - 617 - 500);
  });
  it("transfers clear every balance in at most n-1 payments", () => {
    const b = computeBalances(group);
    const t = simplifyDebts(b);
    expect(t.length).toBeLessThanOrEqual(members.length - 1);
    for (const x of t) {
      b.set(x.from, b.get(x.from)! + x.amountPence);
      b.set(x.to, b.get(x.to)! - x.amountPence);
    }
    expect([...b.values()].every((v) => v === 0)).toBe(true);
  });
});

describe("references", () => {
  it("generates valid, normalisable codes", () => {
    for (let i = 0; i < 200; i++) {
      const r = generateReference();
      expect(r).toMatch(/^QI-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(normaliseReference(r.toLowerCase().replace(/-/g, " "))).toBe(r);
    }
  });
  it("fixes look-alike characters and rejects junk", () => {
    expect(normaliseReference("qi-7kq4-m9xo")).toBe("QI-7KQ4-M9X0");
    expect(normaliseReference("hello")).toBeNull();
  });
});
