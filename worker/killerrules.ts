// Killer pool rules, kept apart from the database so they can be tested.

export type Rules = { mode?: "balls" | "turns"; killerRequired: boolean; ownLoses: boolean; scratchLoses: boolean; blackPays?: boolean };
export type P = { id: string; name: string; lives: number; killer: boolean; blacks?: number };
export type Action =
  | { type: "own"; shooterId: string }
  | { type: "pot"; shooterId: string; victimId: string }
  | { type: "scratch"; shooterId: string }
  | { type: "adjust"; playerId: string; delta: 1 | -1 }
  | { type: "hit" | "miss" | "black" | "skip"; shooterId: string };

/** What an action changes. `error` means nothing should change. */
export type Outcome =
  | { error: string }
  | { kind: Action["type"]; shooterId?: string; victimId?: string; livesPlayerId?: string; livesDelta?: number; killerPlayerId?: string; blackPlayerId?: string };

export const alive = (ps: P[]) => ps.filter((p) => p.lives > 0);
export const winner = (ps: P[]) => (ps.length >= 2 && alive(ps).length === 1 ? alive(ps)[0] : null);

export function decide(rules: Rules, ps: P[], a: Action): Outcome {
  const find = (id: string) => ps.find((p) => p.id === id);
  if (a.type === "adjust") {
    const p = find(a.playerId);
    if (!p) return { error: "That player isn't in this game" };
    if (a.delta < 0 && p.lives <= 0) return { error: `${p.name} is already out` };
    if (a.delta > 0 && p.lives >= 9) return { error: "A player can hold up to 9 lives" };
    return { kind: "adjust", livesPlayerId: p.id, livesDelta: a.delta };
  }
  const s = find(a.shooterId);
  if (!s) return { error: "That player isn't in this game" };
  if (winner(ps)) return { error: "The game is over. Start a new game from the setup section." };
  if (s.lives <= 0) return { error: `${s.name} is already out` };
  const turns = rules.mode === "turns";
  if (a.type === "hit" || a.type === "miss" || a.type === "black" || a.type === "skip") {
    if (!turns) return { error: "That action is for pub killer games" };
    if (a.type === "hit" || a.type === "skip") return { kind: a.type, shooterId: s.id };
    if (a.type === "miss") return { kind: "miss", shooterId: s.id, livesPlayerId: s.id, livesDelta: -1 };
    if (!rules.blackPays) return { error: "The black isn't special in this game" };
    return { kind: "black", shooterId: s.id, blackPlayerId: s.id };
  }
  if (turns) return { error: "That action is for own-ball killer games" };

  if (a.type === "own") {
    if (!s.killer) return { kind: "own", shooterId: s.id, killerPlayerId: s.id };
    if (rules.ownLoses) return { kind: "own", shooterId: s.id, livesPlayerId: s.id, livesDelta: -1 };
    return { error: `${s.name} is already a killer, so nothing changes` };
  }
  if (a.type === "scratch") {
    if (!rules.scratchLoses) return { error: "Scratches don't cost a life in this game" };
    return { kind: "scratch", shooterId: s.id, livesPlayerId: s.id, livesDelta: -1 };
  }
  if (a.type !== "pot") return { error: "Unknown action" };
  const v = find(a.victimId);
  if (!v) return { error: "That player isn't in this game" };
  if (v.id === s.id) return { error: "Use “potted their own ball” for that" };
  if (v.lives <= 0) return { error: `${v.name} is already out` };
  if (rules.killerRequired && !s.killer) return { error: `${s.name} isn't a killer yet. They need to pot their own ball first.` };
  return { kind: "pot", shooterId: s.id, victimId: v.id, livesPlayerId: v.id, livesDelta: -1 };
}

/** Ball numbers for the players: random unless the organiser chose some. Returns null if choices clash. */
export function assignBalls(count: number, chosen: (number | null)[], rand: (n: number) => number): number[] | null {
  const taken = new Set<number>();
  for (const c of chosen) {
    if (c === null) continue;
    if (taken.has(c)) return null;
    taken.add(c);
  }
  const free = Array.from({ length: 15 }, (_, i) => i + 1).filter((n) => !taken.has(n));
  for (let i = free.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [free[i], free[j]] = [free[j], free[i]];
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(chosen[i] ?? free.pop()!);
  return out;
}

/** Whose shot is next: the next player still in after whoever shot last, going round in order. */
export function nextTurn(ps: P[], lastShooterId: string | null): string | null {
  if (winner(ps) || alive(ps).length === 0) return null;
  const from = lastShooterId ? ps.findIndex((p) => p.id === lastShooterId) : -1;
  for (let k = 1; k <= ps.length; k++) {
    const p = ps[(from + k + ps.length) % ps.length];
    if (p.lives > 0) return p.id;
  }
  return null;
}
