import { describe, expect, it } from "vitest";
import { assignBalls, decide, nextTurn, winner, type P, type Rules } from "./killerrules";

const rules: Rules = { killerRequired: true, ownLoses: true, scratchLoses: true };
const mk = (): P[] => [
  { id: "a", name: "Ann", lives: 3, killer: false },
  { id: "b", name: "Bob", lives: 3, killer: false },
  { id: "c", name: "Cy", lives: 3, killer: false },
];

describe("decide", () => {
  it("own ball makes you a killer", () => {
    expect(decide(rules, mk(), { type: "own", shooterId: "a" })).toMatchObject({ kind: "own", killerPlayerId: "a" });
  });
  it("a killer potting their own ball loses a life, if that rule is on", () => {
    const ps = mk();
    ps[0].killer = true;
    expect(decide(rules, ps, { type: "own", shooterId: "a" })).toMatchObject({ livesPlayerId: "a", livesDelta: -1 });
    expect(decide({ ...rules, ownLoses: false }, ps, { type: "own", shooterId: "a" })).toHaveProperty("error");
  });
  it("only killers can take lives when required", () => {
    expect(decide(rules, mk(), { type: "pot", shooterId: "a", victimId: "b" })).toHaveProperty("error");
    expect(decide({ ...rules, killerRequired: false }, mk(), { type: "pot", shooterId: "a", victimId: "b" })).toMatchObject({ livesPlayerId: "b", livesDelta: -1 });
    const ps = mk();
    ps[0].killer = true;
    expect(decide(rules, ps, { type: "pot", shooterId: "a", victimId: "b" })).toMatchObject({ kind: "pot", livesPlayerId: "b" });
  });
  it("refuses potting an eliminated player's ball or your own as a victim", () => {
    const ps = mk();
    ps[0].killer = true;
    ps[1].lives = 0;
    expect(decide(rules, ps, { type: "pot", shooterId: "a", victimId: "b" })).toHaveProperty("error");
    expect(decide(rules, ps, { type: "pot", shooterId: "a", victimId: "a" })).toHaveProperty("error");
  });
  it("scratch costs the shooter a life only if the rule is on", () => {
    expect(decide(rules, mk(), { type: "scratch", shooterId: "a" })).toMatchObject({ livesPlayerId: "a", livesDelta: -1 });
    expect(decide({ ...rules, scratchLoses: false }, mk(), { type: "scratch", shooterId: "a" })).toHaveProperty("error");
  });
  it("adjust can give and take lives within limits", () => {
    expect(decide(rules, mk(), { type: "adjust", playerId: "a", delta: -1 })).toMatchObject({ livesDelta: -1 });
    expect(decide(rules, mk(), { type: "adjust", playerId: "a", delta: 1 })).toMatchObject({ livesDelta: 1 });
    const ps = mk();
    ps[0].lives = 9;
    expect(decide(rules, ps, { type: "adjust", playerId: "a", delta: 1 })).toHaveProperty("error");
    ps[1].lives = 0;
    expect(decide(rules, ps, { type: "adjust", playerId: "b", delta: -1 })).toHaveProperty("error");
  });
  it("nothing happens once there's a winner", () => {
    const ps = mk();
    ps[1].lives = 0;
    ps[2].lives = 0;
    expect(winner(ps)?.id).toBe("a");
    expect(decide(rules, ps, { type: "own", shooterId: "a" })).toHaveProperty("error");
  });
});

describe("assignBalls", () => {
  const rand = (n: number) => n - 1;
  it("gives each player a different ball from 1 to 15", () => {
    const b = assignBalls(15, Array(15).fill(null), rand)!;
    expect([...b].sort((x, y) => x - y)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
  it("keeps chosen balls and fills the rest from what's left", () => {
    const b = assignBalls(3, [8, null, 1], rand)!;
    expect(b[0]).toBe(8);
    expect(b[2]).toBe(1);
    expect(new Set(b).size).toBe(3);
  });
  it("rejects clashing choices", () => {
    expect(assignBalls(2, [4, 4], rand)).toBeNull();
  });
});

describe("pub killer (turns)", () => {
  const pub: Rules = { mode: "turns", killerRequired: false, ownLoses: false, scratchLoses: false, blackPays: true };
  it("a miss costs a life, a hit does not", () => {
    expect(decide(pub, mk(), { type: "miss", shooterId: "a" })).toMatchObject({ livesPlayerId: "a", livesDelta: -1 });
    const hit = decide(pub, mk(), { type: "hit", shooterId: "a" });
    expect(hit).toMatchObject({ kind: "hit" });
    expect(hit).not.toHaveProperty("livesDelta");
  });
  it("potting the black marks the player to cover the re-rack", () => {
    expect(decide(pub, mk(), { type: "black", shooterId: "b" })).toMatchObject({ kind: "black", blackPlayerId: "b" });
    expect(decide({ ...pub, blackPays: false }, mk(), { type: "black", shooterId: "b" })).toHaveProperty("error");
  });
  it("keeps the two kinds of game apart", () => {
    expect(decide(rules, mk(), { type: "miss", shooterId: "a" })).toHaveProperty("error");
    expect(decide(pub, mk(), { type: "own", shooterId: "a" })).toHaveProperty("error");
  });
  it("turn order goes round and skips people who are out", () => {
    const ps = mk();
    expect(nextTurn(ps, null)).toBe("a");
    expect(nextTurn(ps, "a")).toBe("b");
    expect(nextTurn(ps, "c")).toBe("a");
    ps[1].lives = 0;
    expect(nextTurn(ps, "a")).toBe("c");
    ps[2].lives = 0;
    expect(nextTurn(ps, "a")).toBeNull();
  });
});
