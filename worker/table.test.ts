import { describe, expect, it } from "vitest";
import { leagueTable, roundRobin } from "./table";

const teams = [{ id: "a", name: "Ann" }, { id: "b", name: "Bob" }, { id: "c", name: "Cy" }];
describe("leagueTable", () => {
  it("scores wins, draws and losses and sorts by points then goal difference", () => {
    const t = leagueTable(teams, [
      { homeId: "a", awayId: "b", homeScore: 2, awayScore: 0 },
      { homeId: "b", awayId: "c", homeScore: 1, awayScore: 1 },
      { homeId: "c", awayId: "a", homeScore: 0, awayScore: 0 },
    ], 3, 1);
    expect(t.map((r) => [r.name, r.points, r.diff])).toEqual([["Ann", 4, 2], ["Cy", 2, 0], ["Bob", 1, -2]]);
    expect(t[0]).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, for: 2, against: 0 });
  });
  it("uses the points the organiser chose", () => {
    const t = leagueTable(teams, [{ homeId: "a", awayId: "b", homeScore: 1, awayScore: 0 }], 2, 1);
    expect(t[0].points).toBe(2);
  });
  it("lists teams with no results at zero, alphabetically", () => {
    expect(leagueTable(teams, [], 3, 1).map((r) => r.name)).toEqual(["Ann", "Bob", "Cy"]);
  });
});
describe("roundRobin", () => {
  const pairKey = (a: number, b: number) => [a, b].sort().join("-");
  it("every team plays every other exactly once", () => {
    for (const n of [2, 3, 4, 5, 8]) {
      const f = roundRobin(n, 1);
      expect(f.length).toBe((n * (n - 1)) / 2);
      expect(new Set(f.map(([a, b]) => pairKey(a, b))).size).toBe(f.length);
    }
  });
  it("two legs gives home and away", () => {
    const f = roundRobin(4, 2);
    expect(f.length).toBe(12);
    expect(new Set(f.map(([a, b]) => `${a}>${b}`)).size).toBe(12);
  });
});
