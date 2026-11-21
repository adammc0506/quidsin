import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeBalances,
  formatPence,
  groupTotal,
  parsePounds,
  simplifyDebts,
  splitByWeights,
  splitEqually,
  type Group,
  type Share,
} from "./lib/money";
import { normaliseReference } from "./lib/reference";
import { forgetGroup, getRecent, rememberGroup, store } from "./lib/store";

// ---------- tiny router ----------
// Kept in memory and mirrored to the URL hash where the host allows it
// (some embedded web views ignore hash paths).
let currentPath = window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : "/";
const listeners = new Set<() => void>();
function go(path: string) {
  currentPath = path;
  listeners.forEach((l) => l());
  try {
    if (window.location.hash !== "#" + path) window.location.hash = path;
  } catch {
    /* ignore */
  }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => {
  const h = window.location.hash;
  if (h.startsWith("#/") && h.slice(1) !== currentPath) {
    currentPath = h.slice(1);
    listeners.forEach((l) => l());
  }
});
function useRoute() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return currentPath.split("/").filter(Boolean);
}
/** Link that works with the in-memory router. */
function Link({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={"#" + to}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}

// ---------- per-device "which member am I" ----------
const meKey = (ref: string) => `quidsin.me.${ref}`;
function getMe(ref: string): string | null {
  try {
    return localStorage.getItem(meKey(ref));
  } catch {
    return null;
  }
}
function setMe(ref: string, id: string) {
  try {
    localStorage.setItem(meKey(ref), id);
  } catch {
    /* ignore */
  }
}

const shareUrl = (ref: string) => {
  // Inside the Android app the page is served from https://localhost, which is no use to friends.
  const isWebHost = window.location.protocol.startsWith("http") && window.location.hostname !== "localhost";
  const base = import.meta.env.VITE_PUBLIC_URL || (isWebHost ? window.location.origin + window.location.pathname : "");
  return base ? `${base.replace(/\/$/, "")}/#/g/${ref}` : ref;
};

export default function App() {
  const route = useRoute();
  let screen;
  if (route[0] === "new") screen = <NewGroup />;
  else if (route[0] === "g" && route[1]) screen = <GroupScreen reference={route[1]} sub={route[2]} />;
  else screen = <Home />;
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="logo">
          <span className="logo-mark">£</span>QuidsIn
        </Link>
        {store.mode === "demo" && <span className="pill warn">Demo mode</span>}
      </header>
      <main>{screen}</main>
    </div>
  );
}

// ---------- Home ----------
function Home() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const recent = getRecent();
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = normaliseReference(code);
    if (!ref) return setErr("That doesn't look like a QuidsIn reference (e.g. QI-7KQ4-M9X2).");
    go(`/g/${ref}`);
  };
  return (
    <div className="stack">
      <section className="hero">
        <h1>Split it. Sorted.</h1>
        <p>Share one reference, everyone's in. No app store, no sign-up, no daily limits.</p>
        <button className="btn primary big" onClick={() => go("/new")}>
          Start a new split
        </button>
      </section>

      <form className="card" onSubmit={join}>
        <h2>Got a reference?</h2>
        <div className="row">
          <input
            aria-label="Group reference"
            placeholder="QI-XXXX-XXXX"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErr("");
            }}
            autoCapitalize="characters"
          />
          <button className="btn">Join</button>
        </div>
        {err && <p className="error">{err}</p>}
      </form>

      {recent.length > 0 && (
        <section className="card">
          <h2>Your groups</h2>
          <ul className="list">
            {recent.map((g) => (
              <li key={g.reference}>
                <Link to={`/g/${g.reference}`} className="list-link">
                  <span>{g.name}</span>
                  <span className="muted mono">{g.reference}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {store.mode === "demo" && (
        <p className="muted small center">
          Demo mode: groups are saved on this device only. Add your Firebase settings to share groups between phones.
        </p>
      )}
    </div>
  );
}

// ---------- New group ----------
function NewGroup() {
  const [name, setName] = useState("");
  const [members, setMembers] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clean = members.map((m) => m.trim()).filter(Boolean);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr("Give the group a name.");
    if (clean.length < 2) return setErr("Add at least two people.");
    if (new Set(clean.map((c) => c.toLowerCase())).size !== clean.length) return setErr("Each person needs a different name.");
    setBusy(true);
    try {
      const ref = await store.createGroup(name.trim(), clean);
      rememberGroup({ reference: ref, name: name.trim() });
      go(`/g/${ref}`);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={create}>
      <h1>New split</h1>
      <label className="field">
        <span>Group name</span>
        <input placeholder="Mallorca 2027" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <fieldset className="field">
        <span>Who's in?</span>
        {members.map((m, i) => (
          <input
            key={i}
            placeholder={i === 0 ? "Your name" : `Person ${i + 1}`}
            value={m}
            onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
        <button type="button" className="btn ghost" onClick={() => setMembers([...members, ""])}>
          + Add another person
        </button>
      </fieldset>
      {err && <p className="error">{err}</p>}
      <button className="btn primary big" disabled={busy}>
        {busy ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}

// ---------- Group ----------
function GroupScreen({ reference, sub }: { reference: string; sub?: string }) {
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [me, setMeState] = useState<string | null>(() => getMe(reference));

  const load = useCallback(async () => {
    if (store.subscribe) return; // live updates already keep the group fresh
    try {
      const g = await store.getGroup(reference);
      setGroup(g);
      if (g) rememberGroup({ reference: g.reference, name: g.name });
    } catch (x) {
      setError((x as Error).message);
    }
  }, [reference]);

  useEffect(() => {
    if (store.subscribe) {
      // Live updates: everyone in the group sees changes straight away.
      return store.subscribe(
        reference,
        (g) => {
          setGroup(g);
          if (g) rememberGroup({ reference: g.reference, name: g.name });
        },
        (e) => setError(e.message),
      );
    }
    load();
  }, [load, reference]);

  if (error) return <p className="error">Couldn't load this group: {error}</p>;
  if (group === undefined) return <p className="muted center">Loading…</p>;
  if (group === null)
    return (
      <div className="stack center">
        <h1>Group not found</h1>
        <p className="muted">Check the reference {reference} and try again.</p>
        <button
          className="btn"
          onClick={() => {
            forgetGroup(reference);
            go("/");
          }}
        >
          Back home
        </button>
      </div>
    );

  if (!me || !group.members.some((m) => m.id === me))
    return (
      <PickMe
        group={group}
        onPick={(id) => {
          setMe(reference, id);
          setMeState(id);
        }}
        onAdded={load}
      />
    );

  if (sub === "add") return <AddExpense group={group} me={me} onSaved={load} />;
  return <GroupHome group={group} me={me} tab={sub ?? "expenses"} reload={load} />;
}

function PickMe({ group, onPick, onAdded }: { group: Group; onPick: (id: string) => void; onAdded: () => void }) {
  const [newName, setNewName] = useState("");
  return (
    <div className="stack">
      <h1>{group.name}</h1>
      <p>Which one are you?</p>
      <div className="chips">
        {group.members.map((m) => (
          <button key={m.id} className="btn chip" onClick={() => onPick(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = newName.trim();
          if (!n || group.members.some((m) => m.name.toLowerCase() === n.toLowerCase())) return;
          await store.addMember(group.reference, n);
          setNewName("");
          onAdded();
        }}
      >
        <input placeholder="Not listed? Add your name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn">Add</button>
      </form>
    </div>
  );
}

function GroupHome({ group, me, tab, reload }: { group: Group; me: string; tab: string; reload: () => void }) {
  const name = (id: string) => (id === me ? "You" : group.members.find((m) => m.id === id)?.name ?? "?");
  const balances = useMemo(() => computeBalances(group), [group]);
  const transfers = useMemo(() => simplifyDebts(balances), [balances]);
  const myBalance = balances.get(me) ?? 0;
  const [copied, setCopied] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fmt = (p: number) => formatPence(p, group.currency);

  const share = async () => {
    const url = shareUrl(group.reference);
    const text = `Join "${group.name}" on QuidsIn with reference ${group.reference}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "QuidsIn", text, url: url.startsWith("http") ? url : undefined });
        return;
      } catch {
        /* cancelled */
      }
    }
    const msg = url.startsWith("http") ? `${text}: ${url}` : text;
    let ok = false;
    try {
      await navigator.clipboard.writeText(msg);
      ok = true;
    } catch {
      // Fallback for web views without the clipboard API.
      const ta = document.createElement("textarea");
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="stack">
      <section className="group-head">
        <h1>{group.name}</h1>
        <button className="ref" onClick={share} title="Share reference">
          <span className="mono">{group.reference}</span>
          <span className="small">{copied ? "Copied" : "Share"}</span>
        </button>
        <div className={`summary ${myBalance > 0 ? "pos" : myBalance < 0 ? "neg" : ""}`}>
          {myBalance > 0 ? `You're owed ${fmt(myBalance)}` : myBalance < 0 ? `You owe ${fmt(-myBalance)}` : "You're all square"}
          <span className="muted small">Group total {fmt(groupTotal(group))}</span>
        </div>
      </section>

      <nav className="tabs">
        {[
          ["expenses", "Expenses"],
          ["balances", "Balances"],
          ["settle", "Settle up"],
        ].map(([id, label]) => (
          <Link key={id} to={`/g/${group.reference}/${id}`} className={tab === id ? "active" : ""}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "expenses" && (
        <section>
          {group.expenses.length === 0 ? (
            <p className="muted center">No expenses yet. Add the first one.</p>
          ) : (
            <ul className="list">
              {group.expenses.map((e) => (
                <li key={e.id} className="expense">
                  <div>
                    <strong>{e.description}</strong>
                    <span className="muted small">
                      {name(e.paidBy)} paid · {new Date(e.spentOn).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div className="right">
                    <strong>{fmt(e.amountPence)}</strong>
                    <button
                      className="link danger small"
                      onClick={async () => {
                        // Two taps instead of window.confirm, which is blocked in some web views.
                        if (pendingDelete !== e.id) return setPendingDelete(e.id);
                        setPendingDelete(null);
                        await store.deleteExpense(group.reference, e.id);
                        reload();
                      }}
                    >
                      {pendingDelete === e.id ? "Tap again to delete" : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {group.settlements.length > 0 && (
            <>
              <h3 className="muted small">Payments recorded</h3>
              <ul className="list">
                {group.settlements.map((s) => (
                  <li key={s.id} className="expense muted">
                    <span>
                      {name(s.from)} paid {name(s.to)}
                    </span>
                    <span>{fmt(s.amountPence)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === "balances" && (
        <section>
          <ul className="list">
            {group.members.map((m) => {
              const b = balances.get(m.id) ?? 0;
              return (
                <li key={m.id} className="expense">
                  <span>{name(m.id)}</span>
                  <span className={b > 0 ? "pos" : b < 0 ? "neg" : "muted"}>
                    {b > 0 ? `gets back ${fmt(b)}` : b < 0 ? `owes ${fmt(-b)}` : "square"}
                  </span>
                </li>
              );
            })}
          </ul>
          <AdSlot />
        </section>
      )}

      {tab === "settle" && (
        <section>
          {transfers.length === 0 ? (
            <p className="muted center">Everyone's square. Nothing to settle.</p>
          ) : (
            <>
              <p className="muted small">The fewest payments to clear every debt:</p>
              <ul className="list">
                {transfers.map((t, i) => (
                  <li key={i} className="expense">
                    <span>
                      <strong>{name(t.from)}</strong> pay{t.from === me ? "" : "s"}{" "}
                      <strong>{t.to === me ? "you" : name(t.to)}</strong>
                    </span>
                    <span className="right">
                      <strong>{fmt(t.amountPence)}</strong>
                      <button
                        className="link small"
                        onClick={async () => {
                          await store.addSettlement(group.reference, t.from, t.to, t.amountPence);
                          reload();
                        }}
                      >
                        Mark paid
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <AdSlot />
        </section>
      )}

      <button className="fab" onClick={() => go(`/g/${group.reference}/add`)} aria-label="Add expense">
        + Add expense
      </button>
    </div>
  );
}

/** Placeholder for a banner ad. Never shown on the add-expense screen. */
function AdSlot() {
  return (
    <aside className="ad" aria-label="Advertisement">
      <span className="small muted">Advertisement</span>
    </aside>
  );
}

// ---------- Add expense ----------
type Mode = "equal" | "exact" | "shares";

function AddExpense({ group, me, onSaved }: { group: Group; me: string; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(me);
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<Mode>("equal");
  const [included, setIncluded] = useState<Set<string>>(new Set(group.members.map((m) => m.id)));
  const [exact, setExact] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const total = parsePounds(amount);
  const fmt = (p: number) => formatPence(p, group.currency);

  const shares: Share[] | string = useMemo(() => {
    if (total === null || total <= 0) return "Enter an amount.";
    if (mode === "equal") {
      const ids = group.members.filter((m) => included.has(m.id)).map((m) => m.id);
      return ids.length ? splitEqually(total, ids) : "Pick at least one person.";
    }
    if (mode === "exact") {
      const list: Share[] = [];
      for (const m of group.members) {
        const v = exact[m.id]?.trim();
        if (!v) continue;
        const p = parsePounds(v);
        if (p === null) return `Check the amount for ${m.name}.`;
        if (p > 0) list.push({ memberId: m.id, pence: p });
      }
      const sum = list.reduce((s, x) => s + x.pence, 0);
      if (sum !== total) return `Amounts add up to ${fmt(sum)}, not ${fmt(total)}.`;
      return list;
    }
    const w = group.members.map((m) => ({ memberId: m.id, weight: Number(weights[m.id] ?? "1") || 0 }));
    const s = splitByWeights(total, w);
    return s.length ? s : "Give at least one person a share.";
  }, [total, mode, included, exact, weights, group.members, group.currency]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return setErr("What was it for?");
    if (typeof shares === "string") return setErr(shares);
    setBusy(true);
    try {
      await store.addExpense(group.reference, {
        description: description.trim(),
        amountPence: total!,
        paidBy,
        shares,
        spentOn,
      });
      onSaved();
      go(`/g/${group.reference}/expenses`);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  const preview = typeof shares === "string" ? null : new Map(shares.map((s) => [s.memberId, s.pence]));

  return (
    <form className="stack" onSubmit={save}>
      <div className="row between">
        <h1>Add expense</h1>
        <Link to={`/g/${group.reference}`} className="link">
          Cancel
        </Link>
      </div>
      <label className="field">
        <span>What for?</span>
        <input placeholder="Dinner at the harbour" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
      </label>
      <div className="row">
        <label className="field grow">
          <span>Amount (£)</span>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Paid by</span>
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {group.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === me ? `${m.name} (you)` : m.name}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Split</span>
        <div className="segmented">
          {(
            [
              ["equal", "Equally"],
              ["exact", "Exact £"],
              ["shares", "Shares"],
            ] as [Mode, string][]
          ).map(([id, label]) => (
            <button type="button" key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="list">
        {group.members.map((m) => (
          <li key={m.id} className="expense">
            {mode === "equal" ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={included.has(m.id)}
                  onChange={(e) => {
                    const next = new Set(included);
                    if (e.target.checked) next.add(m.id);
                    else next.delete(m.id);
                    setIncluded(next);
                  }}
                />
                {m.name}
              </label>
            ) : (
              <span>{m.name}</span>
            )}
            {mode === "exact" && (
              <input
                className="mini"
                inputMode="decimal"
                placeholder="0.00"
                value={exact[m.id] ?? ""}
                onChange={(e) => setExact({ ...exact, [m.id]: e.target.value })}
              />
            )}
            {mode === "shares" && (
              <input
                className="mini"
                inputMode="numeric"
                value={weights[m.id] ?? "1"}
                onChange={(e) => setWeights({ ...weights, [m.id]: e.target.value })}
              />
            )}
            {mode !== "exact" && <span className="muted small">{preview?.get(m.id) ? fmt(preview.get(m.id)!) : "—"}</span>}
          </li>
        ))}
      </ul>

      {err && <p className="error">{err}</p>}
      <button className="btn primary big" disabled={busy}>
        {busy ? "Saving…" : "Save expense"}
      </button>
    </form>
  );
}
