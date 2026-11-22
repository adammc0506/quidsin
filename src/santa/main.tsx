import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./santa.css";
import { StrictMode, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { formatPence, parsePounds } from "../lib/money";
import { QrToggle } from "../lib/Qr";
import {
  adminLink,
  api,
  ApiError,
  copy,
  groupLink,
  mine,
  normaliseRef,
  privateLink,
  shareOrCopy,
  type Draw,
  type Me,
} from "./api";

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

const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });

function Details({ d }: { d: Draw }) {
  if (!d.budgetPence && !d.exchangeDate) return null;
  return (
    <dl className="details">
      {d.budgetPence ? (
        <div>
          <dt>Spend up to</dt>
          <dd className="money">{formatPence(d.budgetPence)}</dd>
        </div>
      ) : null}
      {d.exchangeDate ? (
        <div>
          <dt>Swap presents</dt>
          <dd>{dateText(d.exchangeDate)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

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
            Secret Santa
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

function Loading() {
  return <p className="muted pad">Loading…</p>;
}

function Problem({ msg }: { msg: string }) {
  return (
    <div className="card">
      <h1 className="h2">That didn't work</h1>
      <p>{msg}</p>
      <a className="btn" href="#/">
        Go to Secret Santa home
      </a>
    </div>
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
    if (!ref) return setErr("That doesn't look like a code. It's on the invite, like SS-7KQ4-M9X2.");
    go(`/d/${ref}`);
  };
  return (
    <Shell>
      <section className="hero">
        <div className="hat" aria-hidden="true">
          <span className="slip s1" />
          <span className="slip s2" />
          <span className="slip s3" />
        </div>
        <h1>Draw names for Secret Santa</h1>
        <p className="lede">
          Add everyone, share one link, and each person sees only who they're buying for. Nobody else can see the
          draw, not even you.
        </p>
        <button className="btn primary big" onClick={() => go("/new")}>
          Start a draw
        </button>
      </section>

      <form className="join" onSubmit={join}>
        <label htmlFor="code">Got an invite code?</label>
        <div className="row">
          <input
            id="code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErr("");
            }}
            placeholder="SS-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button className="btn">Open</button>
        </div>
        {err && <p className="error">{err}</p>}
      </form>

      {saved.length > 0 && (
        <section>
          <h2 className="h2">Your draws</h2>
          <ul className="list">
            {saved.map((s) => (
              <li key={s.ref}>
                <a href={s.token ? `#/me/${s.token}` : s.admin ? `#/admin/${s.admin}` : `#/d/${s.ref}`}>
                  <strong>{s.name}</strong>
                  <span className="muted small">
                    {s.me ? `You're ${s.me}` : "Not picked your name yet"}
                    {s.admin ? " · organiser" : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="fine">
        Free, from <a href="/">Tab &amp; Tally</a>. Draws are deleted after 30 days, or 3 months if you choose.{" "}
        <a href="/privacy/">Privacy</a>
      </p>
    </Shell>
  );
}

// ---------- organiser creates ----------

function NewDraw() {
  const [name, setName] = useState("");
  const [people, setPeople] = useState(["", "", ""]);
  const [budget, setBudget] = useState("");
  const [date, setDate] = useState("");
  const [long, setLong] = useState(false);
  const [wishlists, setWishlists] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clean = people.map((p) => p.trim()).filter(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Give the draw a name.");
    if (clean.length < 3) return setErr("Add at least 3 people.");
    if (new Set(clean.map((p) => p.toLowerCase())).size !== clean.length)
      return setErr("Two people have the same name. Add a surname initial to tell them apart.");
    let budgetPence: number | undefined;
    if (budget.trim()) {
      const p = parsePounds(budget);
      if (!p) return setErr("Budget should be an amount, like 20 or 15.50.");
      budgetPence = p;
    }
    setBusy(true);
    try {
      const r = await api.create({
        name: name.trim(),
        members: clean,
        budgetPence,
        exchangeDate: date || undefined,
        wishlists,
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
        <h1>New draw</h1>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office Christmas 2026" maxLength={60} />
        </label>

        <fieldset className="field">
          <legend>Who's in? Include yourself if you're taking part.</legend>
          {people.map((p, i) => (
            <input
              key={i}
              value={p}
              aria-label={`Person ${i + 1}`}
              placeholder={`Person ${i + 1}`}
              maxLength={40}
              onChange={(e) => setPeople(people.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          <button type="button" className="link" onClick={() => setPeople([...people, ""])} disabled={people.length >= 50}>
            Add another person
          </button>
        </fieldset>

        <div className="pair">
          <label className="field">
            <span>Budget (optional)</span>
            <div className="prefix">
              <span aria-hidden="true">£</span>
              <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="20" />
            </div>
          </label>
          <label className="field">
            <span>Swap date (optional)</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={wishlists} onChange={(e) => setWishlists(e.target.checked)} />
          <span>
            <strong>Let people add a wishlist</strong>
            <small className="muted">
              {wishlists
                ? "Each person can jot down gift ideas. Only their Secret Santa sees them."
                : "Off: nobody can add a wishlist in this draw."}
            </small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} />
          <span>
            <strong>Keep for 3 months</strong>
            <small className="muted">The draw is deleted after {long ? "3 months" : "30 days"}, with everything in it.</small>
          </span>
        </label>

        <p className="muted small">
          Names are drawn as soon as you create it. Everyone gets someone else, and no two people simply swap.
        </p>
        {err && <p className="error">{err}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Drawing names…" : `Draw names for ${clean.length || "…"} people`}
        </button>
      </form>
    </Shell>
  );
}

// ---------- organiser page ----------

function Admin({ token, fresh }: { token: string; fresh: boolean }) {
  const [d, setD] = useState<Draw | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [freeing, setFreeing] = useState<string | null>(null);
  const load = useCallback(() => api.admin(token).then(setD, (e) => setErr(e.message)), [token]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (d) mine.save({ ref: d.reference, name: d.name, admin: token });
  }, [d, token]);

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!d) return <Shell back="/"><Loading /></Shell>;
  const opened = d.people.filter((p) => p.claimed).length;
  const me = mine.get(d.reference);

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 2500);
  };

  return (
    <Shell back="/">
      <div className="stack">
        <div>
          <p className="kicker">You're organising</p>
          <h1>{d.name}</h1>
        </div>

        {fresh && (
          <div className="card warn">
            <strong>Names are drawn. Save this page.</strong>
            <p>
              This organiser link is the only way back here on another phone. It lets you free a name someone tapped by
              mistake. It never shows who drew who.
            </p>
            <button className="btn" onClick={async () => flash((await copy(adminLink(token))) === "copied" ? "Organiser link copied" : "Couldn't copy")}>
              Copy organiser link
            </button>
          </div>
        )}

        <div className="card invite">
          <p>Send this link to the group. Each person taps their own name to see who they're buying for.</p>
          <p className="ref">{d.reference}</p>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await shareOrCopy(d.name, `Secret Santa for ${d.name}: tap your name to see who you're buying for.`, groupLink(d.reference));
              if (r === "copied") flash("Invite copied");
            }}
          >
            Share the invite
          </button>
          <QrToggle url={groupLink(d.reference)} />
          {!me?.token && (
            <a className="btn" href={`#/d/${d.reference}`}>
              Taking part? Pick your name
            </a>
          )}
          {me?.token && (
            <a className="btn" href={`#/me/${me.token}`}>
              See who you're buying for
            </a>
          )}
        </div>
        {note && <p className="toast" role="status">{note}</p>}

        <Details d={d} />

        <section>
          <h2 className="h2">
            {opened} of {d.people.length} have opened their name
          </h2>
          <ul className="people">
            {d.people.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                {p.claimed ? (
                  freeing === p.id ? (
                    <button
                      className="link danger"
                      onClick={async () => {
                        setFreeing(null);
                        try {
                          await api.release(token, p.id);
                          flash(`${p.name} can pick their name again`);
                          load();
                        } catch (x) {
                          flash((x as Error).message);
                        }
                      }}
                    >
                      Tap again to free
                    </button>
                  ) : (
                    <button className="link quiet" onClick={() => setFreeing(p.id)} aria-label={`Free ${p.name}'s name`}>
                      Opened · Free
                    </button>
                  )
                ) : (
                  <span className="muted small">Not yet</span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">
            Free a name only if someone tapped the wrong one. The person who opened it will lose access, and whoever taps it
            next will see the same match.
          </p>
        </section>

        <p className="muted small">
          Deletes on {new Date(d.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.{" "}
          {d.canExtend && (
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

// ---------- pick your name ----------

function Pick({ refCode }: { refCode: string }) {
  const [d, setD] = useState<Draw | null>(null);
  const [err, setErr] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = mine.get(refCode);
  const load = useCallback(() => api.draw(refCode).then(setD, (e) => setErr(e.message)), [refCode]);
  useEffect(() => {
    if (saved?.token) go(`/me/${saved.token}`);
    else load();
  }, [load, saved?.token]);

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!d) return <Shell back="/"><Loading /></Shell>;
  const person = d.people.find((p) => p.id === chosen);

  const confirm = async () => {
    if (!person) return;
    setBusy(true);
    try {
      const r = await api.claim(d.reference, person.id);
      mine.save({ ref: d.reference, name: d.name, token: r.token, me: person.name });
      go(`/me/${r.token}?new`);
    } catch (x) {
      setErr((x as Error).message);
      if (x instanceof ApiError && x.status === 409) {
        setErr("");
        setChosen(null);
        load();
        alertLater(`${person.name} has just been opened on another phone. If that's you, ask the organiser to free it.`);
      }
      setBusy(false);
    }
  };

  return (
    <Shell back="/">
      <div className="stack">
        <div>
          <p className="kicker">Secret Santa</p>
          <h1>{d.name}</h1>
        </div>
        <Details d={d} />
        <h2 className="h2">Which one is you?</h2>
        <p className="muted small">Tap your own name. Once it's opened, it's locked to this phone.</p>
        <ul className="names">
          {d.people.map((p) => (
            <li key={p.id}>
              <button
                className={`name${chosen === p.id ? " on" : ""}`}
                disabled={p.claimed}
                aria-pressed={chosen === p.id}
                onClick={() => setChosen(p.id)}
              >
                {p.name}
                {p.claimed && <small>Taken</small>}
              </button>
            </li>
          ))}
        </ul>
        <Later />
        {person && (
          <div className="confirm">
            <p>
              Only tap if you are <strong>{person.name}</strong>. You'll see who you're buying for.
            </p>
            <button className="btn primary big" disabled={busy} onClick={confirm}>
              {busy ? "Opening…" : `Yes, I'm ${person.name}`}
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

let laterMsg = "";
const alertLater = (m: string) => {
  laterMsg = m;
  dispatchEvent(new Event("santa-msg"));
};
function Later() {
  const [m, setM] = useState(laterMsg);
  useEffect(() => {
    const on = () => setM(laterMsg);
    addEventListener("santa-msg", on);
    return () => removeEventListener("santa-msg", on);
  }, []);
  return m ? <p className="error" role="alert">{m}</p> : null;
}

// ---------- your private page ----------

function MePage({ token, fresh }: { token: string; fresh: boolean }) {
  const [data, setData] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(!fresh);
  const [wish, setWish] = useState("");
  const [saving, setSaving] = useState<"" | "saving" | "saved">("");
  const [note, setNote] = useState("");
  useEffect(() => {
    api.me(token).then(
      (m) => {
        setData(m);
        setWish(m.me.wishlist);
        mine.save({ ref: m.draw.reference, name: m.draw.name, token, me: m.me.name });
      },
      (e) => {
        setErr(e.message);
        if (e instanceof ApiError && e.status === 404) {
          const s = mine.all().find((x) => x.token === token);
          if (s) mine.save({ ...s, token: undefined, me: undefined });
        }
      },
    );
  }, [token]);

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!data) return <Shell back="/"><Loading /></Shell>;
  const { draw: d, me, recipient } = data;

  const save = async () => {
    setSaving("saving");
    try {
      await api.wishlist(token, wish);
      setSaving("saved");
    } catch (x) {
      setNote((x as Error).message);
      setSaving("");
    }
  };

  return (
    <Shell back="/">
      <div className="stack">
        <div>
          <p className="kicker">{d.name}</p>
          <h1>Hi {me.name}</h1>
        </div>

        <button
          className={`reveal${open ? " open" : ""}`}
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-label={open ? `You're buying for ${recipient.name}` : "Unfold your slip"}
        >
          <span className="fold top">
            <span className="hint">{open ? "" : "Tap to unfold"}</span>
          </span>
          <span className="fold bottom">
            <span className="for">You're buying for</span>
            <span className="who">{recipient.name}</span>
          </span>
        </button>

        <Details d={d} />

        {open && d.wishlists && (
          <section className="card">
            <h2 className="h2">{recipient.name}'s wishlist</h2>
            {recipient.wishlist ? (
              <p className="wish">{recipient.wishlist}</p>
            ) : (
              <p className="muted">Nothing yet. Check back later, they may add ideas.</p>
            )}
          </section>
        )}

        {d.wishlists && (
        <section className="card">
          <h2 className="h2">Your wishlist</h2>
          <p className="muted small">Only your Secret Santa sees this. Sizes, likes, things to avoid.</p>
          <textarea
            value={wish}
            maxLength={1000}
            rows={4}
            placeholder="Books, dark chocolate, nothing with glitter…"
            onChange={(e) => {
              setWish(e.target.value);
              setSaving("");
            }}
          />
          <button className="btn" onClick={save} disabled={saving === "saving" || wish.trim() === me.wishlist}>
            {saving === "saving" ? "Saving…" : saving === "saved" ? "Wishlist saved" : "Save wishlist"}
          </button>
        </section>
        )}

        <section className="card quiet-card">
          <h2 className="h2">Open this on another phone</h2>
          <p className="muted small">This is your private link. Don't share it, it shows who you're buying for.</p>
          <button
            className="btn"
            onClick={async () => setNote((await copy(privateLink(token))) === "copied" ? "Private link copied" : "Couldn't copy")}
          >
            Copy my private link
          </button>
        </section>
        {note && <p className="toast" role="status">{note}</p>}
      </div>
    </Shell>
  );
}

// ---------- app ----------

function App() {
  const route = useRoute();
  const [path, query] = route.split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "new") return <NewDraw />;
  if (parts[0] === "admin" && parts[1]) return <Admin key={parts[1]} token={parts[1]} fresh={query === "new"} />;
  if (parts[0] === "me" && parts[1]) return <MePage key={parts[1]} token={parts[1]} fresh={query === "new"} />;
  if (parts[0] === "d" && parts[1]) {
    const ref = normaliseRef(parts[1]);
    if (ref) return <Pick key={ref} refCode={ref} />;
  }
  return <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
