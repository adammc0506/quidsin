import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./pickers.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { copy } from "../lib/client";

// Unbiased random whole number below n, from the browser's secure random source.
function randInt(n: number): number {
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}
const shuffled = <T,>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const parse = (t: string) => [...new Set(t.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean))];
const KEY = "pickers:names";
const load = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

type Tab = "one" | "teams" | "order" | "dice";

function Names({ text, set }: { text: string; set: (t: string) => void }) {
  const n = parse(text).length;
  return (
    <label className="field names">
      <span>Names</span>
      <textarea
        value={text}
        onChange={(e) => {
          set(e.target.value);
          try {
            localStorage.setItem(KEY, e.target.value);
          } catch {
            /* ignore */
          }
        }}
        placeholder={"One per line, or separated by commas\nAnn\nBob\nCy"}
      />
      <small className="muted">{n} {n === 1 ? "name" : "names"}</small>
    </label>
  );
}

function PickOne({ names }: { names: string[] }) {
  const [shown, setShown] = useState("");
  const [rolling, setRolling] = useState(false);
  const [used, setUsed] = useState<string[]>([]);
  const [noRepeat, setNoRepeat] = useState(true);
  const pool = noRepeat ? names.filter((n) => !used.includes(n)) : names;
  const pick = async () => {
    if (pool.length === 0) return;
    const winner = pool[randInt(pool.length)];
    if (!reduced()) {
      setRolling(true);
      for (let i = 0; i < 12; i++) {
        setShown(names[randInt(names.length)]);
        await new Promise((r) => setTimeout(r, 60 + i * 14));
      }
      setRolling(false);
    }
    setShown(winner);
    setUsed((u) => [...u, winner]);
  };
  return (
    <div className="stack">
      <div className={`result${rolling ? " rolling" : ""}`} role="status" aria-live="polite">
        {shown ? <span className="big">{shown}</span> : <span className="hint">Add names, then pick</span>}
      </div>
      <label className="check">
        <input type="checkbox" checked={noRepeat} onChange={(e) => setNoRepeat(e.target.checked)} />
        <span>
          <strong>Don't pick the same person twice</strong>
          <small className="muted">{noRepeat ? `${pool.length} left in the hat` : "Everyone stays in every time"}</small>
        </span>
      </label>
      <div className="actions">
        <button className="btn primary big" onClick={pick} disabled={pool.length === 0 || rolling}>
          {pool.length === 0 && names.length > 0 ? "Everyone's been picked" : "Pick someone"}
        </button>
        {used.length > 0 && (
          <button
            className="btn"
            onClick={() => {
              setUsed([]);
              setShown("");
            }}
          >
            Put everyone back
          </button>
        )}
      </div>
    </div>
  );
}

function Teams({ names }: { names: string[] }) {
  const [count, setCount] = useState(2);
  const [teams, setTeams] = useState<string[][]>([]);
  const [note, setNote] = useState("");
  const make = () => {
    const s = shuffled(names);
    const t: string[][] = Array.from({ length: count }, () => []);
    s.forEach((n, i) => t[i % count].push(n));
    setTeams(t);
  };
  const text = teams.map((t, i) => `Team ${i + 1}: ${t.join(", ")}`).join("\n");
  return (
    <div className="stack">
      <fieldset className="field">
        <legend>How many teams?</legend>
        <div className="stepper">
          <button type="button" onClick={() => setCount(Math.max(2, count - 1))} aria-label="Fewer teams">−</button>
          <output>{count}</output>
          <button type="button" onClick={() => setCount(Math.min(8, count + 1))} aria-label="More teams">+</button>
        </div>
      </fieldset>
      <div className="actions">
        <button className="btn primary big" onClick={make} disabled={names.length < count}>
          {teams.length ? "Shuffle again" : "Make teams"}
        </button>
      </div>
      {names.length < count && names.length > 0 && <p className="muted small">Add at least {count} names.</p>}
      {teams.length > 0 && (
        <>
          <div className="teams">
            {teams.map((t, i) => (
              <section className="team" key={i}>
                <h3>Team {i + 1}</h3>
                <ul>{t.map((n) => <li key={n}>{n}</li>)}</ul>
              </section>
            ))}
          </div>
          <button className="btn" onClick={async () => { setNote((await copy(text)) === "copied" ? "Copied" : "Couldn't copy"); setTimeout(() => setNote(""), 2000); }}>
            {note || "Copy the teams"}
          </button>
        </>
      )}
    </div>
  );
}

function Order({ names }: { names: string[] }) {
  const [list, setList] = useState<string[]>([]);
  const [note, setNote] = useState("");
  return (
    <div className="stack">
      <button className="btn primary big" onClick={() => setList(shuffled(names))} disabled={names.length < 2}>
        {list.length ? "Shuffle again" : "Shuffle the order"}
      </button>
      {list.length > 0 && (
        <>
          <ol className="order">{list.map((n) => <li key={n}>{n}</li>)}</ol>
          <button className="btn" onClick={async () => { setNote((await copy(list.map((n, i) => `${i + 1}. ${n}`).join("\n"))) === "copied" ? "Copied" : "Couldn't copy"); setTimeout(() => setNote(""), 2000); }}>
            {note || "Copy the order"}
          </button>
        </>
      )}
    </div>
  );
}

function Dice() {
  const [out, setOut] = useState<{ big: string; small: string } | null>(null);
  const roll = (sides: number, label: string) => setOut({ big: String(randInt(sides) + 1), small: label });
  return (
    <div className="stack">
      <div className="result" role="status" aria-live="polite">
        {out ? (
          <span>
            <span className="big">{out.big}</span>
            <br />
            <span className="hint">{out.small}</span>
          </span>
        ) : (
          <span className="hint">Flip or roll something</span>
        )}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={() => setOut({ big: randInt(2) ? "Heads" : "Tails", small: "Coin" })}>Flip a coin</button>
        <button className="btn" onClick={() => roll(6, "One die")}>Roll a die</button>
        <button className="btn" onClick={() => { const a = randInt(6) + 1, b = randInt(6) + 1; setOut({ big: String(a + b), small: `Two dice: ${a} and ${b}` }); }}>Roll two dice</button>
        <button className="btn" onClick={() => roll(20, "20-sided die")}>Roll a d20</button>
      </div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("one");
  const [text, setText] = useState(load);
  const names = parse(text);
  return (
    <div className="shell">
      <header className="bar">
        <a className="brand" href="/pickers/">Pickers</a>
        <a className="family" href="/">Tab &amp; Tally</a>
      </header>
      <main className="main">
        <div className="stack">
          <h1 className="plain">Pickers</h1>
          <p className="muted">Pick from a hat, split into teams, shuffle an order, or flip a coin. Nothing is saved on our servers.</p>
          <div className="tabs" role="tablist">
            {([["one", "Pick one"], ["teams", "Teams"], ["order", "Order"], ["dice", "Coin & dice"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab !== "dice" && <Names text={text} set={setText} />}
          {tab === "one" && <PickOne names={names} />}
          {tab === "teams" && <Teams names={names} />}
          {tab === "order" && <Order names={names} />}
          {tab === "dice" && <Dice />}
          <p className="fine">Free, from <a href="/">Tab &amp; Tally</a>. <a href="/privacy/">Privacy</a></p>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
