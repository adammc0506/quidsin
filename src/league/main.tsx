import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./league.css";
import { StrictMode, useCallback, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { QrToggle, FundPromo } from "../lib/Qr";
import { KeepTick, Loading, NameList, Problem, Shell, ToolHome, go, niceDate, useFlash, useLoad, useRoute } from "../lib/kit";
import { adminLink, api, copy, leagueLink, mine, normaliseRef, shareOrCopy, type League, type Match } from "./api";

const NAME = "League";
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function Home() {
  return (
    <ToolHome
      name={NAME}
      title="A league table that keeps itself"
      lede="Enter the results and the table works itself out. For pool, darts, quizzes or five-a-side, with fixtures made for you if you want them."
      start="Start a league"
      placeholder="LG-XXXX-XXXX"
      normalise={normaliseRef}
      watchRoute="l"
      joinLabel="Following someone's league?"
      steps={[
        ["Add the teams or players", "Choose points for a win and a draw."],
        ["Make the fixtures", "Everyone plays everyone once, or home and away."],
        ["Enter results as they happen", "The table updates for everyone watching."],
      ]}
      yours="Your leagues"
      adminLabel="You're running it"
      saved={mine.all()}
      fund="Running a league for a club?"
      fine="Leagues are deleted after 30 days, or 3 months if you choose. For a longer season, use Keep another month."
    />
  );
}

function NewLeague() {
  const [name, setName] = useState("");
  const [teams, setTeams] = useState(["", "", "", ""]);
  const [win, setWin] = useState(3);
  const [draw, setDraw] = useState(1);
  const [long, setLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clean = teams.map((t) => t.trim()).filter(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Give the league a name.");
    if (clean.length < 2) return setErr("Add at least two teams or players.");
    if (new Set(clean.map((t) => t.toLowerCase())).size !== clean.length) return setErr("Two teams have the same name.");
    setBusy(true);
    try {
      const r = await api.create({ name: name.trim(), teams: clean, winPoints: win, drawPoints: draw, retentionDays: long ? 90 : 30 });
      mine.save({ ref: r.reference, name: name.trim(), admin: r.adminToken });
      go(`/admin/${r.adminToken}?new`);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  return (
    <Shell name={NAME} back="/">
      <form className="stack" onSubmit={submit}>
        <h1 className="plain">New league</h1>
        <label className="field">
          <span>What's it called?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuesday pool league" maxLength={60} />
        </label>
        <NameList legend="Teams or players" noun="Team" values={teams} set={setTeams} max={20} min={2} />
        <div className="pair">
          <label className="field">
            <span>Points for a win</span>
            <input type="number" inputMode="numeric" min={0} max={20} value={win} onChange={(e) => setWin(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Points for a draw</span>
            <input type="number" inputMode="numeric" min={0} max={20} value={draw} onChange={(e) => setDraw(Number(e.target.value))} />
          </label>
        </div>
        <KeepTick long={long} setLong={setLong} what="The league is" />
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Creating…" : "Start the league"}
        </button>
      </form>
    </Shell>
  );
}

function Table({ l }: { l: League }) {
  const any = l.table.some((r) => r.played > 0);
  return (
    <section className="lg" aria-label={`${l.name} table`}>
      <header className="lg-head">
        <h1>{l.name}</h1>
        <p>
          {l.winPoints} for a win, {l.drawPoints} for a draw
        </p>
      </header>
      <div className="scroll">
        <table className="lt">
          <thead>
            <tr>
              <th scope="col" className="pos">#</th>
              <th scope="col" className="tm">Team</th>
              <th scope="col" title="Played">P</th>
              <th scope="col" title="Won">W</th>
              <th scope="col" title="Drawn">D</th>
              <th scope="col" title="Lost">L</th>
              <th scope="col" title="Goal or frame difference">+/−</th>
              <th scope="col" title="Points">Pts</th>
            </tr>
          </thead>
          <tbody>
            {l.table.map((r, i) => (
              <tr key={r.id} className={any && i === 0 ? "lead" : ""}>
                <td className="pos">{i + 1}</td>
                <th scope="row" className="tm">{r.name}</th>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td>{signed(r.diff)}</td>
                <td className="pts">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Fixtures({ l, edit }: { l: League; edit?: (m: Match) => void }) {
  const name = new Map(l.teams.map((t) => [t.id, t.name]));
  const upcoming = l.matches.filter((m) => m.homeScore === null);
  const played = l.matches.filter((m) => m.homeScore !== null).reverse();
  const Row = ({ m }: { m: Match }) => {
    const inner = (
      <>
        <span className="side">{name.get(m.homeId)}</span>
        <span className="mid">{m.homeScore === null ? "v" : `${m.homeScore} – ${m.awayScore}`}</span>
        <span className="side r">{name.get(m.awayId)}</span>
      </>
    );
    return <li>{edit ? <button className="fx" onClick={() => edit(m)}>{inner}</button> : <div className="fx">{inner}</div>}</li>;
  };
  return (
    <>
      {upcoming.length > 0 && (
        <section className="card fxcard">
          <h2 className="h2">To play ({upcoming.length})</h2>
          <ul>{upcoming.map((m) => <Row key={m.id} m={m} />)}</ul>
        </section>
      )}
      {played.length > 0 && (
        <section className="card fxcard">
          <h2 className="h2">Results</h2>
          <ul>{played.map((m) => <Row key={m.id} m={m} />)}</ul>
        </section>
      )}
    </>
  );
}

function Watch({ refCode }: { refCode: string }) {
  const fetcher = useCallback(() => api.get(refCode), [refCode]);
  const { data: l, err } = useLoad(fetcher, 10000);
  useEffect(() => {
    if (l) mine.save({ ref: l.reference, name: l.name });
  }, [l?.reference]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Shell name={NAME} back="/"><Problem name={NAME} msg={err} /></Shell>;
  if (!l) return <Shell name={NAME} back="/"><Loading /></Shell>;
  return (
    <Shell name={NAME} back="/">
      <div className="stack">
        <Table l={l} />
        <p className="muted small live">Updates by itself while you have this page open.</p>
        <Fixtures l={l} />
      </div>
    </Shell>
  );
}

const toScore = (s: string) => (/^\d{1,3}$/.test(s.trim()) ? Number(s) : null);

function Organiser({ token, fresh }: { token: string; fresh: boolean }) {
  const fetcher = useCallback(() => api.admin(token), [token]);
  const { data: l, setData, err, load } = useLoad(fetcher);
  const { note, flash } = useFlash();
  const [open, setOpen] = useState<Match | null>(null);
  const [hs, setHs] = useState("");
  const [as, setAs] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    if (l) mine.save({ ref: l.reference, name: l.name, admin: token });
  }, [l?.reference, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Shell name={NAME} back="/"><Problem name={NAME} msg={err} /></Shell>;
  if (!l) return <Shell name={NAME} back="/"><Loading /></Shell>;

  const run = async (fn: () => Promise<League>) => {
    try {
      setData(await fn());
      return true;
    } catch (x) {
      flash((x as Error).message);
      load();
      return false;
    }
  };
  const name = new Map(l.teams.map((t) => [t.id, t.name]));
  const pick = (m: Match) => {
    setOpen(m);
    setHs(m.homeScore === null ? "" : String(m.homeScore));
    setAs(m.awayScore === null ? "" : String(m.awayScore));
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const a = toScore(hs);
    const b = toScore(as);
    if (a === null || b === null || !open) return flash("Enter both scores as whole numbers.");
    if (await run(() => api.setResult(token, open.id, a, b))) setOpen(null);
  };
  const addResult = async (e: FormEvent) => {
    e.preventDefault();
    const a = toScore(hs);
    const b = toScore(as);
    if (!home || !away || home === away) return flash("Choose two different teams.");
    if (a === null || b === null) return flash("Enter both scores as whole numbers.");
    if (await run(() => api.addMatch(token, home, away, a, b))) {
      setHs("");
      setAs("");
    }
  };
  const empty = l.matches.length === 0;

  return (
    <Shell name={NAME} back="/">
      <div className="stack">
        <Table l={l} />
        {note && <p className="toast" role="status">{note}</p>}

        {empty && (
          <section className="card">
            <h2 className="h2">Make the fixtures</h2>
            <p className="muted small">Everyone plays everyone. You can still add one-off results afterwards.</p>
            <div className="rowbtns">
              <button className="btn primary" onClick={() => run(() => api.fixtures(token, 1))}>Play each other once</button>
              <button className="btn" onClick={() => run(() => api.fixtures(token, 2))}>Home and away</button>
            </div>
          </section>
        )}

        {open ? (
          <form className="card entry-card" onSubmit={save} aria-label="Enter result">
            <h2 className="h2">Enter the result</h2>
            <div className="score-in">
              <label>
                <span>{name.get(open.homeId)}</span>
                <input value={hs} onChange={(e) => setHs(e.target.value)} inputMode="numeric" autoFocus />
              </label>
              <label>
                <span>{name.get(open.awayId)}</span>
                <input value={as} onChange={(e) => setAs(e.target.value)} inputMode="numeric" />
              </label>
            </div>
            <div className="rowbtns">
              <button className="btn primary">Save result</button>
              <button type="button" className="link" onClick={() => setOpen(null)}>Cancel</button>
              {open.homeScore !== null && (
                <button type="button" className="link quiet small" onClick={async () => (await run(() => api.setResult(token, open.id, null, null))) && setOpen(null)}>
                  Clear this result
                </button>
              )}
              <button
                type="button"
                className={`link small ${confirm === open.id ? "danger" : "quiet"}`}
                onClick={async () => {
                  if (confirm !== open.id) return setConfirm(open.id);
                  setConfirm(null);
                  if (await run(() => api.deleteMatch(token, open.id))) setOpen(null);
                }}
              >
                {confirm === open.id ? "Tap again to delete this match" : "Delete this match"}
              </button>
            </div>
          </form>
        ) : (
          !empty && <p className="muted small">Tap a match to enter or change its result.</p>
        )}

        <Fixtures l={l} edit={pick} />

        <form className="card" onSubmit={addResult}>
          <h2 className="h2">Add a result</h2>
          <p className="muted small">For a match that isn't in the fixtures.</p>
          <div className="score-in">
            <label>
              <span>Home</span>
              <select value={home} onChange={(e) => setHome(e.target.value)}>
                <option value="">Choose…</option>
                {l.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input value={hs} onChange={(e) => setHs(e.target.value)} inputMode="numeric" placeholder="Score" aria-label="Home score" />
            </label>
            <label>
              <span>Away</span>
              <select value={away} onChange={(e) => setAway(e.target.value)}>
                <option value="">Choose…</option>
                {l.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input value={as} onChange={(e) => setAs(e.target.value)} inputMode="numeric" placeholder="Score" aria-label="Away score" />
            </label>
          </div>
          <button className="btn">Add result</button>
        </form>

        {fresh && (
          <div className="card warn">
            <strong>Save this page.</strong>
            <p>This is your organiser link. It's the only way to enter results from another phone. Don't share it.</p>
            <button className="btn" onClick={async () => flash((await copy(adminLink(token))) === "copied" ? "Organiser link copied" : "Couldn't copy")}>
              Copy organiser link
            </button>
          </div>
        )}

        <div className="card invite">
          <p>Let everyone follow the table on their own phone.</p>
          <p className="ref">{l.reference}</p>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await shareOrCopy(l.name, `Follow the table for ${l.name}:`, leagueLink(l.reference));
              if (r === "copied") flash("Invite copied");
            }}
          >
            Share the table
          </button>
          <QrToggle url={leagueLink(l.reference)} />
        </div>

        <section className="card quiet-card">
          <h2 className="h2">Teams</h2>
          <ul className="people">
            {l.teams.map((t) => (
              <li key={t.id}>
                <span>{t.name}</span>
                <button
                  className={`link small ${confirm === t.id ? "danger" : "quiet"}`}
                  aria-label={`Remove ${t.name}`}
                  onClick={() => {
                    if (confirm !== t.id) return setConfirm(t.id);
                    setConfirm(null);
                    run(() => api.removeTeam(token, t.id));
                  }}
                >
                  {confirm === t.id ? "Tap again to remove it and its matches" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="custom"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newTeam.trim()) return;
              if (await run(() => api.addTeam(token, newTeam.trim()))) setNewTeam("");
            }}
          >
            <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Add a team" maxLength={40} aria-label="New team name" />
            <button className="btn">Add</button>
          </form>
          {!empty && <p className="muted small">New teams don't get fixtures automatically. Add their results above.</p>}
        </section>

        <FundPromo line="Running a league for a club or team?" />
        <p className="muted small">
          Deletes on {niceDate(l.expiresAt)}.{" "}
          {l.canExtend && (
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

function App() {
  const route = useRoute();
  const [path, query] = route.split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "new") return <NewLeague />;
  if (parts[0] === "admin" && parts[1]) return <Organiser key={parts[1]} token={parts[1]} fresh={query === "new"} />;
  if (parts[0] === "l" && parts[1]) {
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
