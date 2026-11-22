import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./hub.css";

// Old QuidsIn links looked like https://host/#/g/QI-XXXX-XXXX. Send them to the app.
if (location.hash.startsWith("#/")) location.replace("/quidsin/" + location.hash);

// ---------- "My stuff": everything this phone has created or joined ----------

type Row = { label: string; name: string; href: string; keeper: boolean };
const read = (key: string): Record<string, string>[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const rows: Row[] = [];
for (const g of read("quidsin.recent"))
  if (g.reference) rows.push({ label: "QuidsIn", name: g.name || g.reference, href: `/quidsin/#/g/${g.reference}`, keeper: false });
const tools: [string, string, string, string, string][] = [
  // [storage key, label, path, watcher route, keeper wording]
  ["santa:mine", "Secret Santa", "/santa/", "d", "Organiser"],
  ["whip:mine", "Whip-round", "/whipround/", "p", "Organiser"],
  ["tally:mine", "Tally", "/tally/", "b", "Scorekeeper"],
  ["killer:mine", "Killer Pool", "/killerpool/", "g", "Referee"],
  ["sweep:mine", "Sweepstake", "/sweepstake/", "s", "Organiser"],
  ["quiz:mine", "Quiz Night", "/quiz/", "q", "Quizmaster"],
  ["league:mine", "League", "/league/", "l", "Organiser"],
];
for (const [key, label, path, route] of tools)
  for (const e of read(key)) {
    if (!e.ref) continue;
    const href = e.admin ? `${path}#/admin/${e.admin}` : e.token ? `${path}#/me/${e.token}` : `${path}#/${route}/${e.ref}`;
    rows.push({ label, name: e.name || e.ref, href, keeper: !!e.admin });
  }
const box = document.getElementById("mine");
const list = document.getElementById("mine-list");
if (box && list && rows.length) {
  for (const r of rows.slice(0, 40)) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = r.href;
    const strong = document.createElement("strong");
    strong.textContent = r.name;
    const tool = document.createElement("span");
    tool.className = "tool" + (r.keeper ? " keeper" : "");
    tool.textContent = r.keeper ? `${r.label}, yours` : r.label;
    a.append(strong, tool);
    li.append(a);
    list.append(li);
  }
  box.hidden = false;
}
