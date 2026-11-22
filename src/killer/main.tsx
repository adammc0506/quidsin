import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./killer.css";
import { StrictMode, useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { adminLink, api, copy, gameLink, mine, normaliseRef, shareOrCopy, type Game, type GameEvent, type Player } from "./api";

// ---------- tiny hash router ----------

const useRoute = () => {
  const [hash, setHash] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1) || "/");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
};
const go = (path: string) => {
  location.hash = path;
  scrollTo(0, 0);
};

function Shell({ children, back }: { children: ReactNode; back?: string }) {
  return (
    <div className="shell">
      <header className="bar">
        {back ? (
          <a className="back" href={`#${back}`}>
            Back
          </a>
        ) : (
          <a className="brand" href="#/">
            Killer Pool
          </a>
        )}
        <a className="family" href="/">
          Tab &amp; Tally
        </a>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}

const Loading = () => <p className="muted pad">Loading…</p>;

function Problem({ msg }: { msg: string }) {
  return (
    <div className="card">
      <h1 className="h2">That didn't work</h1>
      <p>{msg}</p>
      <a className="btn" href="#/">
        Go to Killer Pool home
      </a>
    </div>
  );
}

// ---------- balls and lives ----------

const COLOURS = ["", "#f4c20d", "#1f4fbf", "#d62828", "#6a2c91", "#f07f1b", "#1b7a3d", "#7a1f2b", "#151515"];
function Ball({ n, small }: { n: number | null; small?: boolean }) {
  if (n === null)
    return (
      <span className={`ball hidden${small ? " sm" : ""}`} aria-label="Secret ball">
        <i>?</i>
      </span>
    );
  const c = COLOURS[n <= 8 ? n : n - 8];
  return (
    <span className={`ball${n > 8 ? " stripe" : ""}${small ? " sm" : ""}`} style={{ "--c": c } as CSSProperties} aria-label={`Ball ${n}`}>
      <i>{n}</i>
    </span>
  );
}

function Pips({ lives, start }: { lives: number; start: number }) {
  const total = Math.max(start, lives);
  return (
    <span className="pips" role="img" aria-label={`${lives} ${lives === 1 ? "life" : "lives"}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`pip${i < lives ? "" : " gone"}`} />
      ))}
    </span>
  );
}

function status(p: Player, g: Game) {
  const rules = g.rules;
  if (p.lives <= 0) return "Out";
  if (rules.mode === "turns") {
    const bits = [];
    if (g.finalistId === p.id) bits.push("Final shot");
    else if (g.turnId === p.id) bits.push("Up next");
    if (p.blacks > 0) bits.push("Covers the re-rack");
    return bits.join(" · ");
  }
  if (!rules.killerRequired) return "";
  return p.killer ? "Killer" : "Not a killer yet";
}

function Num({ n }: { n: number }) {
  return (
    <span className="ball hidden" aria-label={`Number ${n}`}>
      <i>{n}</i>
    </span>
  );
}

function Table({ g, keeper, openId, onPick }: { g: Game; keeper?: boolean; openId?: string | null; onPick?: (id: string) => void }) {
  const win = g.players.find((p) => p.id === g.winnerId);
  return (
    <section className="table" aria-label={g.name}>
      <div className="table-head">
        <h1>{g.name}</h1>
        <p>
          {g.players.filter((p) => p.lives > 0).length} of {g.players.length} still in, {g.startLives} {g.startLives === 1 ? "life" : "lives"} each
        </p>
      </div>
      {g.finalistId && (
        <div className="winner final" role="status">
          {g.players.find((p) => p.id === g.finalistId)?.name} is the last one standing. One pot wins it.
        </div>
      )}
      {win && (
        <div className="winner" role="status">
          {g.rules.mode === "balls" && <Ball n={win.ball} small />}
          {win.name} wins
        </div>
      )}
      <ul className="players">
        {g.players.map((p) => {
          const inner = (
            <>
              {g.rules.mode === "turns" ? <Num n={g.players.indexOf(p) + 1} /> : <Ball n={p.ball} />}
              <span className="pname">
                {p.name}
                {status(p, g) && <small>{status(p, g)}</small>}
              </span>
              <Pips lives={p.lives} start={g.startLives} />
            </>
          );
          return (
            <li key={p.id} className={`pl${p.lives <= 0 ? " out" : ""}${openId === p.id ? " open" : ""}${g.turnId === p.id ? " turn" : ""}`}>
              {keeper && !win ? (
                <button className="plbtn" onClick={() => onPick?.(p.id)} aria-expanded={openId === p.id}>
                  {inner}
                </button>
              ) : (
                <div className="plbtn">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function describe(e: GameEvent, g: Game): string {
  const n = (id: string | null) => g.players.find((p) => p.id === id)?.name ?? "Someone";
  switch (e.kind) {
    case "own":
      return e.killerPlayerId ? `${n(e.shooterId)} potted their own ball and is now a killer` : `${n(e.shooterId)} potted their own ball and lost a life`;
    case "pot":
      return `${n(e.shooterId)} potted ${n(e.victimId)}'s ball`;
    case "scratch":
      return `${n(e.shooterId)} scratched and lost a life`;
    case "hit":
      return `${n(e.shooterId)} potted a ball and stays safe`;
    case "miss":
      return `${n(e.shooterId)} missed and lost a life`;
    case "black":
      return `${n(e.shooterId)} potted the black and covers the next re-rack`;
    case "rollover":
      return `${n(e.shooterId)} missed the final shot. Everyone is back in with full lives`;
    case "skip":
      return `${n(e.shooterId)}'s turn was skipped`;
    default:
      return `${n(e.livesPlayerId)} ${e.livesDelta && e.livesDelta > 0 ? "was given a life" : "lost a life"}`;
  }
}

function History({ g }: { g: Game }) {
  if (g.recent.length === 0) return null;
  return (
    <section>
      <h2 className="h2">Latest</h2>
      <ul className="history">
        {g.recent.map((e) => (
          <li key={e.id}>
            <span>{describe(e, g)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- home ----------

function Home() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const saved = mine.all();
  const join = (e: FormEvent) => {
    e.preventDefault();
    const ref = normaliseRef(code);
    if (!ref) return setErr("That doesn't look like a code. It's on the invite, like KP-7KQ4-M9X2.");
    go(`/g/${ref}`);
  };
  return (
    <Shell>
      <section className="hero">
        <h1>Killer pool, without the scribbled lives</h1>
        <p className="lede">
          Pub killer for up to 20 players, or own-ball killer with numbered balls. Set the lives and house rules, and track who's still in. Everyone follows live on their own phone.
        </p>
        <button className="btn primary big" onClick={() => go("/new")}>
          Set up a game
        </button>
      </section>

      <form className="join" onSubmit={join}>
        <label htmlFor="code">Watching a game?</label>
        <div className="row-input">
          <input
            id="code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErr("");
            }}
            placeholder="KP-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button className="btn">Open</button>
        </div>
        {err && <p className="error">{err}</p>}
      </form>

      <section aria-labelledby="how">
        <h2 id="how" className="h2">
          How it works
        </h2>
        <ol className="steps">
          <li>
            <strong>Set up the game</strong>
            <span>Pick pub killer or own-ball killer, then the lives and house rules.</span>
          </li>
          <li>
            <strong>Referee taps what happens</strong>
            <span>Potted or missed. Lives and who's up next update by themselves.</span>
          </li>
          <li>
            <strong>Last player standing wins</strong>
            <span>Share the code so everyone can watch.</span>
          </li>
        </ol>
      </section>

      {saved.length > 0 && (
        <section>
          <h2 className="h2">Your games</h2>
          <ul className="list">
            {saved.map((s) => (
              <li key={s.ref}>
                <a href={s.admin ? `#/admin/${s.admin}` : `#/g/${s.ref}`}>
                  <strong>{s.name}</strong>
                  <span className="muted small">{s.admin ? "You're the referee" : "You're watching"}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="fine">
        Free, from <a href="/">Tab &amp; Tally</a>. Games are deleted after 30 days, or 3 months if you choose. <a href="/privacy/">Privacy</a>
      </p>
    </Shell>
  );
}

// ---------- set up ----------

type Row = { name: string; ball: string };

function Toggle({ on, set, title, hint }: { on: boolean; set: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>
        <strong>{title}</strong>
        <small className="muted">{hint}</small>
      </span>
    </label>
  );
}

function NewGame() {
  const [mode, setMode] = useState<"turns" | "balls">("turns");
  const [blackPays, setBlackPays] = useState(true);
  const [finalShot, setFinalShot] = useState(true);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { name: "", ball: "" },
    { name: "", ball: "" },
    { name: "", ball: "" },
  ]);
  const [lives, setLives] = useState(2);
  const [killerRequired, setKillerRequired] = useState(true);
  const [ownLoses, setOwnLoses] = useState(true);
  const [scratchLoses, setScratchLoses] = useState(true);
  const [secretBalls, setSecretBalls] = useState(false);
  const [long, setLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const named = rows.filter((r) => r.name.trim());
  const pub = mode === "turns";
  const maxPlayers = pub ? 20 : 15;
  const pickMode = (m: "turns" | "balls") => {
    if (m === mode) return;
    setMode(m);
    setLives(m === "turns" ? 2 : 3);
  };
  const taken = new Set(rows.map((r) => r.ball).filter(Boolean));

  const pasteNames = (i: number, text: string): boolean => {
    const names = text.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
    if (names.length < 2) return false;
    const next = rows.slice(0, i);
    names.slice(0, maxPlayers - i).forEach((n) => next.push({ name: n, ball: "" }));
    setRows([...next, ...rows.slice(i + names.length)].slice(0, maxPlayers));
    return true;
  };
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Give the game a name.");
    if (named.length < 2) return setErr("Add at least 2 players.");
    if (named.length > maxPlayers) return setErr(`This type of game holds up to ${maxPlayers} players.`);
    if (new Set(named.map((r) => r.name.trim().toLowerCase())).size !== named.length)
      return setErr("Two players have the same name. Add an initial to tell them apart.");
    setBusy(true);
    try {
      const r = await api.create({
        mode,
        blackPays,
        finalShot,
        name: name.trim(),
        players: named.map((x) => ({ name: x.name.trim(), ball: !pub && x.ball ? Number(x.ball) : undefined })),
        lives,
        killerRequired,
        ownLoses,
        scratchLoses,
        secretBalls,
        retentionDays: long ? 90 : 30,
      });
      mine.save({ ref: r.reference, name: name.trim(), admin: r.adminToken });
      go(`/admin/${r.adminToken}?new`);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  return (
    <Shell back="/">
      <form className="stack" onSubmit={submit}>
        <h1 className="plain">Set up a game</h1>
        <fieldset className="field">
          <legend>Type of game</legend>
          <div className="seg">
            <label className={pub ? "on" : ""}>
              <input type="radio" name="mode" checked={pub} onChange={() => pickMode("turns")} />
              Pub killer
            </label>
            <label className={!pub ? "on" : ""}>
              <input type="radio" name="mode" checked={!pub} onChange={() => pickMode("balls")} />
              Own-ball killer
            </label>
          </div>
          <small className="muted">
            {pub
              ? "Take turns in order, up to 20 players. Pot any ball to stay safe, miss and lose a life."
              : "Everyone has a numbered ball, up to 15 players. Pot your own to become a killer, then pot theirs to take lives."}
          </small>
        </fieldset>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday killer" maxLength={60} />
        </label>

        <fieldset className="field">
          <legend>{pub ? "Players, in playing order" : "Players and balls"}</legend>
          {rows.map((r, i) => (
            <div className={pub ? undefined : "pickrow"} key={i}>
              <input value={r.name} aria-label={`Player ${i + 1}`} placeholder={`Player ${i + 1}`} maxLength={40} onChange={(e) => setRow(i, { name: e.target.value })} onPaste={(e) => { if (pasteNames(i, e.clipboardData.getData("text"))) e.preventDefault(); }} />
              {!pub && (
              <select value={r.ball} aria-label={`Ball for player ${i + 1}`} onChange={(e) => setRow(i, { ball: e.target.value })}>
                <option value="">Random</option>
                {Array.from({ length: 15 }, (_, k) => k + 1).map((n) => (
                  <option key={n} value={String(n)} disabled={taken.has(String(n)) && r.ball !== String(n)}>
                    Ball {n}
                  </option>
                ))}
              </select>
              )}
            </div>
          ))}
          <button type="button" className="link" onClick={() => setRows([...rows, { name: "", ball: "" }])} disabled={rows.length >= maxPlayers}>
            Add another player
          </button>
          {!pub && <small className="muted">Leave a ball on Random and we'll deal it out.</small>}
          <small className="muted">Tip: paste a list of names, one per line, into the first box.</small>
        </fieldset>

        <fieldset className="field">
          <legend>Lives each</legend>
          <div className="stepper">
            <button type="button" onClick={() => setLives(Math.max(1, lives - 1))} aria-label="Fewer lives">
              −
            </button>
            <output aria-live="polite">{lives}</output>
            <button type="button" onClick={() => setLives(Math.min(9, lives + 1))} aria-label="More lives">
              +
            </button>
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>House rules</legend>
          {pub ? (
            <>
            <Toggle
              on={finalShot}
              set={setFinalShot}
              title="Final shot to win"
              hint={finalShot ? "The last player standing must pot a ball to win. If they miss, everyone is back in with full lives." : "Off: the last player standing wins straight away."}
            />
            <Toggle
              on={blackPays}
              set={setBlackPays}
              title="Black covers the next re-rack"
              hint={blackPays ? "Whoever pots the black, at any point, pays for the next re-rack. It doesn't cost a life." : "Off: the black is just another ball."}
            />
            </>
          ) : (
            <>
          <Toggle
            on={killerRequired}
            set={setKillerRequired}
            title="Become a killer first"
            hint={killerRequired ? "A player must pot their own ball before they can take lives." : "Off: anyone can take lives from the start."}
          />
          <Toggle
            on={ownLoses}
            set={setOwnLoses}
            title="Own ball costs a life"
            hint={ownLoses ? "A killer who pots their own ball again loses a life." : "Off: potting your own ball again does nothing."}
          />
          <Toggle
            on={scratchLoses}
            set={setScratchLoses}
            title="Scratch costs a life"
            hint={scratchLoses ? "Potting the white loses a life." : "Off: scratches are free."}
          />
          <Toggle
            on={secretBalls}
            set={setSecretBalls}
            title="Keep ball numbers secret"
            hint={secretBalls ? "Watchers see who's who only once a player is out. The referee always sees them." : "Off: everyone can see every ball number."}
          />
            </>
          )}
        </fieldset>

        <Toggle on={long} set={setLong} title="Keep for 3 months" hint={`Deleted after ${long ? "3 months" : "30 days"}, with everything in it.`} />

        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Setting up…" : "Start the game"}
        </button>
      </form>
    </Shell>
  );
}

// ---------- watching ----------

function Watch({ refCode }: { refCode: string }) {
  const [g, setG] = useState<Game | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.game(refCode).then(setG, (e) => setErr(e.message)), [refCode]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 6000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (g) mine.save({ ref: g.reference, name: g.name });
  }, [g?.reference]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!g) return <Shell back="/"><Loading /></Shell>;
  return (
    <Shell back="/">
      <div className="stack">
        <Table g={g} />
        <p className="muted small live">Updates by itself while you have this page open.</p>
        <History g={g} />
      </div>
    </Shell>
  );
}

// ---------- the referee ----------

function Referee({ token, fresh }: { token: string; fresh: boolean }) {
  const [g, setG] = useState<Game | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"" | "again" | "reshuffle">("");
  const load = useCallback(() => api.admin(token).then(setG, (e) => setErr(e.message)), [token]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (g) mine.save({ ref: g.reference, name: g.name, admin: token });
  }, [g?.reference, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!g) return <Shell back="/"><Loading /></Shell>;

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 3500);
  };
  const run = async (fn: () => Promise<Game>, close = false) => {
    try {
      setG(await fn());
      if (close) setOpenId(null);
    } catch (x) {
      flash((x as Error).message);
    }
  };
  const pub = g.rules.mode === "turns";
  const open = g.players.find((p) => p.id === openId);
  const shooter = pub ? (open ?? g.players.find((p) => p.id === g.turnId)) : open;
  const others = open ? g.players.filter((p) => p.id !== open.id) : [];

  return (
    <Shell back="/">
      <div className="stack">
        <Table g={g} keeper openId={openId} onPick={(id) => setOpenId(openId === id ? null : id)} />

        {pub && shooter && !g.winnerId && (
          <section className="card add" aria-label={`${shooter.name}'s shot`}>
            <h2 className="h2">{g.finalistId ? `${shooter.name}'s final shot` : shooter.id === g.turnId ? `${shooter.name}'s shot` : `${shooter.name} (out of turn)`}</h2>
            <div className="shot">
              <button className="btn primary" onClick={() => run(() => api.act(token, { type: "hit", shooterId: shooter.id }), true)}>
                {g.finalistId ? "Potted a ball, wins" : "Potted a ball"}
              </button>
              <button className="btn miss" onClick={() => run(() => api.act(token, { type: "miss", shooterId: shooter.id }), true)}>
                {g.finalistId ? "Missed, everyone back in" : "Missed, lose a life"}
              </button>
            </div>
            <div className="actions">
              {g.rules.blackPays && (
                <button className="btn" onClick={() => run(() => api.act(token, { type: "black", shooterId: shooter.id }), true)}>
                  {g.finalistId ? "Potted the black, wins" : "Potted the black"}
                </button>
              )}
              {!g.finalistId && (
                <button className="btn" onClick={() => run(() => api.act(token, { type: "skip", shooterId: shooter.id }), true)}>
                  Skip turn
                </button>
              )}
            </div>
            <p className="sub-h">Fix lives by hand</p>
            <div className="actions">
              <button className="btn" onClick={() => run(() => api.act(token, { type: "adjust", playerId: shooter.id, delta: -1 }))}>
                Take a life
              </button>
              <button className="btn" onClick={() => run(() => api.act(token, { type: "adjust", playerId: shooter.id, delta: 1 }))}>
                Give a life
              </button>
            </div>
          </section>
        )}
        {pub && g.rules.blackPays && g.players.some((p) => p.blacks > 0) && (
          <section className="card payers">
            <h2 className="h2">Covers the next re-rack</h2>
            <p>{g.players.filter((p) => p.blacks > 0).map((p) => p.name).join(", ")}</p>
            <button className="btn" onClick={() => run(() => api.act(token, { type: "rerack" }))}>
              Re-rack paid
            </button>
          </section>
        )}
        {!pub && open && !g.winnerId && (
          <section className="card add" aria-label={`What did ${open.name} do?`}>
            <h2 className="h2">{open.name}</h2>
            <p className="sub-h">Potted someone's ball</p>
            <div className="who">
              {others.map((p) => (
                <button key={p.id} className="whobtn" disabled={p.lives <= 0} onClick={() => run(() => api.act(token, { type: "pot", shooterId: open.id, victimId: p.id }), true)}>
                  <Ball n={p.ball} small />
                  {p.name}
                </button>
              ))}
            </div>
            <p className="sub-h">Something else</p>
            <div className="actions">
              <button className="btn" onClick={() => run(() => api.act(token, { type: "own", shooterId: open.id }), true)}>
                Potted their own ball
              </button>
              {g.rules.scratchLoses && (
                <button className="btn" onClick={() => run(() => api.act(token, { type: "scratch", shooterId: open.id }), true)}>
                  Scratched
                </button>
              )}
            </div>
            <p className="sub-h">Fix lives by hand</p>
            <div className="actions">
              <button className="btn" onClick={() => run(() => api.act(token, { type: "adjust", playerId: open.id, delta: -1 }))}>
                Take a life
              </button>
              <button className="btn" onClick={() => run(() => api.act(token, { type: "adjust", playerId: open.id, delta: 1 }))}>
                Give a life
              </button>
            </div>
          </section>
        )}
        {!g.winnerId && !g.finalistId && (
          <p className="muted small">{pub ? "The highlighted player is up next. Tap someone else if they shoot out of turn." : "Tap the player who took the shot."}</p>
        )}
        {note && <p className="toast" role="status">{note}</p>}

        {g.recent.length > 0 && (
          <button className="btn" onClick={() => run(() => api.undo(token))}>
            Undo last change
          </button>
        )}

        {fresh && (
          <div className="card warn">
            <strong>Save this page.</strong>
            <p>This is your referee link. It's the only way to record shots from another phone. Don't share it.</p>
            <button className="btn" onClick={async () => flash((await copy(adminLink(token))) === "copied" ? "Referee link copied" : "Couldn't copy")}>
              Copy referee link
            </button>
          </div>
        )}

        <div className="card invite">
          <p>Let everyone follow the game on their own phone.</p>
          <p className="ref">{g.reference}</p>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await shareOrCopy(g.name, `Follow ${g.name}:`, gameLink(g.reference));
              if (r === "copied") flash("Invite copied");
            }}
          >
            Share the game
          </button>
        </div>

        <History g={g} />

        <section className="card quiet-card">
          <h2 className="h2">Play again</h2>
          <p className="muted small">Everyone goes back to {g.startLives} {g.startLives === 1 ? "life" : "lives"}. Same players and rules.</p>
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                if (confirm !== "again") return setConfirm("again");
                setConfirm("");
                run(() => api.restart(token, false), true);
              }}
            >
              {confirm === "again" ? "Tap again to restart" : pub ? "Start again" : "Same balls"}
            </button>
            {!pub && <button
              className="btn"
              onClick={() => {
                if (confirm !== "reshuffle") return setConfirm("reshuffle");
                setConfirm("");
                run(() => api.restart(token, true), true);
              }}
            >
              {confirm === "reshuffle" ? "Tap again to reshuffle" : "Deal new balls"}
            </button>}
          </div>
        </section>

        <p className="muted small">
          Deletes on {new Date(g.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.{" "}
          {g.canExtend && (
            <button
              className="link"
              onClick={async () => {
                try {
                  await api.extend(token);
                  flash("Kept for another month");
                  load();
                } catch (x) {
                  flash((x as Error).message);
                }
              }}
            >
              Keep another month
            </button>
          )}
        </p>
      </div>
    </Shell>
  );
}

// ---------- app ----------

function App() {
  const route = useRoute();
  const [path, query] = route.split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "new") return <NewGame />;
  if (parts[0] === "admin" && parts[1]) return <Referee key={parts[1]} token={parts[1]} fresh={query === "new"} />;
  if (parts[0] === "g" && parts[1]) {
    const ref = normaliseRef(parts[1]);
    if (ref) return <Watch key={ref} refCode={ref} />;
  }
  return <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
