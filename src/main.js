import { Stage } from "./stage.js";
import { classify } from "./classify.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ROUNDS = 5;
const MAX_CHARS = 160;

const state = { pack: null, round: 0, picks: [], started: false, busy: false };
let stage;

async function boot() {
  const params = new URLSearchParams(location.search);
  const index = await fetch("packs/index.json").then((r) => r.json());
  // Daily rotation through the scheduled packs; ?pack=<id> forces one.
  const day = Math.floor(Date.now() / 86400000);
  const id = params.get("pack") || index.schedule[day % index.schedule.length];
  const entry = index.packs.find((p) => p.id === id) || index.packs[0];
  state.pack = await fetch(entry.file).then((r) => r.json());

  $("edition").textContent = `No. ${String(state.pack.edition || 1).padStart(3, "0")}`;
  $("dateline").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const src = (state.pack.sources || []).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(" · ");
  $("foot").innerHTML = `<p>${esc(state.pack.parody)}</p>${src ? `<p class="sources">Based on real reporting: ${src}</p>` : ""}`;

  stage = new Stage($("stage"));
  stage.loadCharacter(state.pack.character, () => $("loading")?.remove());
  intro();
}

const total = () => state.picks.reduce((n, p) => n + p.score, 0);

function renderScore() {
  $("total").innerHTML = state.started ? `<span>${total()}</span><small>/ ${ROUNDS * 100}</small>` : "";
}

function renderDots() {
  const d = $("dots");
  d.innerHTML = "";
  for (let i = 0; i < ROUNDS; i++) {
    const s = el("span", "", String(i + 1));
    const p = state.picks[i];
    if (p) s.className = p.score >= 60 ? "good" : p.score < 40 ? "bad" : "done";
    else if (i === state.round && state.started) s.className = "on";
    d.appendChild(s);
  }
}

function setTicker(lines) {
  const all = lines.length ? lines : ["Cameras outside HQ", "Board 'reviewing leadership'", "Comms team has not slept", "Statement expected shortly"];
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
}

function flash() {
  const f = $("flash");
  f.classList.remove("go");
  void f.offsetWidth;
  f.classList.add("go");
  stage?.flash();
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

// ---------- screens ----------

function intro() {
  Object.assign(state, { round: 0, picks: [], started: false, busy: false });
  renderDots();
  renderScore();
  setTicker([]);
  $("qcard").hidden = true;
  clearStamps();
  stage?.setFace("neutral", { flash: false });

  const s = state.pack.setup;
  const p = $("panel");
  p.innerHTML = "";
  const go = el("button", "btn", "Start the cycle →");
  go.onclick = () => {
    state.started = true;
    question();
  };
  const row = el("div", "row");
  row.append(go);
  p.append(el("span", "kicker", esc(s.kicker)), el("h1", "headline", esc(s.headline)), el("p", "dek", esc(s.dek)), row);
}

function question() {
  const r = state.pack.rounds[state.round];
  renderDots();
  renderScore();
  clearStamps();
  stage.setFace("neutral", { flash: false });
  showQuestion(r);

  const p = $("panel");
  p.innerHTML = "";
  p.append(el("div", "label", `Round ${state.round + 1} of ${ROUNDS} · Finish his statement`));

  const card = el("label", "fill");
  card.innerHTML = `<span class="starter">${esc(r.starter)}</span>`;
  const ta = el("textarea");
  ta.maxLength = MAX_CHARS;
  ta.rows = 3;
  ta.placeholder = "…";
  ta.setAttribute("aria-label", `Finish the statement: ${r.starter}`);
  card.appendChild(ta);
  p.appendChild(card);

  const row = el("div", "write-row");
  const count = el("span", "count", `0 / ${MAX_CHARS}`);
  const send = el("button", "btn", "Release it");
  send.disabled = true;
  ta.oninput = () => {
    count.textContent = `${ta.value.length} / ${MAX_CHARS}`;
    send.disabled = ta.value.trim().length < 2;
  };
  ta.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!send.disabled) send.click();
    }
  };
  send.onclick = () => release(r, ta.value.trim());
  row.append(count, send);
  p.appendChild(row);
  setTimeout(() => ta.focus({ preventScroll: true }), 60);
}

// Ask the judge; if it isn't set up or is slow, score locally so play never stalls.
async function judge(r, text) {
  const pack = state.pack;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch("api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: pack.subject,
        role: pack.role,
        setup: pack.context || `${pack.setup.headline} ${pack.setup.dek}`,
        asker: r.asker,
        question: r.question,
        starter: r.starter,
        statement: text,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const j = await res.json();
      if (j.headlines?.length) return j;
    }
  } catch {
    /* fall through to the local scorer */
  }
  const tone = classify(text);
  const f = pack.fallback[tone] || pack.fallback.vague;
  // a little spread so two different answers of the same kind don't tie
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  const wiggle = (Math.abs(h) % 11) - 5 + Math.min(6, Math.floor(text.length / 25));
  return { score: Math.max(0, Math.min(100, f.score + wiggle)), verdict: f.verdict, headlines: f.headlines, why: f.why, face: f.face, judge: "local" };
}

async function release(r, text) {
  if (state.busy || text.length < 2) return;
  state.busy = true;
  const p = $("panel");
  p.innerHTML = "";
  p.append(el("div", "label", `Round ${state.round + 1} · Going to print`));
  p.append(el("p", "quote", `“${esc(r.starter)} ${esc(text)}”`));
  p.append(el("div", "reading", `<span></span>The internet is reading it…`));
  stage.setFace("nervous", { flash: false });

  const v = await judge(r, text);
  const rec = { text: `${r.starter} ${text}`, ...v };
  state.picks[state.round] = rec;

  flash();
  stage.setFace(v.face || "neutral");
  $("stamps").innerHTML = "";
  stamp(v.headlines[0], v.score >= 50 ? "green" : "red", { left: "5%", bottom: "17%", r: "-6deg" }, 0.15);
  if (v.headlines[1]) stamp(v.headlines[1], "ink small", { right: "5%", bottom: "8%", r: "3deg" }, 0.5);
  renderDots();
  renderScore();
  setTicker(state.picks.flatMap((x) => x.headlines));

  p.innerHTML = "";
  p.append(el("div", "label", `Round ${state.round + 1} · Printed`));
  p.append(el("p", "quote", `“${esc(rec.text)}”`));
  const sc = el("div", `score ${v.score >= 60 ? "good" : v.score < 40 ? "bad" : ""}`);
  sc.innerHTML = `<b>0</b><span class="verdict">${esc(v.verdict)}</span>`;
  p.append(sc);
  countUp(sc.querySelector("b"), v.score);
  const ul = el("ul", "heads");
  v.headlines.forEach((h) => ul.appendChild(el("li", "", esc(h))));
  p.append(ul);
  if (v.why) p.append(el("p", "why", `<b>Why:</b> ${esc(v.why)}`));

  const last = state.round === ROUNDS - 1;
  const next = el("button", "btn", last ? "Print the front page →" : "Next question →");
  next.onclick = () => {
    state.busy = false;
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
    node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function frontPage() {
  const sum = total();
  const end = state.pack.endings.find((e) => sum >= e.min) || state.pack.endings[state.pack.endings.length - 1];
  $("qcard").hidden = true;
  flash();
  stage.setFace(end.face || "neutral");
  $("stamps").innerHTML = "";
  stamp(end.headline, "red", { left: "5%", bottom: "14%", r: "-5deg" });
  renderDots();
  renderScore();

  const p = $("panel");
  p.innerHTML = "";
  const front = el("div", "front");
  front.append(
    el("span", "kicker", esc(end.kicker)),
    el("h1", "headline", esc(end.headline)),
    el("p", "dek", `${esc(end.dek)} <b class="sum">${sum} / ${ROUNDS * 100}</b>`),
  );
  front.append(el("div", "label", "The week in statements"));
  const recap = el("div", "recap");
  state.picks.forEach((x) => {
    const row = el("div", "recap-row");
    row.innerHTML = `<span class="recap-n">${x.score}</span><div><div class="recap-h">${esc(x.headlines[0])}</div><div class="recap-q">“${esc(x.text)}” · ${esc(x.verdict)}</div></div>`;
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
    `${end.headline} ${sum}/${ROUNDS * 100}`,
    ...state.picks.map((x, i) => `${i + 1} ${x.score >= 60 ? "📈" : x.score < 40 ? "📉" : "➖"} ${x.headlines[0]}`),
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
