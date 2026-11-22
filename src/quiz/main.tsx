import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./quiz.css";
import { StrictMode, useCallback, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { QrToggle, FundPromo } from "../lib/Qr";
import { KeepTick, Loading, NameList, Problem, Shell, ToolHome, go, niceDate, useFlash, useLoad, useRoute } from "../lib/kit";
import { adminLink, api, copy, mine, normaliseRef, quizLink, shareOrCopy, type Quiz } from "./api";

const NAME = "Quiz night";
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Home() {
  return (
    <ToolHome
      name={NAME}
      title="Score the quiz, live"
      lede="Enter each team's points after every round. Everyone else watches the leaderboard on their own phone. No more adding up on the back of a beer mat."
      start="Start a quiz"
      placeholder="QZ-XXXX-XXXX"
      normalise={normaliseRef}
      watchRoute="q"
      joinLabel="Playing in someone's quiz?"
      steps={[
        ["Add the teams", "And how many rounds you're running. You can change both later."],
        ["Enter scores after each round", "Half points are fine."],
        ["Share the code", "Teams see the leaderboard. Only you can change scores."],
      ]}
      yours="Your quizzes"
      adminLabel="You're the quizmaster"
      saved={mine.all()}
      fund="Quiz night raising money for a club?"
      fine="Quizzes are deleted after 30 days, or 3 months if you choose."
    />
  );
}

function NewQuiz() {
  const [name, setName] = useState("");
  const [teams, setTeams] = useState(["", "", ""]);
  const [rounds, setRounds] = useState(6);
  const [long, setLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clean = teams.map((t) => t.trim()).filter(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Give the quiz a name.");
    if (clean.length < 1) return setErr("Add at least one team. You can add more later.");
    if (new Set(clean.map((t) => t.toLowerCase())).size !== clean.length) return setErr("Two teams have the same name.");
    setBusy(true);
    try {
      const r = await api.create({ name: name.trim(), teams: clean, rounds, retentionDays: long ? 90 : 30 });
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
        <h1 className="plain">New quiz</h1>
        <label className="field">
          <span>What's it called?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thursday pub quiz" maxLength={60} />
        </label>
        <NameList legend="Teams" noun="Team" values={teams} set={setTeams} max={40} />
        <div className="field">
          <span id="rl" style={{ fontWeight: 620, fontSize: "0.92rem" }}>
            Rounds
          </span>
          <div className="stepper" role="group" aria-labelledby="rl">
            <button type="button" className="btn" aria-label="Fewer rounds" onClick={() => setRounds(Math.max(1, rounds - 1))}>
              −
            </button>
            <output>{rounds}</output>
            <button type="button" className="btn" aria-label="More rounds" onClick={() => setRounds(Math.min(30, rounds + 1))}>
              +
            </button>
          </div>
        </div>
        <KeepTick long={long} setLong={setLong} what="The quiz is" />
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Creating…" : "Start the quiz"}
        </button>
      </form>
    </Shell>
  );
}

function Leaderboard({ q }: { q: Quiz }) {
  const sorted = [...q.teams].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  let rank = 0;
  let prev: number | null = null;
  const rows = sorted.map((t, i) => {
    if (t.total !== prev) rank = i + 1;
    prev = t.total;
    return { ...t, rank };
  });
  const started = q.scores.length > 0;
  return (
    <section className="lb" aria-label={`${q.name} leaderboard`}>
      <header className="lb-head">
        <h1>{q.name}</h1>
        <p>
          {q.rounds.length} {q.rounds.length === 1 ? "round" : "rounds"}
        </p>
      </header>
      <ol className="lb-rows">
        {rows.map((t) => (
          <li key={t.id} className={started && t.rank === 1 ? "lead" : ""}>
            <span className="rank">{started ? t.rank : "–"}</span>
            <span className="tname">{t.name}</span>
            <span className="tscore">{fmt(t.total)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Grid({ q }: { q: Quiz }) {
  const val = new Map(q.scores.map((s) => [`${s.roundId}:${s.teamId}`, s.points]));
  return (
    <details className="card gridcard">
      <summary>Round by round</summary>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Team</th>
              {q.rounds.map((r) => (
                <th key={r.id} scope="col">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.teams.map((t) => (
              <tr key={t.id}>
                <th scope="row">{t.name}</th>
                {q.rounds.map((r) => (
                  <td key={r.id}>{val.has(`${r.id}:${t.id}`) ? fmt(val.get(`${r.id}:${t.id}`)!) : "–"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Watch({ refCode }: { refCode: string }) {
  const fetcher = useCallback(() => api.get(refCode), [refCode]);
  const { data: q, err } = useLoad(fetcher, 8000);
  useEffect(() => {
    if (q) mine.save({ ref: q.reference, name: q.name });
  }, [q?.reference]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Shell name={NAME} back="/"><Problem name={NAME} msg={err} /></Shell>;
  if (!q) return <Shell name={NAME} back="/"><Loading /></Shell>;
  return (
    <Shell name={NAME} back="/">
      <div className="stack">
        <Leaderboard q={q} />
        <p className="muted small live">Updates by itself while you have this page open.</p>
        <Grid q={q} />
      </div>
    </Shell>
  );
}

/** One team's score for the chosen round. Saves when you leave the box or press Enter. */
function ScoreRow({ value, name, onSave }: { value: number | undefined; name: string; onSave: (v: number | null) => void }) {
  const [text, setText] = useState(value === undefined ? "" : fmt(value));
  useEffect(() => setText(value === undefined ? "" : fmt(value)), [value]);
  const commit = () => {
    const t = text.trim();
    if (t === "") return value === undefined ? undefined : onSave(null);
    const n = Number(t);
    if (!Number.isFinite(n) || Math.round(n * 2) !== n * 2) return setText(value === undefined ? "" : fmt(value));
    if (n !== value) onSave(n);
  };
  const bump = (d: number) => {
    const n = (value ?? 0) + d;
    onSave(n);
  };
  return (
    <li>
      <span className="tn">{name}</span>
      <div className="entry">
        <button type="button" className="chip small-chip" aria-label={`Take half a point off ${name}`} onClick={() => bump(-0.5)}>
          −½
        </button>
        <input
          value={text}
          inputMode="decimal"
          aria-label={`${name} score`}
          placeholder="–"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <button type="button" className="chip small-chip" aria-label={`Add one point to ${name}`} onClick={() => bump(1)}>
          +1
        </button>
      </div>
    </li>
  );
}

function Master({ token, fresh }: { token: string; fresh: boolean }) {
  const fetcher = useCallback(() => api.admin(token), [token]);
  const { data: q, setData, err, load } = useLoad(fetcher);
  const { note, flash } = useFlash();
  const [roundId, setRoundId] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState("");
  const [renaming, setRenaming] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    if (q) mine.save({ ref: q.reference, name: q.name, admin: token });
  }, [q?.reference, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Shell name={NAME} back="/"><Problem name={NAME} msg={err} /></Shell>;
  if (!q) return <Shell name={NAME} back="/"><Loading /></Shell>;

  const round = q.rounds.find((r) => r.id === roundId) ?? q.rounds.find((r) => !q.scores.some((s) => s.roundId === r.id)) ?? q.rounds[q.rounds.length - 1];
  const run = async (fn: () => Promise<Quiz>) => {
    try {
      setData(await fn());
    } catch (x) {
      flash((x as Error).message);
      load();
    }
  };
  const val = new Map(q.scores.map((s) => [`${s.roundId}:${s.teamId}`, s.points]));

  return (
    <Shell name={NAME} back="/">
      <div className="stack">
        <Leaderboard q={q} />
        {note && <p className="toast" role="status">{note}</p>}

        {round && (
          <section className="card entry-card" aria-label="Enter scores">
            <div className="tabs" role="tablist" aria-label="Rounds">
              {q.rounds.map((r) => (
                <button key={r.id} role="tab" aria-selected={r.id === round.id} className={`tab${r.id === round.id ? " on" : ""}`} onClick={() => setRoundId(r.id)}>
                  {r.name}
                </button>
              ))}
            </div>
            <ul className="entries">
              {q.teams.map((t) => (
                <ScoreRow key={`${round.id}:${t.id}`} name={t.name} value={val.get(`${round.id}:${t.id}`)} onSave={(v) => run(() => api.score(token, round.id, t.id, v))} />
              ))}
            </ul>
          </section>
        )}

        {fresh && (
          <div className="card warn">
            <strong>Save this page.</strong>
            <p>This is your quizmaster link. It's the only way to enter scores from another phone. Don't share it.</p>
            <button className="btn" onClick={async () => flash((await copy(adminLink(token))) === "copied" ? "Quizmaster link copied" : "Couldn't copy")}>
              Copy quizmaster link
            </button>
          </div>
        )}

        <div className="card invite">
          <p>Let teams watch the leaderboard on their own phones.</p>
          <p className="ref">{q.reference}</p>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await shareOrCopy(q.name, `Follow the scores for ${q.name}:`, quizLink(q.reference));
              if (r === "copied") flash("Invite copied");
            }}
          >
            Share the leaderboard
          </button>
          <QrToggle url={quizLink(q.reference)} />
        </div>

        <Grid q={q} />

        <section className="card quiet-card">
          <h2 className="h2">Rounds</h2>
          {round && (
            <form
              className="custom"
              onSubmit={(e) => {
                e.preventDefault();
                if (renaming.trim()) run(() => api.renameRound(token, round.id, renaming.trim())).then(() => setRenaming(""));
              }}
            >
              <input value={renaming} onChange={(e) => setRenaming(e.target.value)} placeholder={`Rename "${round.name}"`} maxLength={40} aria-label="New round name" />
              <button className="btn">Rename</button>
            </form>
          )}
          <div className="rowbtns">
            <button className="btn" onClick={() => run(() => api.addRound(token))} disabled={q.rounds.length >= 30}>
              Add a round
            </button>
            {round && q.rounds.length > 1 && (
              <button
                className={`link small ${confirm === "r" ? "danger" : "quiet"}`}
                onClick={() => {
                  if (confirm !== "r") return setConfirm("r");
                  setConfirm(null);
                  setRoundId(null);
                  run(() => api.removeRound(token, round.id));
                }}
              >
                {confirm === "r" ? `Tap again to delete ${round.name} and its scores` : `Delete ${round.name}`}
              </button>
            )}
          </div>
          <h2 className="h2">Teams</h2>
          <ul className="people">
            {q.teams.map((t) => (
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
                  {confirm === t.id ? "Tap again to remove" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="custom"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newTeam.trim()) return;
              await run(() => api.addTeam(token, newTeam.trim()));
              setNewTeam("");
            }}
          >
            <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Add a team" maxLength={40} aria-label="New team name" />
            <button className="btn">Add</button>
          </form>
        </section>

        <FundPromo line="Running a quiz to raise money?" />
        <p className="muted small">
          Deletes on {niceDate(q.expiresAt)}.{" "}
          {q.canExtend && (
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
  if (parts[0] === "new") return <NewQuiz />;
  if (parts[0] === "admin" && parts[1]) return <Master key={parts[1]} token={parts[1]} fresh={query === "new"} />;
  if (parts[0] === "q" && parts[1]) {
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
