// Procedural sound: a quiet newsroom loop plus game SFX, all WebAudio, no files.
// Audio starts on the first user gesture (Start button). Mute is remembered per browser.

let ctx = null;
let master, musicBus, sfxBus;
let musicTimer = null;
let nextBeat = 0;
let step = 0;
let muted = false;
try {
  muted = localStorage.getItem("pc-muted") === "1";
} catch {
  /* storage blocked: default to sound on */
}

const BPM = 96;
const SIX = 60 / BPM / 4; // sixteenth note
// Am - F - C - G, one bar each
const BASS = [45, 41, 48, 43];
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [55, 60, 64],
  [55, 59, 62],
];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem("pc-muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
}

export function start() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.16;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.5;
    sfxBus.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume();
  if (!musicTimer) {
    nextBeat = ctx.currentTime + 0.1;
    musicTimer = setInterval(schedule, 50);
  }
}

// Duck the music while a question is live so ticks read clearly; lift it between rounds.
export function music(level) {
  if (musicBus) musicBus.gain.setTargetAtTime(level, ctx.currentTime, 0.3);
}

function schedule() {
  while (nextBeat < ctx.currentTime + 0.2) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const t = nextBeat;
    if (s === 0 || s === 10) kick(t);
    if (s === 4 || s === 12) snare(t);
    if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.5 : 0.25);
    if (s === 0 || s === 6 || s === 8 || s === 14) bass(t, hz(BASS[bar] + (s === 14 ? 7 : 0)));
    if (s === 0) pad(t, CHORDS[bar]);
    if (Math.random() < 0.18 && s % 2 === 1) type(t, musicBus, 0.25);
    nextBeat += SIX;
    step++;
  }
}

function noiseBuffer(sec) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let _noise;
const noise = () => (_noise ||= noiseBuffer(1));

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function osc(type, f, t, dur, peak, bus, a = 0.005) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  env(g, t, a, peak, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + a + dur + 0.05);
  return o;
}

function noiseHit(t, dur, peak, bus, type, freq, q = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.002, peak, dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

function kick(t) {
  const o = osc("sine", 120, t, 0.28, 0.9, musicBus);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
}
const snare = (t) => noiseHit(t, 0.14, 0.5, musicBus, "bandpass", 1800, 0.8);
const hat = (t, v) => noiseHit(t, 0.03, 0.25 * v, musicBus, "highpass", 8000);
function bass(t, f) {
  const o = osc("triangle", f, t, 0.22, 0.55, musicBus);
  o.detune.value = -4;
}
function pad(t, notes) {
  notes.forEach((m) => {
    const o = osc("sawtooth", hz(m), t, SIX * 14, 0.05, musicBus, 0.25);
    o.detune.value = Math.random() * 10 - 5;
  });
}
function type(t, bus, v = 1) {
  noiseHit(t, 0.02, 0.35 * v, bus, "bandpass", 3200 + Math.random() * 1500, 4);
}

// ---------- SFX ----------

function now() {
  return ctx ? ctx.currentTime + 0.01 : 0;
}

export const sfx = {
  tick(urgent) {
    if (!ctx) return;
    osc("square", urgent ? 1400 : 1000, now(), 0.04, urgent ? 0.25 : 0.12, sfxBus);
  },
  select() {
    if (!ctx) return;
    const t = now();
    for (let i = 0; i < 4; i++) type(t + i * 0.035, sfxBus, 1.4);
    osc("triangle", 660, t, 0.08, 0.2, sfxBus);
  },
  shutter() {
    if (!ctx) return;
    const t = now();
    noiseHit(t, 0.03, 0.8, sfxBus, "highpass", 2500);
    noiseHit(t + 0.07, 0.05, 0.6, sfxBus, "bandpass", 1500, 2);
  },
  stamp() {
    if (!ctx) return;
    const t = now();
    const o = osc("sine", 90, t, 0.25, 1, sfxBus);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    noiseHit(t, 0.08, 0.6, sfxBus, "lowpass", 900);
  },
  good() {
    if (!ctx) return;
    const t = now();
    [72, 76, 79, 84].forEach((m, i) => osc("triangle", hz(m), t + i * 0.07, 0.25, 0.3, sfxBus));
  },
  bad() {
    if (!ctx) return;
    const t = now();
    [0, 0.28, 0.56].forEach((d, i) => {
      const o = osc("sawtooth", hz(58 - i), t + d, 0.3, 0.18, sfxBus);
      o.frequency.linearRampToValueAtTime(hz(57 - i), t + d + 0.3);
    });
    const o = osc("sawtooth", hz(55), t + 0.84, 0.8, 0.18, sfxBus);
    o.frequency.linearRampToValueAtTime(hz(52), t + 1.6);
  },
  buzzer() {
    if (!ctx) return;
    const t = now();
    osc("square", 110, t, 0.6, 0.3, sfxBus);
    osc("square", 116, t, 0.6, 0.3, sfxBus);
  },
  fanfare() {
    if (!ctx) return;
    const t = now();
    [60, 64, 67, 72, 67, 72].forEach((m, i) => osc("sawtooth", hz(m), t + i * 0.11, i === 5 ? 0.7 : 0.14, 0.14, sfxBus));
    [48, 55].forEach((m) => osc("triangle", hz(m), t + 0.55, 0.9, 0.3, sfxBus));
  },
};
