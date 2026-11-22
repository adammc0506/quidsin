// Small building blocks shared by the newer Tab & Tally tools (Sweepstake, Quiz, League).
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FundPromo } from "./Qr";

export const useRoute = () => {
  const [hash, setHash] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1) || "/");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
};
export const go = (path: string) => {
  location.hash = path;
  scrollTo(0, 0);
};

export function Shell({ name, children, back }: { name: string; children: ReactNode; back?: string }) {
  return (
    <div className="shell">
      <header className="bar">
        {back ? (
          <a className="back" href={`#${back}`}>
            Back
          </a>
        ) : (
          <a className="brand" href="#/">
            {name}
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

export const Loading = () => <p className="muted pad">Loading…</p>;

export function Problem({ msg, name }: { msg: string; name: string }) {
  return (
    <div className="card">
      <h1 className="h2">That didn't work</h1>
      <p>{msg}</p>
      <a className="btn" href="#/">
        Go to {name} home
      </a>
    </div>
  );
}

// ---------- this device's list ----------

export type Saved = { ref: string; name: string; admin?: string };

export function makeMine(key: string) {
  const load = (): Saved[] => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  return {
    all: load,
    save(e: Saved) {
      const old = load().find((s) => s.ref === e.ref);
      const list = [{ ...old, ...e }, ...load().filter((s) => s.ref !== e.ref)].slice(0, 20);
      try {
        localStorage.setItem(key, JSON.stringify(list));
      } catch {
        /* storage blocked: links still work */
      }
    },
  };
}

// ---------- references and links ----------

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function makeRef(prefix: string) {
  return (input: string): string | null => {
    let s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (s.startsWith(prefix)) s = s.slice(prefix.length);
    s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
    if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
    return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
  };
}
const origin = () => (location.protocol.startsWith("http") ? location.origin : "https://tabandtally.co.uk");
export const linkTo = (tool: string, route: string, id: string) => `${origin()}/${tool}/#/${route}/${id}`;

// ---------- hooks ----------

/** Loads something, keeps it fresh while the page is open (if `poll`), and exposes a setter. */
export function useLoad<T>(fetcher: () => Promise<T>, poll = 0) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => fetcher().then(setData, (e: Error) => setErr(e.message)), [fetcher]);
  useEffect(() => {
    load();
    if (!poll) return;
    const t = setInterval(() => document.visibilityState === "visible" && load(), poll);
    return () => clearInterval(t);
  }, [load, poll]);
  return { data, setData, err, load };
}

export function useFlash() {
  const [note, setNote] = useState("");
  const flash = useCallback((m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 2500);
  }, []);
  return { note, flash };
}

export const niceDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// ---------- screens ----------

export function ToolHome(p: {
  name: string;
  title: string;
  lede: string;
  start: string;
  placeholder: string;
  normalise: (s: string) => string | null;
  watchRoute: string;
  steps: [string, string][];
  yours: string;
  adminLabel: string;
  saved: Saved[];
  fund: string;
  fine: string;
  joinLabel: string;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const join = (e: FormEvent) => {
    e.preventDefault();
    const r = p.normalise(code);
    if (!r) return setErr(`That doesn't look like a ${p.name} code. It starts with ${p.placeholder.slice(0, 2)}.`);
    go(`/${p.watchRoute}/${r}`);
  };
  return (
    <Shell name={p.name}>
      <section className="hero">
        <h1>{p.title}</h1>
        <p className="lede">{p.lede}</p>
        <button className="btn primary big" onClick={() => go("/new")}>
          {p.start}
        </button>
      </section>
      <form className="join" onSubmit={join}>
        <label htmlFor="code">{p.joinLabel}</label>
        <div className="row-input">
          <input
            id="code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErr("");
            }}
            placeholder={p.placeholder}
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
          {p.steps.map(([a, b]) => (
            <li key={a}>
              <strong>{a}</strong>
              <span>{b}</span>
            </li>
          ))}
        </ol>
      </section>
      {p.saved.length > 0 && (
        <section>
          <h2 className="h2">{p.yours}</h2>
          <ul className="list">
            {p.saved.map((s) => (
              <li key={s.ref}>
                <a href={s.admin ? `#/admin/${s.admin}` : `#/${p.watchRoute}/${s.ref}`}>
                  <strong>{s.name}</strong>
                  <span className="muted small">{s.admin ? p.adminLabel : "You're watching"}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <FundPromo line={p.fund} />
      <p className="fine">
        Free, from <a href="/">Tab &amp; Tally</a>. {p.fine} <a href="/privacy/">Privacy</a>
      </p>
    </Shell>
  );
}

/** Two-step "Keep for 3 months" tick, used on every create form. */
export function KeepTick({ long, setLong, what }: { long: boolean; setLong: (v: boolean) => void; what: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} />
      <span>
        <strong>Keep for 3 months</strong>
        <small className="muted">
          {what} deleted after {long ? "3 months" : "30 days"}, with everything in it.
        </small>
      </span>
    </label>
  );
}

/** Rows of text inputs with an "add another" button. */
export function NameList({ legend, noun, values, set, max, min = 1 }: { legend: string; noun: string; values: string[]; set: (v: string[]) => void; max: number; min?: number }) {
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      {values.map((p, i) => (
        <input
          key={i}
          value={p}
          aria-label={`${noun} ${i + 1}`}
          placeholder={`${noun} ${i + 1}`}
          maxLength={40}
          onChange={(e) => set(values.map((x, j) => (j === i ? e.target.value : x)))}
        />
      ))}
      <button type="button" className="link" onClick={() => set([...values, ""])} disabled={values.length >= max}>
        Add another {noun.toLowerCase()}
      </button>
      {min > 1 && <small className="muted">At least {min}.</small>}
    </fieldset>
  );
}

/** Bulk entry: one name per line (handy for 48 World Cup teams). */
export function parseLines(text: string): string[] {
  return text.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
}
