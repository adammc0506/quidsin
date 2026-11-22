import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./tally.css";
import { StrictMode, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { adminLink, api, boardLink, copy, mine, normaliseRef, shareOrCopy, type Board } from "./api";

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
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

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
            Tally
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
        Go to Tally home
      </a>
    </div>
  );
}

/** Players ranked by score. Ties share a rank. */
function ranked(b: Board) {
  const sorted = [...b.players].sort((a, c) => (b.lowerWins ? a.total - c.total : c.total - a.total) || a.name.localeCompare(c.name));
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((p, i) => {
    if (p.total !== prev) rank = i + 1;
    prev = p.total;
    return { ...p, rank };
  });
}

/** The scoreboard: slate with chalk numerals. Leaders get a gold underline. */
function Scoreboard({ b, keeper, onPick, openId }: { b: Board; keeper?: boolean; onPick?: (id: string) => void; openId?: string | null }) {
  const rows = ranked(b);
  const anyScore = b.recent.length > 0;
  return (
    <section className="board" aria-label={`${b.name} scores`}>
      <div className="board-head">
        <h1>{b.name}</h1>
        <p>{b.lowerWins ? "Lowest score leads" : "Highest score leads"}</p>
      </div>
      <ol className="rows">
        {rows.map((p) => (
          <li key={p.id} className={`row${anyScore && p.rank === 1 ? " lead" : ""}${openId === p.id ? " open" : ""}`}>
            {keeper ? (
              <button className="rowbtn" onClick={() => onPick?.(p.id)} aria-expanded={openId === p.id}>
                <span className="rank">{anyScore ? p.rank : "–"}</span>
                <span className="pname">{p.name}</span>
                <span className="score">{p.total}</span>
              </button>
            ) : (
              <div className="rowbtn">
                <span className="rank">{anyScore ? p.rank : "–"}</span>
                <span className="pname">{p.name}</span>
                <span className="score">{p.total}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function History({ b }: { b: Board }) {
  if (b.recent.length === 0) return null;
  const name = (id: string) => b.players.find((p) => p.id === id)?.name ?? "Someone";
  return (
    <section>
      <h2 className="h2">Latest</h2>
      <ul className="history">
        {b.recent.map((e) => (
          <li key={e.id}>
            <span>{name(e.playerId)}</span>
            <span className={`pts${e.points < 0 ? " neg" : ""}`}>{signed(e.points)}</span>
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
    if (!ref) return setErr("That doesn't look like a code. It's on the invite, like TL-7KQ4-M9X2.");
    go(`/b/${ref}`);
  };
  return (
    <Shell>
      <section className="hero">
        <h1>Keep score without the arguments</h1>
        <p className="lede">
          One person keeps the score. Everyone else watches the leaderboard update on their own phone. Good for game nights,
          pool, darts, leagues and quizzes.
        </p>
        <button className="btn primary big" onClick={() => go("/new")}>
          Start a scoreboard
        </button>
      </section>

      <form className="join" onSubmit={join}>
        <label htmlFor="code">Watching someone else's game?</label>
        <div className="row-input">
          <input
            id="code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErr("");
            }}
            placeholder="TL-XXXX-XXXX"
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
            <strong>Add the players</strong>
            <span>Pick whether the highest or lowest score wins.</span>
          </li>
          <li>
            <strong>Tap a name to add points</strong>
            <span>Mistake? Undo the last score.</span>
          </li>
          <li>
            <strong>Share the code</strong>
            <span>Everyone else sees the scores live. Only you can change them.</span>
          </li>
        </ol>
      </section>

      {saved.length > 0 && (
        <section>
          <h2 className="h2">Your scoreboards</h2>
          <ul className="list">
            {saved.map((s) => (
              <li key={s.ref}>
                <a href={s.admin ? `#/admin/${s.admin}` : `#/b/${s.ref}`}>
                  <strong>{s.name}</strong>
                  <span className="muted small">{s.admin ? "You're keeping score" : "You're watching"}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="fine">
        Free, from <a href="/">Tab &amp; Tally</a>. Scoreboards are deleted after 30 days, or 3 months if you choose.{" "}
        <a href="/privacy/">Privacy</a>
      </p>
    </Shell>
  );
}

// ---------- start one ----------

function NewBoard() {
  const [name, setName] = useState("");
  const [players, setPlayers] = useState(["", ""]);
  const [lowerWins, setLowerWins] = useState(false);
  const [long, setLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clean = players.map((p) => p.trim()).filter(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Give the scoreboard a name.");
    if (clean.length < 1) return setErr("Add at least one player.");
    if (new Set(clean.map((p) => p.toLowerCase())).size !== clean.length)
      return setErr("Two players have the same name. Add an initial to tell them apart.");
    setBusy(true);
    try {
      const r = await api.create({ name: name.trim(), players: clean, lowerWins, retentionDays: long ? 90 : 30 });
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
        <h1 className="plain">New scoreboard</h1>
        <label className="field">
          <span>What's the game?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday pool league" maxLength={60} />
        </label>

        <fieldset className="field">
          <legend>Players</legend>
          {players.map((p, i) => (
            <input
              key={i}
              value={p}
              aria-label={`Player ${i + 1}`}
              placeholder={`Player ${i + 1}`}
              maxLength={40}
              onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          <button type="button" className="link" onClick={() => setPlayers([...players, ""])} disabled={players.length >= 20}>
            Add another player
          </button>
        </fieldset>

        <fieldset className="field">
          <legend>Who wins?</legend>
          <div className="seg">
            <label className={!lowerWins ? "on" : ""}>
              <input type="radio" name="dir" checked={!lowerWins} onChange={() => setLowerWins(false)} />
              Highest score
            </label>
            <label className={lowerWins ? "on" : ""}>
              <input type="radio" name="dir" checked={lowerWins} onChange={() => setLowerWins(true)} />
              Lowest score
            </label>
          </div>
          <small className="muted">{lowerWins ? "Like golf: fewest points leads." : "Like most games: most points leads."}</small>
        </fieldset>

        <label className="check">
          <input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} />
          <span>
            <strong>Keep for 3 months</strong>
            <small className="muted">Deleted after {long ? "3 months" : "30 days"}, with everything in it.</small>
          </span>
        </label>

        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Creating…" : "Start the scoreboard"}
        </button>
      </form>
    </Shell>
  );
}

// ---------- watching ----------

function Watch({ refCode }: { refCode: string }) {
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.board(refCode).then(setB, (e) => setErr(e.message)), [refCode]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (b) mine.save({ ref: b.reference, name: b.name });
  }, [b?.reference]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!b) return <Shell back="/"><Loading /></Shell>;
  return (
    <Shell back="/">
      <div className="stack">
        <Scoreboard b={b} />
        <p className="muted small live">Updates by itself while you have this page open.</p>
        <History b={b} />
      </div>
    </Shell>
  );
}

// ---------- the scorekeeper ----------

const QUICK = [-10, -5, -1, 1, 5, 10];

function Keeper({ token, fresh }: { token: string; fresh: boolean }) {
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const load = useCallback(() => api.admin(token).then(setB, (e) => setErr(e.message)), [token]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (b) mine.save({ ref: b.reference, name: b.name, admin: token });
  }, [b?.reference, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!b) return <Shell back="/"><Loading /></Shell>;

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 2500);
  };
  const run = async (fn: () => Promise<Board>) => {
    try {
      setB(await fn());
    } catch (x) {
      flash((x as Error).message);
      load();
    }
  };
  const add = (playerId: string, points: number) => {
    // Show the change straight away, then let the server's answer replace it.
    setB({
      ...b,
      players: b.players.map((p) => (p.id === playerId ? { ...p, total: p.total + points } : p)),
      recent: [{ id: `tmp${Date.now()}`, playerId, points, createdAt: new Date().toISOString() }, ...b.recent],
    });
    run(() => api.score(token, playerId, points));
  };
  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(custom.trim().replace(/^\+/, ""));
    if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 100000) return flash("Enter a whole number, like 7 or -3.");
    add(openId!, n);
    setCustom("");
  };
  const addPlayer = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await run(() => api.addPlayer(token, newName.trim()));
    setNewName("");
  };

  const open = b.players.find((p) => p.id === openId);

  return (
    <Shell back="/">
      <div className="stack">
        <Scoreboard b={b} keeper onPick={(id) => setOpenId(openId === id ? null : id)} openId={openId} />

        {open && (
          <section className="card add" aria-label={`Add points for ${open.name}`}>
            <h2 className="h2">{open.name}</h2>
            <div className="chips">
              {QUICK.map((n) => (
                <button key={n} className={`chip${n < 0 ? " neg" : ""}`} onClick={() => add(open.id, n)}>
                  {signed(n)}
                </button>
              ))}
            </div>
            <form className="custom" onSubmit={addCustom}>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                inputMode="numeric"
                placeholder="Other, like 7 or -3"
                aria-label="Other points"
              />
              <button className="btn">Add</button>
            </form>
          </section>
        )}
        {!open && b.players.length > 0 && <p className="muted small">Tap a name to add or take off points.</p>}
        {note && <p className="toast" role="status">{note}</p>}

        {b.recent.length > 0 && (
          <button className="btn" onClick={() => run(() => api.undo(token))}>
            Undo last score
          </button>
        )}

        {fresh && (
          <div className="card warn">
            <strong>Save this page.</strong>
            <p>This is your scorekeeper link. It's the only way to change scores from another phone. Don't share it.</p>
            <button className="btn" onClick={async () => flash((await copy(adminLink(token))) === "copied" ? "Scorekeeper link copied" : "Couldn't copy")}>
              Copy scorekeeper link
            </button>
          </div>
        )}

        <div className="card invite">
          <p>Let everyone watch the scores on their own phone.</p>
          <p className="ref">{b.reference}</p>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await shareOrCopy(b.name, `Watch the scores for ${b.name}:`, boardLink(b.reference));
              if (r === "copied") flash("Invite copied");
            }}
          >
            Share the scoreboard
          </button>
        </div>

        <History b={b} />

        <section className="card quiet-card">
          <h2 className="h2">Players</h2>
          <ul className="people">
            {b.players.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <button
                  className={`link small ${removing === p.id ? "danger" : "quiet"}`}
                  aria-label={`Remove ${p.name}`}
                  onClick={() => {
                    if (removing !== p.id) return setRemoving(p.id);
                    setRemoving(null);
                    if (openId === p.id) setOpenId(null);
                    run(() => api.removePlayer(token, p.id));
                  }}
                >
                  {removing === p.id ? "Tap again to remove" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
          <form className="custom" onSubmit={addPlayer}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a player" maxLength={40} aria-label="New player name" />
            <button className="btn">Add</button>
          </form>
          <button
            className={`link small ${resetting ? "danger" : "quiet"}`}
            onClick={() => {
              if (!resetting) return setResetting(true);
              setResetting(false);
              setOpenId(null);
              run(() => api.reset(token));
            }}
          >
            {resetting ? "Tap again to set everyone back to 0" : "Start a new round (set everyone to 0)"}
          </button>
        </section>

        <p className="muted small">
          Deletes on {new Date(b.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.{" "}
          {b.canExtend && (
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
  if (parts[0] === "new") return <NewBoard />;
  if (parts[0] === "admin" && parts[1]) return <Keeper key={parts[1]} token={parts[1]} fresh={query === "new"} />;
  if (parts[0] === "b" && parts[1]) {
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
