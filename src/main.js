import { Stage } from "./stage.js";
import * as audio from "./audio.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

// Each part of the statement is heard by a few audiences. Each audience has a hidden taste per
// option style (-3..+3, dev-only); every taste point is worth PER_TASTE. The judges then read the
// finished statement as a whole and add -5..+5 per audience.
const PER_TASTE = 10;

const state = { pack: null, picks: [], active: 0, order: [], started: false, busy: false, result: null };
let stage;

async function boot() {
  const params = new URLSearchParams(location.search);
  const index = await fetch("packs/index.json", { cache: "no-cache" }).then((r) => r.json());
  // Daily rotation through the scheduled packs; ?pack=<id> forces one.
  const day = Math.floor(Date.now() / 86400000);
  const id = params.get("pack") || index.schedule[day % index.schedule.length];
  const entry = index.packs.find((p) => p.id === id) || index.packs[0];
  state.pack = await fetch(entry.file, { cache: "no-cache" }).then((r) => r.json());

  $("edition").textContent = `No. ${String(state.pack.edition || 1).padStart(3, "0")}`;
  $("dateline").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const src = (state.pack.sources || []).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(" · ");
  $("foot").innerHTML = `<p>${esc(state.pack.parody)}</p>${src ? `<p class="sources">Questions and facts from real reporting: ${src}</p>` : ""}`;

  setupMute();
  stage = new Stage($("stage"));
  stage.loadCharacter(state.pack.character, () => $("loading")?.remove());
  intro();
}

function setupMute() {
  const b = $("mute");
  const paint = () => {
    const m = audio.isMuted();
    b.classList.toggle("off", m);
    b.setAttribute("aria-pressed", String(!m));
    b.title = m ? "Sound off" : "Sound on";
    b.querySelector("span").textContent = m ? "Off" : "On";
  };
  b.onclick = () => {
    audio.setMuted(!audio.isMuted());
    audio.start();
    paint();
  };
  paint();
}

const blanks = () => state.pack.statement.blanks;
const filled = () => state.picks.filter(Boolean).length;

function renderScore() {
  $("total").innerHTML = state.result ? `<span>${state.result.total}</span><small>pts</small>` : "";
}

function renderDots() {
  const d = $("dots");
  d.innerHTML = "";
  blanks().forEach((_, i) => {
    const s = el("span", "", String(i + 1));
    if (state.picks[i]) s.className = "done";
    if (state.started && !state.result && i === state.active) s.className = "on";
    d.appendChild(s);
  });
}

function setTicker(lines) {
  const all = lines.length ? lines : ["Cameras outside his house", "Interim CEO in charge", "Investors want him back", "Washington wants a briefing"];
  $("ticker").innerHTML = [...all, ...all].map((h) => `<span>${esc(h)}</span>`).join("");
}

function clearStamps() {
  const s = $("stamps");
  s.classList.add("fade");
  setTimeout(() => {
    s.innerHTML = "";
    s.classList.remove("fade");
  }, 450);
}

function stamp(text, cls, spot, delay = 0) {
  const st = el("div", `stamp ${cls}`, esc(text));
  Object.assign(st.style, { left: spot.left || "auto", right: spot.right || "auto", bottom: spot.bottom });
  st.style.setProperty("--r", spot.r);
  st.style.animationDelay = `${delay}s`;
  $("stamps").appendChild(st);
  setTimeout(() => audio.sfx.stamp(), delay * 1000 + 120);
}

function flash() {
  const f = $("flash");
  f.classList.remove("go");
  void f.offsetWidth;
  f.classList.add("go");
  stage?.flash();
  audio.sfx.shutter();
}

function showQuestion(b) {
  const q = $("qcard");
  if (!b) {
    q.hidden = true;
    return;
  }
  q.hidden = false;
  q.style.animation = "none";
  void q.offsetWidth;
  q.style.animation = "";
  $("qOutlet").textContent = b.outlet;
  $("qAsker").textContent = b.asker;
  $("qText").textContent = b.question;
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// ---------- screens ----------

function intro() {
  Object.assign(state, { picks: [], active: 0, started: false, busy: false, result: null });
  state.order = blanks().map((b) => shuffle(b.options));
  renderDots();
  renderScore();
  setTicker([]);
  showQuestion(null);
  clearStamps();
  stage?.setFace("neutral", { flash: false });
  audio.music(0.16);

  const s = state.pack.setup;
  const p = $("panel");
  p.innerHTML = "";
  const rules = el("div", "rules");
  rules.innerHTML = `
    <div class="label">How it works</div>
    <ol>
      <li><b>He has one statement to read.</b> It has ${blanks().length} blanks.</li>
      <li><b>Fill each blank.</b> Pick a line from the list, or write your own.</li>
      <li><b>Read the room.</b> Wall Street, Washington, Beijing, the board, the internet and more are all listening. The same line can win one and lose another.</li>
      <li><b>The judges read the whole statement</b> as each audience, then the front page decides his fate.</li>
    </ol>`;
  const go = el("button", "btn", "Write his statement →");
  go.onclick = () => {
    audio.start();
    audio.sfx.select();
    state.started = true;
    editor();
  };
  const row = el("div", "row");
  row.append(go);
  p.append(el("span", "kicker", esc(s.kicker)), el("h1", "headline", esc(s.headline)), el("p", "dek", esc(s.dek)), rules, row);
}

// The statement with blanks, plus the picker for the active blank.
function editor() {
  state.busy = false;
  state.result = null;
  clearStamps();
  renderDots();
  renderScore();
  audio.music(0.1);
  const st = state.pack.statement;
  const p = $("panel");
  p.innerHTML = "";
  p.append(el("div", "label", `${esc(st.title)} · Draft`));
  if (st.note) p.append(el("p", "fine", esc(st.note)));

  const doc = el("div", "release");
  st.template.split(/\{(\d+)\}/).forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) doc.append(document.createTextNode(part));
      return;
    }
    const n = Number(part);
    const pick = state.picks[n];
    // a span, not a button, so long picks wrap inline with the sentence
    const b = el("span", `blank${pick ? " set" : ""}${n === state.active ? " active" : ""}`);
    b.setAttribute("role", "button");
    b.tabIndex = 0;
    b.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        b.click();
      }
    };
    b.innerHTML = pick ? `${esc(pick.text)}<i>▾</i>` : `<span class="ph">${n + 1}</span><i>▾</i>`;
    b.setAttribute("aria-label", `Blank ${n + 1}${pick ? `: ${pick.text}` : ", empty"}`);
    b.onclick = () => {
      audio.sfx.tick(false);
      state.active = n;
      editor();
      $("panel").querySelector(".picker")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    doc.append(b);
  });
  p.append(doc);

  const row = el("div", "write-row");
  row.append(el("span", "count", `${filled()} of ${blanks().length} filled`));
  const send = el("button", "btn", "Release statement →");
  send.disabled = filled() < blanks().length;
  send.onclick = release;
  row.append(send);

  p.append(picker(state.active));
  p.append(row);
  showQuestion(null);
}

function picker(n) {
  const b = blanks()[n];
  const box = el("div", "picker");
  box.append(el("div", "sub", `Blank ${n + 1}`));
  const opts = el("div", "options");
  state.order[n].forEach((o, i) => {
    const btn = el("button", `opt${state.picks[n]?.text === o.text ? " chosen" : ""}`);
    btn.innerHTML = `<span class="opt-key">${i + 1}</span><span class="opt-body"><span class="opt-text">${esc(o.text)}</span></span>`;
    btn.onclick = () => choose(n, o);
    opts.append(btn);
  });
  box.append(opts);

  // or write your own
  const own = el("form", "own");
  const typed = state.picks[n]?.typed ? state.picks[n].text : "";
  own.innerHTML = `<label class="sub" for="own-${n}">Or write your own</label><div class="own-row"><input id="own-${n}" maxlength="${MAX_OWN}" autocomplete="off" placeholder="${esc(b.hint || "Type anything")}" value="${esc(typed)}" /><button class="btn" type="submit">Use it</button></div>`;
  own.onsubmit = (e) => {
    e.preventDefault();
    const v = clean(own.querySelector("input").value);
    if (v.length < 2) return;
    choose(n, { style: null, text: v, typed: true });
  };
  box.append(own);
  return box;
}

const MAX_OWN = 90;
// tidy a typed fill-in so it sits inside the sentence
function clean(v) {
  return String(v).replace(/\s+/g, " ").trim().replace(/^["“”']+|["“”']+$/g, "").replace(/[.\s]+$/, "").slice(0, MAX_OWN);
}

function choose(n, o) {
  audio.sfx.select();
  state.picks[n] = o;
  stage.setFace(o.typed ? "nervous" : state.pack.faces.byStyle?.[o.style] || "neutral");
  // move on to the next empty blank, if any
  const next = blanks().findIndex((_, i) => !state.picks[i]);
  if (next >= 0) state.active = next;
  editor();
  if (next < 0) {
    toast("Statement ready. Release it.");
    $("panel").querySelector(".write-row .btn")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } else if (window.innerWidth <= 860) {
    $("panel").querySelector(".release")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

function fullText() {
  return state.pack.statement.template
    .replace(/\{(\d+)\}/g, (_, n) => state.picks[Number(n)]?.text || "___")
    .replace(/([?!])\./g, "$1");
}

// Base points per audience: its taste for every part it was listening to.
function baseScores(ratings = {}) {
  const pack = state.pack;
  const ids = [...new Set(blanks().flatMap((b) => b.groups))];
  return ids.map((id) => {
    const g = pack.groups[id];
    let base = 0;
    let heard = 0;
    blanks().forEach((b, i) => {
      if (!b.groups.includes(id)) return;
      heard++;
      const pick = state.picks[i];
      const t = pick.typed ? ratings[i]?.[id] ?? 0 : g.taste[pick.style] || 0;
      base += t * PER_TASTE;
    });
    return { id, name: g.name, kind: g.kind, base, heard };
  });
}

// The judges (Claude, server side) read the whole statement as each audience.
// If they are not set up or are slow, use the pack's canned lines.
async function react(base) {
  const pack = state.pack;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch("api/react", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: pack.subject,
        role: pack.role,
        context: pack.context,
        statement: fullText(),
        typed: blanks()
          .map((b, i) => (state.picks[i]?.typed ? { blank: i, text: state.picks[i].text, before: before(i), groups: b.groups } : null))
          .filter(Boolean),
        groups: base.map((b) => ({ id: b.id, name: b.name, kind: b.kind, persona: pack.groups[b.id].persona, base: b.base })),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const j = await res.json();
      if (j.groups?.length) return j;
    } else console.warn("judges:", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.warn("judges:", e?.message || e);
  }
  return {
    judge: "local",
    groups: base.map((b) => {
      const avg = b.base / PER_TASTE / Math.max(1, b.heard);
      const lines = pack.groups[b.id].lines;
      return { id: b.id, bonus: 0, line: avg >= 2 ? lines.love : avg >= 0.75 ? lines.like : avg > -0.75 ? lines.meh : lines.hate };
    }),
  };
}

// the template text leading into blank i, for context
function before(i) {
  const t = state.pack.statement.template;
  const at = t.indexOf(`{${i}}`);
  return t.slice(Math.max(0, at - 120), at).replace(/\{\d+\}/g, "…");
}

function tierOf(n) {
  return n >= 240 ? "great" : n >= 120 ? "good" : n >= 0 ? "meh" : n >= -120 ? "bad" : "awful";
}

async function release() {
  if (state.busy || filled() < blanks().length) return;
  state.busy = true;
  audio.sfx.select();
  audio.music(0.12);
  showQuestion(null);
  const pack = state.pack;
  let base = baseScores();
  const typedHeard = (id) => blanks().some((b, i) => state.picks[i].typed && b.groups.includes(id));

  const p = $("panel");
  p.innerHTML = "";
  p.append(el("div", "label", "Going to print"));
  p.append(el("p", "quote statement", `“${esc(fullText())}”`));

  const table = el("div", "board");
  base.forEach((b) => {
    const row = el("div", "brow");
    row.dataset.id = b.id;
    row.innerHTML = `<div class="brow-top"><span class="brow-name">${esc(b.name)} <small>${esc(b.kind)}</small></span><span class="pts ${typedHeard(b.id) ? "" : b.base > 0 ? "pos" : b.base < 0 ? "neg" : ""}">${typedHeard(b.id) ? "…" : sign(b.base)}</span><span class="bonus wait">…</span></div><div class="brow-line"><span class="dots3"><i></i><i></i><i></i></span></div>`;
    table.appendChild(row);
  });
  const tot = el("div", "brow total-row");
  tot.innerHTML = `<div class="brow-top"><span class="brow-name">Total</span><b class="round-total">…</b></div>`;
  table.appendChild(tot);
  p.append(el("div", "sub", "The judges, as each audience"));
  p.append(table);
  stage.setFace("nervous", { flash: false });

  const v = await react(base);
  // the judges rated each typed fill-in for every audience that heard it
  const ratings = {};
  (v.typed || []).forEach((t) => {
    ratings[t.blank] = Object.fromEntries((t.ratings || []).map((r) => [r.id, Math.max(-3, Math.min(3, Math.round(Number(r.rating) || 0)))]));
  });
  base = baseScores(ratings);
  const byId = new Map(v.groups.map((g) => [g.id, g]));
  let sum = 0;
  base.forEach((b, i) => {
    const g = byId.get(b.id) || { bonus: 0, line: "" };
    sum += b.base + g.bonus;
    const row = table.querySelector(`.brow[data-id="${b.id}"]`);
    const pt = row.querySelector(".pts");
    pt.textContent = sign(b.base);
    pt.className = `pts ${b.base > 0 ? "pos" : b.base < 0 ? "neg" : ""}`;
    const bo = row.querySelector(".bonus");
    bo.classList.remove("wait");
    bo.textContent = v.judge === "claude" ? `${sign(g.bonus)} judges` : "";
    bo.classList.toggle("pos", g.bonus > 0);
    bo.classList.toggle("neg", g.bonus < 0);
    row.querySelector(".brow-line").innerHTML = `“${esc(g.line)}”`;
    row.style.animationDelay = `${i * 0.06}s`;
    row.classList.add(b.base + g.bonus > 0 ? "up" : b.base + g.bonus < 0 ? "down" : "flat");
  });
  const tier = tierOf(sum);
  const headlines = v.headlines?.length ? v.headlines : pack.headlines[tier];
  const end = pack.endings.find((e) => sum >= e.min) || pack.endings[pack.endings.length - 1];
  const rank = pack.endings.indexOf(end);
  state.result = { total: sum, headlines, end };

  const rt = tot.querySelector(".round-total");
  rt.className = `round-total ${sum > 0 ? "pos" : sum < 0 ? "neg" : ""}`;
  countUp(rt, sum);
  if (v.judge !== "claude") p.append(el("p", "fine", "Judges are offline right now; scored on the audiences' tastes only."));

  flash();
  stage.setFace(end.face || v.face || pack.faces[tier] || "neutral");
  $("stamps").innerHTML = "";
  stamp(end.headline, rank <= 1 ? "green" : "red", { left: "5%", bottom: "17%", r: "-6deg" }, 0.2);
  if (headlines[0]) stamp(headlines[0], "ink small", { right: "5%", bottom: "8%", r: "3deg" }, 0.6);
  setTimeout(() => (rank <= 1 ? audio.sfx.fanfare() : sum < 0 ? audio.sfx.bad() : audio.sfx.good()), 700);
  renderDots();
  renderScore();
  setTicker([end.headline, ...headlines]);

  const front = el("div", "front");
  front.append(el("span", "kicker", esc(end.kicker)), el("h1", "headline", esc(end.headline)), el("p", "dek", `${esc(end.dek)} <b class="sum">${sum} pts</b>`));
  const ul = el("ul", "heads");
  headlines.forEach((h) => ul.appendChild(el("li", "", esc(h))));
  front.append(ul);
  const row = el("div", "row");
  const share = el("button", "btn", "Copy result");
  share.onclick = () => copyResult(end, sum, headlines);
  const edit = el("button", "btn ghost", "Rewrite it");
  edit.onclick = () => {
    audio.sfx.select();
    state.active = 0;
    editor();
  };
  const again = el("button", "btn ghost", "Start over");
  again.onclick = intro;
  row.append(share, edit, again);
  front.append(row);
  p.prepend(front);
}

function countUp(node, to) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 900);
    node.textContent = sign(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function copyResult(end, sum, headlines) {
  const lines = [
    `PRESS CYCLE · ${state.pack.title}`,
    `${end.headline} ${sum} pts`,
    ...headlines.map((h) => `■ ${h}`),
    location.origin + location.pathname,
  ];
  const text = lines.join("\n");
  const done = () => toast("Copied. Go spread it.");
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => toast(text));
  else toast(text);
}

function toast(msg) {
  const t = el("div", "toast", esc(msg));
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

boot().catch((e) => {
  console.error(e);
  $("panel").innerHTML = `<p class="dek">Couldn't load today's story: ${esc(e.message)}</p>`;
});
