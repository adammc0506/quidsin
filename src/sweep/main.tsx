import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./sweep.css";
import { StrictMode, useCallback, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { QrToggle, FundPromo } from "../lib/Qr";
import { KeepTick, Loading, Problem, Shell, ToolHome, go, niceDate, parseLines, useFlash, useLoad, useRoute } from "../lib/kit";
import { adminLink, api, copy, mine, normaliseRef, shareOrCopy, sweepLink, type Item, type Status, type Sweep } from "./api";

const NAME = "Sweepstake";
const NEXT: Record<Status, Status> = { in: "out", out: "won", won: "in" };
const WORD: Record<Status, string> = { in: "Still in", out: "Out", won: "Winner" };

function Home() {
  return (
    <ToolHome
      name={NAME}
      title="Run a sweepstake without the hat"
      lede="Add the teams and the people. The draw is shuffled fairly and everyone can see who got what. Good for the World Cup, the Grand National or the office."
      start="Start a sweepstake"
      placeholder="SW-XXXX-XXXX"
      normalise={normaliseRef}
      watchRoute="s"
      joinLabel="Looking for your draw?"
      steps={[
        ["Add what's being drawn", "Teams, horses, numbers. One per line."],
        ["Add who's playing", "Everyone gets a fair share, picked at random."],
        ["Share the code", "Everyone sees the draw. You mark who's out or has won."],
      ]}
      yours="Your sweepstakes"
      adminLabel="You're running it"
      saved={mine.all()}
      fund="Raising money for a club?"
      fine="Sweepstakes are deleted after 30 days, or 3 months if you choose."
    />
  );
}

function NewSweep() {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [items, setItems] = useState("");
  const [people, setPeople] = useState("");
  const [long, setLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const it = parseLines(items);
  const pe = parseLines(people);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Give the sweepstake a name.");
    if (it.length < 2) return setErr("Add at least two things to draw, one per line.");
    if (pe.length < 2) return setErr("Add at least two people, one per line.");
    if (it.length > 64 || pe.length > 64) return setErr("That's more than 64. Split it into two sweepstakes.");
    setBusy(true);
    try {
      const r = await api.create({ name: name.trim(), about: about.trim(), items: it, entrants: pe, retentionDays: long ? 90 : 30 });
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
        <h1 className="plain">New sweepstake</h1>
        <label className="field">
          <span>What's it called?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office World Cup" maxLength={60} />
        </label>
        <label className="field">
          <span>Prize or rules (optional)</span>
          <input value={about} onChange={(e) => setAbout(e.target.value)} placeholder="£2 in, winner takes the pot" maxLength={300} />
        </label>
        <label className="field">
          <span>What's being drawn?</span>
          <textarea rows={6} value={items} onChange={(e) => setItems(e.target.value)} placeholder={"One per line:\nBrazil\nFrance\nEngland"} />
          <small className="muted">
            {it.length} so far.{" "}
            <button type="button" className="link small" onClick={() => setItems(Array.from({ length: 20 }, (_, i) => String(i + 1)).join("\n"))}>
              Fill with numbers 1 to 20
            </button>
          </small>
        </label>
        <label className="field">
          <span>Who's playing?</span>
          <textarea rows={5} value={people} onChange={(e) => setPeople(e.target.value)} placeholder={"One per line:\nAnn\nBob"} />
          <small className="muted">
            {pe.length} so far.{it.length > 0 && pe.length > 1 && it.length % pe.length !== 0 && " Some people will get one more than others."}
          </small>
        </label>
        <KeepTick long={long} setLong={setLong} what="The draw is" />
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Drawing…" : "Do the draw"}
        </button>
        <p className="muted small">The draw happens once and can't be redone, so check the names first.</p>
      </form>
    </Shell>
  );
}

function ItemChip({ it, onTap }: { it: Item; onTap?: (i: Item) => void }) {
  const cls = `chipitem ${it.status}`;
  const label = `${it.label}${it.status === "in" ? "" : it.status === "out" ? ", out" : ", winner"}`;
  return onTap ? (
    <button className={cls} onClick={() => onTap(it)} aria-label={`${label}. Tap to change.`}>
      {it.label}
    </button>
  ) : (
    <span className={cls} aria-label={label}>
      {it.label}
    </span>
  );
}

function Draw({ s, onTap }: { s: Sweep; onTap?: (i: Item) => void }) {
  const won = s.items.filter((i) => i.status === "won");
  const byName = new Map(s.entrants.map((e) => [e.id, e.name]));
  return (
    <section className="draw" aria-label={`${s.name} draw`}>
      <header className="draw-head">
        <h1>{s.name}</h1>
        {s.about && <p>{s.about}</p>}
      </header>
      {won.length > 0 && (
        <p className="winners">
          {won.map((w) => `${byName.get(w.entrantId ?? "") ?? "?"} has ${w.label}`).join(". ")}.
        </p>
      )}
      <ul className="people-draw">
        {s.entrants.map((e) => {
          const mineItems = s.items.filter((i) => i.entrantId === e.id);
          const live = mineItems.filter((i) => i.status !== "out").length;
          return (
            <li key={e.id} className={mineItems.some((i) => i.status === "won") ? "won" : live === 0 ? "dead" : ""}>
              <div className="who">
                <strong>{e.name}</strong>
                <span className="muted small">{live === 0 ? "Out of it" : `${live} still in`}</span>
              </div>
              <div className="chipset">
                {mineItems.map((i) => (
                  <ItemChip key={i.id} it={i} onTap={onTap} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Watch({ refCode }: { refCode: string }) {
  const fetcher = useCallback(() => api.get(refCode), [refCode]);
  const { data: s, err } = useLoad(fetcher, 15000);
  useEffect(() => {
    if (s) mine.save({ ref: s.reference, name: s.name });
  }, [s?.reference]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Shell name={NAME} back="/"><Problem name={NAME} msg={err} /></Shell>;
  if (!s) return <Shell name={NAME} back="/"><Loading /></Shell>;
  return (
    <Shell name={NAME} back="/">
      <div className="stack">
        <Draw s={s} />
        <p className="muted small live">Updates by itself while you have this page open.</p>
      </div>
    </Shell>
  );
}

function Runner({ token, fresh }: { token: string; fresh: boolean }) {
  const fetcher = useCallback(() => api.admin(token), [token]);
  const { data: s, setData, err, load } = useLoad(fetcher);
  const { note, flash } = useFlash();
  useEffect(() => {
    if (s) mine.save({ ref: s.reference, name: s.name, admin: token });
  }, [s?.reference, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Shell name={NAME} back="/"><Problem name={NAME} msg={err} /></Shell>;
  if (!s) return <Shell name={NAME} back="/"><Loading /></Shell>;

  const tap = async (it: Item) => {
    const status = NEXT[it.status];
    setData({ ...s, items: s.items.map((x) => (x.id === it.id ? { ...x, status } : x)) });
    try {
      setData(await api.setStatus(token, it.id, status));
    } catch (x) {
      flash((x as Error).message);
      load();
    }
  };

  return (
    <Shell name={NAME} back="/">
      <div className="stack">
        <Draw s={s} onTap={tap} />
        <p className="muted small">Tap a team to mark it: {Object.values(WORD).join(" → ")}.</p>
        {note && <p className="toast" role="status">{note}</p>}
        {fresh && (
          <div className="card warn">
            <strong>Save this page.</strong>
            <p>This is your organiser link. It's the only way to mark teams out or as winners. Don't share it.</p>
            <button className="btn" onClick={async () => flash((await copy(adminLink(token))) === "copied" ? "Organiser link copied" : "Couldn't copy")}>
              Copy organiser link
            </button>
          </div>
        )}
        <div className="card invite">
          <p>Share the draw so everyone can see who got what.</p>
          <p className="ref">{s.reference}</p>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await shareOrCopy(s.name, `See the draw for ${s.name}:`, sweepLink(s.reference));
              if (r === "copied") flash("Invite copied");
            }}
          >
            Share the draw
          </button>
          <QrToggle url={sweepLink(s.reference)} />
        </div>
        <FundPromo line="Running this to raise money for a club?" />
        <p className="muted small">
          Deletes on {niceDate(s.expiresAt)}.{" "}
          {s.canExtend && (
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
  if (parts[0] === "new") return <NewSweep />;
  if (parts[0] === "admin" && parts[1]) return <Runner key={parts[1]} token={parts[1]} fresh={query === "new"} />;
  if (parts[0] === "s" && parts[1]) {
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
