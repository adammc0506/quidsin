import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./whip.css";
import { StrictMode, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { formatPence, parsePounds } from "../lib/money";
import { adminLink, api, copy, mine, normaliseRef, potLink, shareOrCopy, type Pot } from "./api";

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
const fmt = (p: number) => formatPence(p);
const dateText = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });

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
            Whip-round
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
        Go to Whip-round home
      </a>
    </div>
  );
}

/** The gift tag: name, details and how much has been chipped in. */
function Tag({ pot, organiser }: { pot: Pot; organiser?: boolean }) {
  const pct = (n: number) => (pot.targetPence ? Math.min(100, Math.round((n / pot.targetPence) * 100)) : 0);
  const waiting = pot.totalPence - pot.receivedPence;
  return (
    <section className="tag" aria-label={pot.name}>
      <p className="kicker">{organiser ? "You're collecting" : "Whip-round"}</p>
      <h1>{pot.name}</h1>
      {pot.about && <p className="about">{pot.about}</p>}
      <p className="total">
        <span className="money">{fmt(pot.totalPence)}</span>
        <span>{pot.targetPence ? ` of ${fmt(pot.targetPence)}` : " chipped in"}</span>
      </p>
      {pot.targetPence ? (
        <div
          className="meter"
          role="img"
          aria-label={`${fmt(pot.totalPence)} chipped in of ${fmt(pot.targetPence)}, ${fmt(pot.receivedPence)} received`}
        >
          <span className="pledged" style={{ width: `${pct(pot.totalPence)}%` }} />
          <span className="received" style={{ width: `${pct(pot.receivedPence)}%` }} />
        </div>
      ) : null}
      <p className="sub">
        {pot.receivedPence > 0 || waiting > 0
          ? `${fmt(pot.receivedPence)} received${waiting > 0 ? `, ${fmt(waiting)} waiting to be confirmed` : ""}`
          : "Nobody has chipped in yet"}
      </p>
    </section>
  );
}

function Facts({ pot }: { pot: Pot }) {
  if (!pot.suggestedPence && !pot.closesOn) return null;
  return (
    <dl className="facts">
      {pot.suggestedPence ? (
        <div>
          <dt>Suggested</dt>
          <dd className="money">{fmt(pot.suggestedPence)} each</dd>
        </div>
      ) : null}
      {pot.closesOn ? (
        <div>
          <dt>Closes</dt>
          <dd>{dateText(pot.closesOn)}</dd>
        </div>
      ) : null}
    </dl>
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
    if (!ref) return setErr("That doesn't look like a code. It's on the invite, like WR-7KQ4-M9X2.");
    go(`/p/${ref}`);
  };
  return (
    <Shell>
      <section className="hero">
        <h1>Collect for a gift without the chasing</h1>
        <p className="lede">
          Start a whip-round, share one link, and see who has chipped in. Tick people off as the money arrives. We never
          touch it.
        </p>
        <button className="btn primary big" onClick={() => go("/new")}>
          Start a whip-round
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
            placeholder="WR-XXXX-XXXX"
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
            <strong>Start it</strong>
            <span>Say what it's for, and how people should pay you.</span>
          </li>
          <li>
            <strong>Share the link</strong>
            <span>People add their name and what they chipped in.</span>
          </li>
          <li>
            <strong>Tick off what you receive</strong>
            <span>You see who has paid and the running total.</span>
          </li>
        </ol>
      </section>

      {saved.length > 0 && (
        <section>
          <h2 className="h2">Your whip-rounds</h2>
          <ul className="list">
            {saved.map((s) => (
              <li key={s.ref}>
                <a href={s.admin ? `#/admin/${s.admin}` : `#/p/${s.ref}`}>
                  <strong>{s.name}</strong>
                  <span className="muted small">{s.admin ? "You're collecting" : "You chipped in"}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="fine">
        Free, from <a href="/">Tab &amp; Tally</a>. Whip-rounds are deleted after 30 days, or 3 months if you choose.{" "}
        <a href="/privacy/">Privacy</a>
      </p>
    </Shell>
  );
}

// ---------- start one ----------

function NewPot() {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [suggested, setSuggested] = useState("");
  const [target, setTarget] = useState("");
  const [closes, setCloses] = useState("");
  const [how, setHow] = useState("");
  const [showAmounts, setShowAmounts] = useState(false);
  const [long, setLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const money = (v: string, label: string): number | undefined | null => {
    if (!v.trim()) return undefined;
    const p = parsePounds(v);
    if (!p) {
      setErr(`${label} should be an amount, like 5 or 12.50.`);
      return null;
    }
    return p;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Say what the whip-round is for.");
    const s = money(suggested, "Suggested amount");
    const t = money(target, "Target");
    if (s === null || t === null) return;
    setBusy(true);
    try {
      const r = await api.create({
        name: name.trim(),
        about: about.trim() || undefined,
        suggestedPence: s,
        targetPence: t,
        closesOn: closes || undefined,
        howToPay: how.trim() || undefined,
        showAmounts,
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
        <h1 className="plain">New whip-round</h1>
        <label className="field">
          <span>What's it for?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah's leaving gift" maxLength={80} />
        </label>
        <label className="field">
          <span>Details (optional)</span>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="A spa voucher and a card. Sign the card by Friday."
          />
        </label>
        <div className="pair">
          <label className="field">
            <span>Suggested amount</span>
            <div className="prefix">
              <span aria-hidden="true">£</span>
              <input value={suggested} onChange={(e) => setSuggested(e.target.value)} inputMode="decimal" placeholder="5" />
            </div>
          </label>
          <label className="field">
            <span>Target total</span>
            <div className="prefix">
              <span aria-hidden="true">£</span>
              <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="150" />
            </div>
          </label>
        </div>
        <label className="field">
          <span>Closing date (optional)</span>
          <input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
        </label>
        <label className="field">
          <span>How should people pay you?</span>
          <textarea
            value={how}
            onChange={(e) => setHow(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Bank transfer to Sarah's gift fund, details in the group chat"
          />
          <small className="muted">Don't type account or card numbers here. Share those privately.</small>
        </label>

        <label className="check">
          <input type="checkbox" checked={showAmounts} onChange={(e) => setShowAmounts(e.target.checked)} />
          <span>
            <strong>Show who gave what</strong>
            <small className="muted">
              {showAmounts ? "Everyone sees each amount." : "Off: people see names and the total, but only you see amounts."}
            </small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} />
          <span>
            <strong>Keep for 3 months</strong>
            <small className="muted">Deleted after {long ? "3 months" : "30 days"}, with everything in it.</small>
          </span>
        </label>

        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Creating…" : "Create whip-round"}
        </button>
      </form>
    </Shell>
  );
}

// ---------- a contributor's page ----------

function Contribute({ refCode }: { refCode: string }) {
  const [pot, setPot] = useState<Pot | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState(mine.myName());
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [done, setDone] = useState(false);
  const load = useCallback(() => api.pot(refCode).then(setPot, (e) => setErr(e.message)), [refCode]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (pot) {
      mine.save({ ref: pot.reference, name: pot.name });
      setAmount((a) => a || (pot.suggestedPence ? (pot.suggestedPence / 100).toFixed(2).replace(/\.00$/, "") : ""));
    }
  }, [pot?.reference]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!pot) return <Shell back="/"><Loading /></Shell>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormErr("");
    const p = parsePounds(amount);
    if (!name.trim()) return setFormErr("Add your name so the organiser can tick you off.");
    if (!p) return setFormErr("Enter how much you chipped in, like 5 or 12.50.");
    setBusy(true);
    try {
      await api.chipIn(pot.reference, name.trim(), p);
      mine.rememberName(name.trim());
      setDone(true);
      setAmount("");
      load();
    } catch (x) {
      setFormErr((x as Error).message);
    }
    setBusy(false);
  };

  return (
    <Shell back="/">
      <div className="stack">
        <Tag pot={pot} />
        <Facts pot={pot} />

        {pot.howToPay && (
          <section className="card how">
            <h2 className="h2">How to pay</h2>
            <p className="wrap">{pot.howToPay}</p>
          </section>
        )}

        {pot.closed ? (
          <p className="card">This whip-round is closed, so no more contributions can be added.</p>
        ) : done ? (
          <section className="card thanks" role="status">
            <h2 className="h2">Thanks, you're on the list</h2>
            <p>The organiser will tick you off when they've received it. Pay them using the details above if you haven't yet.</p>
            <button className="link" onClick={() => setDone(false)}>
              Add another contribution
            </button>
          </section>
        ) : (
          <form className="card" onSubmit={submit}>
            <h2 className="h2">I've chipped in</h2>
            <p className="muted small">Pay the organiser first, then add yourself here. This page doesn't take payments.</p>
            <label className="field">
              <span>Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" />
            </label>
            <label className="field">
              <span>Amount</span>
              <div className="prefix">
                <span aria-hidden="true">£</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="5" />
              </div>
            </label>
            {formErr && <p className="error" role="alert">{formErr}</p>}
            <button className="btn primary" disabled={busy}>
              {busy ? "Adding…" : "Add me to the list"}
            </button>
          </form>
        )}

        {pot.entries.length > 0 && (
          <section>
            <h2 className="h2">Who's chipped in</h2>
            <ul className="people">
              {pot.entries.map((e) => (
                <li key={e.id}>
                  <span>{e.name}</span>
                  <span className="right">
                    {e.amountPence ? <span className="money">{fmt(e.amountPence)}</span> : null}
                    <span className={e.confirmed ? "ok" : "muted small"}>{e.confirmed ? "Received" : "Says paid"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Shell>
  );
}

// ---------- organiser ----------

function Admin({ token, fresh }: { token: string; fresh: boolean }) {
  const [pot, setPot] = useState<Pot | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const load = useCallback(() => api.admin(token).then(setPot, (e) => setErr(e.message)), [token]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (pot) mine.save({ ref: pot.reference, name: pot.name, admin: token });
  }, [pot?.reference, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Shell back="/"><Problem msg={err} /></Shell>;
  if (!pot) return <Shell back="/"><Loading /></Shell>;

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 2500);
  };
  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      if (okMsg) flash(okMsg);
      load();
    } catch (x) {
      flash((x as Error).message);
    }
  };

  return (
    <Shell back="/">
      <div className="stack">
        <Tag pot={pot} organiser />

        {fresh && (
          <div className="card warn">
            <strong>Save this page.</strong>
            <p>This organiser link is the only way back here on another phone. Don't share it.</p>
            <button className="btn" onClick={async () => flash((await copy(adminLink(token))) === "copied" ? "Organiser link copied" : "Couldn't copy")}>
              Copy organiser link
            </button>
          </div>
        )}

        <div className="card invite">
          <p>Send this link to everyone who might chip in.</p>
          <p className="ref">{pot.reference}</p>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await shareOrCopy(pot.name, `Chip in for ${pot.name}:`, potLink(pot.reference));
              if (r === "copied") flash("Invite copied");
            }}
          >
            Share the invite
          </button>
        </div>
        {note && <p className="toast" role="status">{note}</p>}

        <Facts pot={pot} />

        <section>
          <h2 className="h2">
            {pot.entries.length === 0 ? "Nobody yet" : `${pot.entries.length} ${pot.entries.length === 1 ? "contribution" : "contributions"}`}
          </h2>
          {pot.entries.length > 0 && (
            <p className="muted small">Tick each one when the money has reached you.</p>
          )}
          <ul className="people">
            {pot.entries.map((e) => (
              <li key={e.id} className="entry">
                <label className="tick">
                  <input
                    type="checkbox"
                    checked={e.confirmed}
                    onChange={(ev) => {
                      // Update straight away, then tell the server; reload if it fails.
                      const confirmed = ev.target.checked;
                      const amount = e.amountPence ?? 0;
                      setPot({
                        ...pot,
                        receivedPence: pot.receivedPence + (confirmed ? amount : -amount),
                        entries: pot.entries.map((x) => (x.id === e.id ? { ...x, confirmed } : x)),
                      });
                      api.confirm(token, e.id, confirmed).catch((x) => {
                        flash((x as Error).message);
                        load();
                      });
                    }}
                  />
                  <span>
                    <strong>{e.name}</strong>
                    <small className={e.confirmed ? "ok" : "muted"}>{e.confirmed ? "Received" : "Says paid"}</small>
                  </span>
                </label>
                <span className="right">
                  <span className="money">{fmt(e.amountPence ?? 0)}</span>
                  <button
                    className={`link small ${removing === e.id ? "danger" : "quiet"}`}
                    aria-label={`Remove ${e.name}`}
                    onClick={() => {
                      if (removing !== e.id) return setRemoving(e.id);
                      setRemoving(null);
                      act(() => api.remove(token, e.id));
                    }}
                  >
                    {removing === e.id ? "Tap again" : "Remove"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card quiet-card">
          <h2 className="h2">{pot.closed ? "Closed" : "Open for contributions"}</h2>
          <p className="muted small">
            {pot.closed ? "Nobody can add more until you reopen it." : "Close it when you've collected enough."}
          </p>
          <button className="btn" onClick={() => act(() => api.close(token, !pot.closed), pot.closed ? "Reopened" : "Closed")}>
            {pot.closed ? "Reopen" : "Close the whip-round"}
          </button>
        </section>

        <p className="muted small">
          Deletes on {new Date(pot.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.{" "}
          {pot.canExtend && (
            <button className="link" onClick={() => act(() => api.extend(token), "Kept for another month")}>
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
  if (parts[0] === "new") return <NewPot />;
  if (parts[0] === "admin" && parts[1]) return <Admin key={parts[1]} token={parts[1]} fresh={query === "new"} />;
  if (parts[0] === "p" && parts[1]) {
    const ref = normaliseRef(parts[1]);
    if (ref) return <Contribute key={ref} refCode={ref} />;
  }
  return <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
