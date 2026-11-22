// League table and fixture helpers, kept apart from the database so they can be tested.

export type Result = { homeId: string; awayId: string; homeScore: number; awayScore: number };
export type Row = { id: string; name: string; played: number; won: number; drawn: number; lost: number; for: number; against: number; diff: number; points: number };

export function leagueTable(teams: { id: string; name: string }[], results: Result[], win: number, draw: number): Row[] {
  const rows = new Map<string, Row>(
    teams.map((t) => [t.id, { id: t.id, name: t.name, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, diff: 0, points: 0 }]),
  );
  for (const m of results) {
    const h = rows.get(m.homeId);
    const a = rows.get(m.awayId);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.for += m.homeScore; h.against += m.awayScore;
    a.for += m.awayScore; a.against += m.homeScore;
    if (m.homeScore > m.awayScore) { h.won++; a.lost++; h.points += win; }
    else if (m.homeScore < m.awayScore) { a.won++; h.lost++; a.points += win; }
    else { h.drawn++; a.drawn++; h.points += draw; a.points += draw; }
  }
  for (const r of rows.values()) r.diff = r.for - r.against;
  return [...rows.values()].sort((x, y) => y.points - x.points || y.diff - x.diff || y.for - x.for || x.name.localeCompare(y.name));
}

/** Round-robin fixtures (circle method). Returns pairs of team indexes; `legs` 2 adds the return fixtures. */
export function roundRobin(n: number, legs: 1 | 2): [number, number][] {
  const ids = Array.from({ length: n }, (_, i) => i);
  if (n % 2 === 1) ids.push(-1); // a bye
  const m = ids.length;
  const out: [number, number][] = [];
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i];
      const b = ids[m - 1 - i];
      if (a !== -1 && b !== -1) out.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    ids.splice(1, 0, ids.pop()!);
  }
  if (legs === 2) out.push(...out.map(([a, b]) => [b, a] as [number, number]));
  return out;
}
