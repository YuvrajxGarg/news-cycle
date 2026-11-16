import { Stage } from "./stage.js";
import { classify, TONE_LABEL } from "./classify.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clamp = (v) => Math.max(0, Math.min(100, v));
const ROUNDS = 5;
const MAX_CHARS = 160;

const state = {
  pack: null,
  round: 0,
  meters: {},
  picks: [],
  busy: false,
};

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
  $("foot").innerHTML = `<p>${esc(state.pack.parody)}</p>`;

  stage = new Stage($("stage"));
  stage.loadCharacter(state.pack.character).then((r) => {
    document.body.dataset.character = r.fallback ? "fallback" : "model";
  });

  intro();
}

function resetMeters() {
  state.meters = {};
  for (const m of state.pack.meters) state.meters[m.id] = 50;
  renderMeters();
}

function renderMeters(deltas = {}) {
  const box = $("meters");
  box.innerHTML = "";
  for (const m of state.pack.meters) {
    const v = state.meters[m.id];
    const d = deltas[m.id] || 0;
    const card = el("div", `meter${d > 0 ? " up" : d < 0 ? " down" : ""}`);
    card.innerHTML = `<div class="meter-top"><span>${esc(m.label)}</span><span class="meter-val">${v}</span></div><div class="meter-bar"><i style="width:${v}%"></i></div>`;
    box.appendChild(card);
  }
}

function renderDots() {
  const d = $("dots");
  d.innerHTML = "";
  for (let i = 0; i < ROUNDS; i++) {
    const s = el("span", "", String(i + 1));
    const p = state.picks[i];
    if (p) s.className = p.net > 0 ? "good" : p.net < 0 ? "bad" : "done";
    else if (i === state.round && state.started) s.className = "on";
    d.appendChild(s);
  }
}

function setTicker(lines) {
  const t = $("ticker");
  const all = lines.length ? lines : ["Cameras outside HQ", "Board 'reviewing leadership'", "Comms team has not slept", "Statement expected shortly"];
  // twice so the loop has no gap
  t.innerHTML = [...all, ...all].map((h) => `<span>${esc(h)}</span>`).join("");
}

function clearStamps() {
  const s = $("stamps");
  s.classList.add("fade");
  setTimeout(() => {
    s.innerHTML = "";
    s.classList.remove("fade");
  }, 450);
}

function stampHeadlines(heads, net) {
  const s = $("stamps");
  s.innerHTML = "";
  // Keep the face clear: stamps land in the lower third, over the jacket and mics.
  const spots = [
    { left: "5%", bottom: "17%", r: "-6deg" },
    { right: "5%", bottom: "8%", r: "3deg" },
  ];
  heads.slice(0, 2).forEach((h, i) => {
    const st = el("div", `stamp ${i === 0 ? (net >= 0 ? "green" : "red") : "ink small"}`, esc(h));
    const p = spots[i];
    Object.assign(st.style, { left: p.left || "auto", right: p.right || "auto", bottom: p.bottom });
    st.style.setProperty("--r", p.r);
    st.style.animationDelay = `${0.15 + i * 0.35}s`;
    s.appendChild(st);
  });
}

function flash() {
  const f = $("flash");
  f.classList.remove("go");
  void f.offsetWidth;
  f.classList.add("go");
  stage?.flash();
}

// ---------- screens ----------

function intro() {
  state.round = 0;
  state.picks = [];
  state.started = false;
  resetMeters();
  renderDots();
  setTicker([]);
  $("qcard").hidden = true;
  clearStamps();
  stage?.setFace("neutral", { flash: false });

  const s = state.pack.setup;
  const p = $("panel");
  p.innerHTML = "";
  p.append(
    el("span", "kicker", esc(s.kicker)),
    el("h1", "headline", esc(s.headline)),
    el("p", "dek", esc(s.dek)),
  );
  const how = el("p", "fine", "Pick a statement or write your own. Every answer prints instantly. Five rounds, one front page.");
  const go = el("button", "btn", "Start the cycle →");
  go.onclick = () => {
    state.started = true;
    question();
  };
  const row = el("div", "row");
  row.append(go);
  p.append(how, row);
}

function question() {
  const r = state.pack.rounds[state.round];
  renderDots();
  clearStamps();
  stage.setFace("neutral", { flash: false });

  $("qcard").hidden = false;
  $("qcard").style.animation = "none";
  void $("qcard").offsetWidth;
  $("qcard").style.animation = "";
  $("qOutlet").textContent = r.outlet;
  $("qAsker").textContent = r.asker;
  $("qText").textContent = r.question;

  const p = $("panel");
  p.innerHTML = "";
  p.append(el("div", "label", `Question ${state.round + 1} of ${ROUNDS} · Pick a statement`));
  const opts = el("div", "options");
  r.options.forEach((o, i) => {
    const b = el("button", "opt", `<span class="opt-key">${"ABCD"[i]}</span><span class="opt-text">${esc(o.text)}</span>`);
    b.onclick = () => release({ ...o, text: o.text, custom: false });
    opts.appendChild(b);
  });
  p.appendChild(opts);

  p.append(el("div", "label", "Or write your own"));
  const w = el("div", "write");
  const ta = el("textarea");
  ta.maxLength = MAX_CHARS;
  ta.placeholder = "Type his statement…";
  const row = el("div", "write-row");
  const count = el("span", "count", `0 / ${MAX_CHARS}`);
  const send = el("button", "btn ghost", "Release statement");
  send.disabled = true;
  ta.oninput = () => {
    count.textContent = `${ta.value.length} / ${MAX_CHARS}`;
    send.disabled = ta.value.trim().length < 3;
  };
  ta.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !send.disabled) {
      e.preventDefault();
      send.click();
    }
  };
  send.onclick = () => {
    const text = ta.value.trim();
    const tone = classify(text);
    // Use this round's matching option if there is one, else the pack's generic reaction.
    const match = r.options.find((o) => o.tone === tone);
    const base = match || state.pack.freeText[tone] || state.pack.freeText.vague;
    release({ ...base, tone, text, custom: true });
  };
  row.append(count, send);
  w.append(ta, row);
  p.appendChild(w);
}

function release(pick) {
  if (state.busy) return;
  state.busy = true;

  const deltas = {};
  let net = 0;
  for (const m of state.pack.meters) {
    const d = pick.effects?.[m.id] || 0;
    const before = state.meters[m.id];
    state.meters[m.id] = clamp(before + d);
    deltas[m.id] = state.meters[m.id] - before;
    net += d;
  }
  const rec = { text: pick.text, tone: pick.tone, face: pick.face, headlines: pick.headlines, why: pick.why, deltas, net, custom: pick.custom };
  state.picks[state.round] = rec;

  flash();
  stage.setFace(pick.face || "neutral");
  stampHeadlines(pick.headlines, net);
  renderMeters(deltas);
  renderDots();
  setTicker(state.picks.flatMap((x) => x.headlines));

  const p = $("panel");
  p.innerHTML = "";
  p.append(el("div", "label", `Question ${state.round + 1} · Printed`));
  p.append(el("p", "quote", `“${esc(pick.text)}”`));
  const read = el("div", "readas", `<span>Read as</span><span class="tone">${esc(TONE_LABEL[pick.tone] || pick.tone)}</span>${pick.custom ? "<span>· your words</span>" : ""}`);
  p.append(read);
  const ul = el("ul", "heads");
  pick.headlines.forEach((h) => ul.appendChild(el("li", "", esc(h))));
  p.append(ul);
  const dl = el("div", "deltas");
  for (const m of state.pack.meters) {
    const d = deltas[m.id];
    if (!d) continue;
    dl.appendChild(el("span", `delta ${d > 0 ? "up" : "down"}`, `${m.label} ${d > 0 ? "+" : ""}${d}`));
  }
  p.append(dl);
  if (pick.why) p.append(el("p", "why", `<b>Why it landed that way:</b> ${esc(pick.why)}`));

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

function pickEnding() {
  const m = state.meters;
  return (
    state.pack.endings.find((e) => Object.entries(e.when).every(([k, [lo, hi]]) => m[k] >= lo && m[k] <= hi)) ||
    state.pack.endings[state.pack.endings.length - 1]
  );
}

function frontPage() {
  const end = pickEnding();
  $("qcard").hidden = true;
  flash();
  stage.setFace(end.face || "neutral");
  const s = $("stamps");
  s.innerHTML = "";
  const big = el("div", "stamp red", esc(end.headline));
  big.style.left = "5%";
  big.style.bottom = "14%";
  big.style.setProperty("--r", "-5deg");
  s.appendChild(big);
  renderDots();

  const p = $("panel");
  p.innerHTML = "";
  const front = el("div", "front");
  front.append(el("span", "kicker", esc(end.kicker)), el("h1", "headline", esc(end.headline)), el("p", "dek", esc(end.dek)));

  front.append(el("div", "label", "The week in statements"));
  const recap = el("div", "recap");
  state.picks.forEach((x, i) => {
    const row = el("div", "recap-row");
    row.innerHTML = `<span class="recap-n">${i + 1}</span><div><div class="recap-h">${esc(x.headlines[0])}</div><div class="recap-q">“${esc(x.text)}” · ${esc(TONE_LABEL[x.tone] || x.tone)}</div></div>`;
    recap.appendChild(row);
  });
  front.append(recap);

  // Media-literacy wrap-up: what the player's statement types did, most used first.
  const counts = {};
  state.picks.forEach((x) => (counts[x.tone] = (counts[x.tone] || 0) + 1));
  const tones = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 3);
  front.append(el("div", "label", "What the coverage shows"));
  const ls = el("ul", "lessons");
  tones.forEach((t) => ls.appendChild(el("li", "", `${esc(state.pack.lessons[t] || "")} <span class="fine">(${TONE_LABEL[t]} ×${counts[t]})</span>`)));
  front.append(ls);

  const row = el("div", "row");
  const share = el("button", "btn", "Copy result");
  share.onclick = () => copyResult(end);
  const again = el("button", "btn ghost", "Run it again");
  again.onclick = intro;
  row.append(share, again);
  front.append(row);
  p.append(front);
  setTicker([end.headline, ...state.picks.flatMap((x) => x.headlines)]);
}

function copyResult(end) {
  const lines = [
    `PRESS CYCLE · ${state.pack.title}`,
    end.headline,
    ...state.picks.map((x, i) => `${i + 1} ${x.net > 0 ? "📈" : x.net < 0 ? "📉" : "➖"} ${x.headlines[0]}`),
    state.pack.meters.map((m) => `${m.label} ${state.meters[m.id]}`).join(" · "),
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
