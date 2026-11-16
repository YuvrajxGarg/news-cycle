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

const ROUNDS = 5;
const PER_TASTE = 10; // each taste step is worth 10 points per audience

const state = { pack: null, round: 0, picks: [], started: false, busy: false, timer: null };
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
  document.addEventListener("keydown", onKey);
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

const total = () => state.picks.reduce((n, p) => n + p.points, 0);

function renderScore() {
  $("total").innerHTML = state.started ? `<span>${total()}</span><small>pts</small>` : "";
}

function renderDots() {
  const d = $("dots");
  d.innerHTML = "";
  for (let i = 0; i < ROUNDS; i++) {
    const s = el("span", "", String(i + 1));
    const p = state.picks[i];
    if (p) s.className = p.points >= 40 ? "good" : p.points < 0 ? "bad" : "done";
    else if (i === state.round && state.started) s.className = "on";
    d.appendChild(s);
  }
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

function showQuestion(r) {
  const q = $("qcard");
  q.hidden = false;
  q.style.animation = "none";
  void q.offsetWidth;
  q.style.animation = "";
  $("qOutlet").textContent = r.outlet;
  $("qAsker").textContent = r.asker;
  $("qText").textContent = r.question;
}


// One audience card: who they are and what they want. Style tastes stay hidden (dev-only categories).
function groupCard(id) {
  const g = state.pack.groups[id];
  const card = el("div", "aud");
  card.dataset.id = id;
  card.innerHTML = `<div class="aud-top"><span class="aud-name">${esc(g.name)}</span><span class="aud-kind">${esc(g.kind)}</span></div><p class="aud-wants">${esc(g.wants || g.persona)}</p>`;
  return card;
}

// ---------- screens ----------

function stopTimer() {
  state.timer = null;
}

function intro() {
  stopTimer();
  Object.assign(state, { round: 0, picks: [], started: false, busy: false });
  renderDots();
  renderScore();
  setTicker([]);
  $("qcard").hidden = true;
  clearStamps();
  stage?.setFace("neutral", { flash: false });
  audio.music(0.16);

  const s = state.pack.setup;
  const p = $("panel");
  p.innerHTML = "";
  const rules = el("div", "rules");
  rules.innerHTML = `
    <div class="label">How you score</div>
    <ol>
      <li><b>A real reporter asks a real question.</b> Pick one of five answers for him.</li>
      <li><b>Four audiences are listening.</b> Each card says what they want. Each audience gives your answer from <b>−30</b> to <b>+30</b>, depending on how well its tone suits them.</li>
      <li><b>The exact line matters.</b> The judges read your exact answer as each audience and add up to <b>±5</b> each for how it lands.</li>
    </ol>`;
  const go = el("button", "btn", "Start the cycle →");
  go.onclick = () => {
    audio.start();
    audio.sfx.select();
    state.started = true;
    question();
  };
  const row = el("div", "row");
  row.append(go);
  p.append(el("span", "kicker", esc(s.kicker)), el("h1", "headline", esc(s.headline)), el("p", "dek", esc(s.dek)), rules, row);
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function question() {
  const r = state.pack.rounds[state.round];
  state.busy = false;
  renderDots();
  renderScore();
  clearStamps();
  stage.setFace("neutral", { flash: false });
  showQuestion(r);
  audio.music(0.07);

  const p = $("panel");
  p.innerHTML = "";
  p.append(el("div", "label", `Round ${state.round + 1} of ${ROUNDS} · Pick his answer`));
  if (r.source) p.append(el("p", "fine src", `<b>Real story:</b> ${esc(r.source)}`));


  p.append(el("div", "sub", "Who's listening"));
  const auds = el("div", "auds");
  r.groups.forEach((id) => auds.appendChild(groupCard(id)));
  p.append(auds);

  p.append(el("div", "sub", "His answer"));
  const opts = el("div", "options");
  shuffle(r.options).forEach((o, i) => {
    const b = el("button", "opt");
    b.innerHTML = `<span class="opt-key">${i + 1}</span><span class="opt-body"><span class="opt-text">${esc(o.text)}</span></span>`;
    b.onclick = () => answer(r, o, false);
    opts.appendChild(b);
  });
  p.append(opts);

  state.timer = { live: true };
}

function onKey(e) {
  if (!state.timer || state.busy) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 5) {
    const b = $("panel").querySelectorAll(".opt")[n - 1];
    if (b) b.click();
  }
}

// The judges (Claude, server side) read the line as each audience. If it isn't set up or is slow, use the pack's lines.
async function react(r, opt, base) {
  const pack = state.pack;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch("api/react", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: pack.subject,
        role: pack.role,
        context: pack.context,
        asker: `${r.asker}, ${r.outlet}`,
        question: r.question,
        style: opt.style,
        statement: opt.text,
        groups: base.map((b) => ({ id: b.id, name: b.name, kind: b.kind, persona: pack.groups[b.id].persona, base: b.base })),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const j = await res.json();
      if (j.groups?.length) return j;
    }
  } catch {
    /* fall through to the pack's own lines */
  }
  return {
    judge: "local",
    groups: base.map((b) => {
      const t = pack.groups[b.id].taste[opt.style] || 0;
      const lines = pack.groups[b.id].lines;
      return { id: b.id, bonus: 0, line: t >= 3 ? lines.love : t >= 1 ? lines.like : t === 0 ? lines.meh : lines.hate };
    }),
  };
}

function tierOf(n) {
  return n >= 60 ? "great" : n >= 30 ? "good" : n >= 0 ? "meh" : n >= -30 ? "bad" : "awful";
}

async function answer(r, opt, timedOut) {
  if (state.busy) return;
  state.busy = true;
  stopTimer();
  const speed = 0;
  if (!timedOut) audio.sfx.select();
  audio.music(0.12);

  const pack = state.pack;
  const base = r.groups.map((id) => {
    const g = pack.groups[id];
    return { id, name: g.name, kind: g.kind, base: (g.taste[opt.style] || 0) * PER_TASTE };
  });

  const p = $("panel");
  p.innerHTML = "";
  p.append(el("div", "label", `Round ${state.round + 1} · ${timedOut ? "Out of time" : "Going to print"}`));
  p.append(el("p", "quote", `“${esc(opt.text)}”`));

  const table = el("div", "board");
  base.forEach((b) => {
    const row = el("div", "brow");
    row.dataset.id = b.id;
    row.innerHTML = `<div class="brow-top"><span class="brow-name">${esc(b.name)} <small>${esc(b.kind)}</small></span><span class="pts ${b.base > 0 ? "pos" : b.base < 0 ? "neg" : ""}">${sign(b.base)}</span><span class="bonus wait">…</span></div><div class="brow-line"><span class="dots3"><i></i><i></i><i></i></span></div>`;
    table.appendChild(row);
  });
  const tot = el("div", "brow total-row");
  tot.innerHTML = `<div class="brow-top"><span class="brow-name">Round total</span><b class="round-total">…</b></div>`;
  table.appendChild(tot);
  p.append(table);
  stage.setFace("nervous", { flash: false });

  const v = await react(r, opt, base);
  const byId = new Map(v.groups.map((g) => [g.id, g]));
  let sum = speed;
  base.forEach((b, i) => {
    const g = byId.get(b.id) || { bonus: 0, line: "" };
    sum += b.base + g.bonus;
    const row = table.querySelector(`.brow[data-id="${b.id}"]`);
    const bo = row.querySelector(".bonus");
    bo.classList.remove("wait");
    bo.textContent = v.judge === "claude" ? `${sign(g.bonus)} line` : "";
    bo.classList.toggle("pos", g.bonus > 0);
    bo.classList.toggle("neg", g.bonus < 0);
    row.querySelector(".brow-line").innerHTML = `“${esc(g.line)}”`;
    row.style.animationDelay = `${i * 0.08}s`;
    row.classList.add(b.base + g.bonus > 0 ? "up" : b.base + g.bonus < 0 ? "down" : "flat");
  });
  const tier = tierOf(sum - speed);
  const headlines = v.headlines?.length ? v.headlines : pack.headlines[tier];
  const rec = { style: opt.style, text: opt.text, points: sum, tier, headlines, timedOut };
  state.picks[state.round] = rec;

  flash();
  stage.setFace(v.face || pack.faces[tier] || "neutral");
  $("stamps").innerHTML = "";
  stamp(headlines[0], sum >= 30 ? "green" : sum < 0 ? "red" : "ink", { left: "5%", bottom: "17%", r: "-6deg" }, 0.15);
  if (headlines[1]) stamp(headlines[1], "ink small", { right: "5%", bottom: "8%", r: "3deg" }, 0.55);
  setTimeout(() => (sum >= 30 ? audio.sfx.good() : sum < 0 ? audio.sfx.bad() : null), 700);
  renderDots();
  renderScore();
  setTicker(state.picks.flatMap((x) => x.headlines));

  const rt = tot.querySelector(".round-total");
  rt.className = `round-total ${sum >= 30 ? "pos" : sum < 0 ? "neg" : ""}`;
  countUp(rt, sum);
  if (v.judge !== "claude") p.append(el("p", "fine", "Judges are offline right now; scored on tone only."));

  const last = state.round === ROUNDS - 1;
  const next = el("button", "btn", last ? "Print the front page →" : "Next question →");
  next.onclick = () => {
    audio.sfx.select();
    state.round++;
    if (last) frontPage();
    else question();
  };
  const row = el("div", "row");
  row.append(next);
  p.append(row);
  setTimeout(() => next.focus({ preventScroll: true }), 50);
}

function countUp(node, to) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 700);
    node.textContent = sign(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function frontPage() {
  const sum = total();
  const end = state.pack.endings.find((e) => sum >= e.min) || state.pack.endings[state.pack.endings.length - 1];
  const rank = state.pack.endings.indexOf(end);
  $("qcard").hidden = true;
  flash();
  stage.setFace(end.face || "neutral");
  $("stamps").innerHTML = "";
  stamp(end.headline, rank <= 1 ? "green" : "red", { left: "5%", bottom: "14%", r: "-5deg" });
  setTimeout(() => (rank <= 1 ? audio.sfx.fanfare() : audio.sfx.bad()), 400);
  audio.music(0.16);
  renderDots();
  renderScore();

  const p = $("panel");
  p.innerHTML = "";
  const front = el("div", "front");
  front.append(
    el("span", "kicker", esc(end.kicker)),
    el("h1", "headline", esc(end.headline)),
    el("p", "dek", `${esc(end.dek)} <b class="sum">${sum} pts</b>`),
  );
  front.append(el("div", "label", "The week in statements"));
  const recap = el("div", "recap");
  state.picks.forEach((x) => {
    const row = el("div", "recap-row");
    row.innerHTML = `<span class="recap-n">${sign(x.points)}</span><div><div class="recap-h">${esc(x.headlines[0])}</div><div class="recap-q">“${esc(x.text)}”</div></div>`;
    recap.appendChild(row);
  });
  front.append(recap);

  const row = el("div", "row");
  const share = el("button", "btn", "Copy result");
  share.onclick = () => copyResult(end, sum);
  const again = el("button", "btn ghost", "Run it again");
  again.onclick = intro;
  row.append(share, again);
  front.append(row);
  p.append(front);
  setTicker([end.headline, ...state.picks.flatMap((x) => x.headlines)]);
}

function copyResult(end, sum) {
  const lines = [
    `PRESS CYCLE · ${state.pack.title}`,
    `${end.headline} ${sum} pts`,
    ...state.picks.map((x, i) => `${i + 1} ${x.points >= 40 ? "📈" : x.points < 0 ? "📉" : "➖"} ${x.headlines[0]}`),
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
