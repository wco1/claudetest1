/* Rail Rush — endless three-lane runner.
   Pseudo-3D perspective renderer on canvas 2D: fast everywhere, no engine, no CDN.
   All tuning numbers live in CFG; the simulation is fixed-timestep and seeded. */

import { t, setLang, getLang, pickLang, LANGS } from "./strings.js";

/* ============================ 1. TUNING (all balance data) ============================ */

const CFG = {
  U_PER_M: 300,            // world units per metre
  ROAD_HALF: 900,          // half width of the three-lane track
  LANE_W: 600,
  CAM_BACK: 1150,          // camera sits this far behind the hero
  CAM_LAG: 0.55,           // how much the camera follows lateral movement
  FOV: 96,
  DRAW_DIST: 30000,
  SPAWN_AHEAD: 30000,
  DESPAWN_BEHIND: 3000,

  HERO_H: 720,
  HERO_ROLL_H: 340,
  HERO_HW: 165,            // hitbox half-width (smaller than the sprite — forgiving)
  HERO_HZ: 140,
  LANE_TIME: 165,          // ms for a lane change
  JUMP_V: 3500,
  GRAV: 11500,
  DIVE_V: -6400,
  ROLL_TIME: 520,
  LAND_TOL: 110,           // vertical grace when landing on a roof or slope
  BUFFER_MS: 175,          // input buffering window

  SPEED_MIN: 6200,
  SPEED_MAX: 16800,
  SPEED_RAMP_M: 1800,      // metres until top speed
  COIN_SCORE: 5,
  REVIVE_COST: 100,
  INVULN_MS: 1300,

  MAGNET_MS: 8000,
  MAGNET_R: 4500,
  X2_MS: 10000,
  JET_MS: 6500,
  JET_Y: 1900,
  BOARD_MS: 20000,

  BANDS: 46,
  MAX_PARTICLES: 170,
};

// Obstacle archetypes. y0..y1 is the solid band; `walk` marks a standable roof,
// `slope` a ramp whose surface rises across its length.
const OBS = {
  barrier: { w: 540, y0: 0,   y1: 430,  zl: 340,  img: "barrier" },
  gantry:  { w: 660, y0: 470, y1: 1420, zl: 320,  img: "gantry"  },
  train:   { w: 580, y0: 0,   y1: 1180, zl: 6600, img: "train", walk: true, box: true },
  ramp:    { w: 580, y0: 0,   y1: 1180, zl: 2800, img: "ramp", slope: true },
};

const PU = { magnet: 0, jet: 1, x2: 2, board: 3 };
const PU_KEYS = ["puMagnet", "puJetpack", "puX2", "puBoard"];
const PU_MS = [CFG.MAGNET_MS, CFG.JET_MS, CFG.X2_MS, CFG.BOARD_MS];
const PU_COLORS = ["#ff7a4d", "#3fc6c0", "#ffd24a", "#c58bff"];
const SIDES = [-1, 1];

/* ============================ 2. Deterministic RNG ============================ */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(1);
const ri = (n) => (rng() * n) | 0;
const pick = (arr) => arr[(rng() * arr.length) | 0];

/* ============================ 3. Persistence ============================ */

const KEY = "railrush.v1";
const SAVE = Object.assign(
  { best: 0, coins: 0, sound: 1, music: 1, fx: 1, lang: null, seenHow: 0, taught: {} },
  (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })()
);
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(SAVE)); } catch {} }, 200);
}
setLang(pickLang(SAVE.lang));

/* ============================ 4. Assets ============================ */

const IMG = {};
const ASSETS = {
  hero_a: "./assets/hero_run_a.png",
  hero_b: "./assets/hero_run_b.png",
  hero_jump: "./assets/hero_jump.png",
  hero_roll: "./assets/hero_roll.png",
  chaser: "./assets/chaser.png",
  train: "./assets/train.png",
  barrier: "./assets/barrier.png",
  gantry: "./assets/gantry.png",
  city: "./assets/city.png",
  track: "./assets/track.png",
};

function loadImage(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

function mirror(img) {
  if (!img) return null;
  const c = cv(img.width, img.height), g = c.getContext("2d");
  g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0);
  return c;
}

// Vertically doubled track tile so any [v, v+dv] window samples without wrapping.
function doubleTile(img) {
  if (!img) return null;
  const c = cv(img.width, img.height * 2), g = c.getContext("2d");
  g.drawImage(img, 0, 0); g.drawImage(img, 0, img.height);
  return c;
}

async function loadAssets() {
  const keys = Object.keys(ASSETS);
  const imgs = await Promise.all(keys.map((k) => loadImage(ASSETS[k])));
  keys.forEach((k, i) => (IMG[k] = imgs[i]));
  IMG.hero_a_m = mirror(IMG.hero_a);
  IMG.hero_b_m = mirror(IMG.hero_b);
  IMG.trackTile = doubleTile(IMG.track);
  bakeProcedural();
}

/* ============ 5. Procedural art — STYLE FORMULA v1, blocks 1-5, drawn in code ============
   Flat cel-shaded cartoon, thick dark-navy outlines, chunky rounded silhouettes,
   pickups carry the electric yellow-gold signal hue, hazards the warning red-orange. */

const NAVY = "#16223a", GOLD = "#ffd24a", GOLD_D = "#e0a21c", CORAL = "#ff7a4d",
      TEAL = "#3fc6c0", GREY = "#8d99ac", GREY_D = "#5b6779";

function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function bakeProcedural() {
  IMG.coin = bakeCoin();
  IMG.tokens = [bakeToken("magnet"), bakeToken("jet"), bakeToken("x2"), bakeToken("board")];
  IMG.pylon = bakePylon();
  IMG.spark = bakeSpark();
}

const COIN_FRAMES = 12, COIN_SIZE = 72;
function bakeCoin() {
  const c = cv(COIN_SIZE * COIN_FRAMES, COIN_SIZE), g = c.getContext("2d");
  for (let f = 0; f < COIN_FRAMES; f++) {
    const ox = f * COIN_SIZE, mx = ox + COIN_SIZE / 2, my = COIN_SIZE / 2;
    const wr = Math.max(2.5, Math.abs(Math.cos((f / COIN_FRAMES) * Math.PI * 2)) * 26);
    g.save();
    g.shadowColor = "rgba(255,210,74,.9)"; g.shadowBlur = 12;
    g.beginPath(); g.ellipse(mx, my, wr + 3, 29, 0, 0, 7); g.fillStyle = NAVY; g.fill();
    g.shadowBlur = 0;
    const grd = g.createLinearGradient(mx - wr, my - 26, mx + wr, my + 26);
    grd.addColorStop(0, "#fff2bb"); grd.addColorStop(.45, GOLD); grd.addColorStop(1, GOLD_D);
    g.beginPath(); g.ellipse(mx, my, wr, 26, 0, 0, 7); g.fillStyle = grd; g.fill();
    if (wr > 9) {
      g.beginPath(); g.ellipse(mx, my, wr * .66, 17, 0, 0, 7);
      g.strokeStyle = "rgba(22,34,58,.5)"; g.lineWidth = 2.2; g.stroke();
      g.fillStyle = NAVY; g.beginPath();                    // lightning-bolt stamp
      g.moveTo(mx + wr * .16, my - 12); g.lineTo(mx - wr * .30, my + 1);
      g.lineTo(mx - wr * .02, my + 1);  g.lineTo(mx - wr * .18, my + 12);
      g.lineTo(mx + wr * .30, my - 2);  g.lineTo(mx + wr * .02, my - 2);
      g.closePath(); g.fill();
    }
    g.restore();
  }
  return c;
}

function bakeToken(kind) {
  const S = 128, c = cv(S, S), g = c.getContext("2d"), m = S / 2;
  g.save();
  g.shadowColor = "rgba(255,210,74,.95)"; g.shadowBlur = 22;
  g.beginPath(); g.arc(m, m, 46, 0, 7); g.fillStyle = GOLD; g.fill();
  g.shadowBlur = 0;
  g.beginPath(); g.arc(m, m, 46, 0, 7); g.lineWidth = 6; g.strokeStyle = NAVY; g.stroke();
  g.beginPath(); g.arc(m, m, 36, 0, 7); g.fillStyle = "#fff6d2"; g.fill();
  g.lineCap = "round"; g.lineJoin = "round";
  if (kind === "magnet") {
    g.lineWidth = 12; g.strokeStyle = CORAL;
    g.beginPath(); g.arc(m, m + 4, 17, Math.PI, 0); g.stroke();
    g.lineWidth = 4; g.strokeStyle = NAVY;
    g.beginPath(); g.arc(m, m + 4, 17, Math.PI, 0); g.stroke();
    g.fillStyle = NAVY; g.fillRect(m - 23, m + 3, 11, 16); g.fillRect(m + 12, m + 3, 11, 16);
  } else if (kind === "jet") {
    g.fillStyle = TEAL; g.strokeStyle = NAVY; g.lineWidth = 3.5;
    roundRect(g, m - 16, m - 22, 13, 32, 6); g.fill(); g.stroke();
    roundRect(g, m + 3, m - 22, 13, 32, 6); g.fill(); g.stroke();
    g.fillStyle = CORAL;
    g.beginPath(); g.moveTo(m - 15, m + 11); g.lineTo(m - 4, m + 11); g.lineTo(m - 10, m + 25); g.fill();
    g.beginPath(); g.moveTo(m + 4, m + 11); g.lineTo(m + 15, m + 11); g.lineTo(m + 9, m + 25); g.fill();
  } else if (kind === "x2") {
    g.fillStyle = NAVY;
    g.font = "900 36px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("×2", m, m + 2);
  } else {
    g.fillStyle = CORAL; g.strokeStyle = NAVY; g.lineWidth = 3.5;
    roundRect(g, m - 28, m - 7, 56, 15, 7); g.fill(); g.stroke();
    g.fillStyle = TEAL; g.globalAlpha = .8;
    g.beginPath(); g.ellipse(m, m + 15, 25, 6, 0, 0, 7); g.fill();
  }
  g.restore();
  return c;
}

function bakePylon() {
  const W = 120, H = 300, c = cv(W, H), g = c.getContext("2d");
  g.fillStyle = GREY; g.fillRect(20, 34, 80, H - 34);
  g.fillStyle = GREY_D; g.fillRect(70, 34, 30, H - 34);
  g.fillStyle = TEAL; roundRect(g, 10, 8, 100, 34, 10); g.fill();
  g.lineWidth = 7; g.strokeStyle = NAVY;
  g.strokeRect(20, 34, 80, H - 34); roundRect(g, 10, 8, 100, 34, 10); g.stroke();
  return c;
}

function bakeSpark() {
  const S = 64, c = cv(S, S), g = c.getContext("2d");
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(.35, "rgba(255,210,74,.85)");
  grd.addColorStop(1, "rgba(255,210,74,0)");
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return c;
}

/* ============================ 6. Audio ============================ */

const SFX = {
  ctx: null, master: null, musicEl: null, muted: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
  },
  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
  blip(freq, dur, type, vol, slide) {
    if (!SAVE.sound || this.muted || !this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || "square"; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol ?? 0.2, c.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur + 0.02);
  },
  noise(dur, vol, from, to) {
    if (!SAVE.sound || this.muted || !this.ctx) return;
    const c = this.ctx, n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.1;
    f.frequency.setValueAtTime(from, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
    const g = c.createGain(); g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  },
  coin(n) { this.blip(880 + Math.min(n, 12) * 42, 0.09, "triangle", 0.15, 1500); },
  jump() { this.noise(0.2, 0.12, 300, 1800); this.blip(300, 0.14, "sine", 0.1, 700); },
  roll() { this.noise(0.26, 0.14, 1600, 260); },
  power() { [523, 659, 880].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, "square", 0.16), i * 70)); },
  crash() { this.noise(0.6, 0.32, 900, 90); this.blip(180, 0.5, "sawtooth", 0.18, 45); },
  save() { [400, 700, 1100].forEach((f, i) => setTimeout(() => this.blip(f, 0.13, "sine", 0.18), i * 55)); },

  startMusic() {
    if (!SAVE.music) return;
    if (this.musicEl === false) return;                  // asset missing — stay silent
    if (!this.musicEl) {
      const a = new window.Audio("./assets/music.mp3");
      a.loop = true; a.volume = 0.3;                     // music sits well below the SFX layer
      a.addEventListener("error", () => { this.musicEl = false; });
      this.musicEl = a;
    }
    const p = this.musicEl.play();
    if (p && p.catch) p.catch(() => {});
  },
  stopMusic() { if (this.musicEl) this.musicEl.pause(); },
};

/* ============================ 7. Input → command objects ============================ */

const CMD = { LEFT: 1, RIGHT: 2, JUMP: 3, ROLL: 4 };
const KEYMAP = {
  ArrowLeft: CMD.LEFT, KeyA: CMD.LEFT,
  ArrowRight: CMD.RIGHT, KeyD: CMD.RIGHT,
  ArrowUp: CMD.JUMP, KeyW: CMD.JUMP, Space: CMD.JUMP,
  ArrowDown: CMD.ROLL, KeyS: CMD.ROLL,
};
const PADMAP = { 0: CMD.JUMP, 1: CMD.ROLL, 12: CMD.JUMP, 13: CMD.ROLL, 14: CMD.LEFT, 15: CMD.RIGHT };
const PAD_IDX = [0, 1, 12, 13, 14, 15];

const Input = {
  queue: [], qn: 0, padPrev: 0,
  push(c) { if (this.qn < 4) this.queue[this.qn++] = { c, t: performance.now() }; },
  shift() {
    if (!this.qn) return null;
    const v = this.queue[0];
    for (let i = 1; i < this.qn; i++) this.queue[i - 1] = this.queue[i];
    this.qn--; return v;
  },
  clear() { this.qn = 0; },
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return;
    let mask = 0;
    for (let p = 0; p < pads.length; p++) {
      const gp = pads[p];
      if (!gp) continue;
      for (let k = 0; k < PAD_IDX.length; k++) {
        const i = PAD_IDX[k];
        if (gp.buttons[i] && gp.buttons[i].pressed) mask |= 1 << i;
      }
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -0.55) mask |= 1 << 14;
      if (ax > 0.55) mask |= 1 << 15;
      if (ay < -0.55) mask |= 1 << 12;
      if (ay > 0.55) mask |= 1 << 13;
    }
    const fresh = mask & ~this.padPrev;
    this.padPrev = mask;
    if (fresh) for (let k = 0; k < PAD_IDX.length; k++) {
      const i = PAD_IDX[k];
      if (fresh & (1 << i)) this.push(PADMAP[i]);
    }
  },
};

addEventListener("keydown", (e) => {
  const c = KEYMAP[e.code];
  if (!c) return;
  e.preventDefault();
  if (e.repeat) return;
  Input.push(c);
  onUserGesture();
}, { passive: false });

// Touch: swipes for all four commands, plus a tap fallback for jump (one-handed play).
const canvasEl = document.getElementById("c");
let tsx = 0, tsy = 0, tst = 0, tActive = false, tFired = false;
const SWIPE = 26;

function gestureStart(x, y) { tsx = x; tsy = y; tst = performance.now(); tActive = true; tFired = false; onUserGesture(); }
function gestureMove(x, y) {
  if (!tActive || tFired) return;
  const dx = x - tsx, dy = y - tsy;
  if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
  tFired = true;
  if (Math.abs(dx) > Math.abs(dy)) Input.push(dx > 0 ? CMD.RIGHT : CMD.LEFT);
  else Input.push(dy > 0 ? CMD.ROLL : CMD.JUMP);
}
function gestureEnd() {
  if (tActive && !tFired && performance.now() - tst < 300) Input.push(CMD.JUMP);
  tActive = false;
}
canvasEl.addEventListener("touchstart", (e) => { const p = e.changedTouches[0]; gestureStart(p.clientX, p.clientY); e.preventDefault(); }, { passive: false });
canvasEl.addEventListener("touchmove", (e) => { const p = e.changedTouches[0]; gestureMove(p.clientX, p.clientY); e.preventDefault(); }, { passive: false });
canvasEl.addEventListener("touchend", (e) => { gestureEnd(); e.preventDefault(); }, { passive: false });
canvasEl.addEventListener("touchcancel", () => { tActive = false; });
canvasEl.addEventListener("pointerdown", (e) => { if (e.pointerType !== "touch") gestureStart(e.clientX, e.clientY); });
canvasEl.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") gestureMove(e.clientX, e.clientY); });
canvasEl.addEventListener("pointerup", (e) => { if (e.pointerType !== "touch") gestureEnd(); });

function onUserGesture() { SFX.init(); SFX.resume(); }

/* ============================ 8. Canvas, camera, projection ============================ */

const ctx = canvasEl.getContext("2d", { alpha: false });
const CAM_DEPTH = 1 / Math.tan((CFG.FOV / 2) * Math.PI / 180);
const cam = { x: 0, z: 0 };

let W = 0, H = 0, CX = 0, HORIZON = 0, CAM_H = 1900, DPR = 1, quality = 1;
let skyGrad = null, groundGrad = null, fogGrad = null, safeTop = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, quality ? 1.5 : 1.0);
  W = Math.max(240, innerWidth); H = Math.max(300, innerHeight);
  canvasEl.width = Math.round(W * DPR); canvasEl.height = Math.round(H * DPR);
  canvasEl.style.width = W + "px"; canvasEl.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  CX = W / 2;
  const portrait = H >= W;
  HORIZON = H * (portrait ? 0.34 : 0.26);
  // Derive the camera height so the hero's feet always land at the same screen
  // fraction — keeps the framing identical in portrait and landscape.
  const feet = H * (portrait ? 0.74 : 0.80);
  CAM_H = Math.max(500, Math.min(3200, (feet - HORIZON) / (CAM_DEPTH / CFG.CAM_BACK * CX)));
  buildGradients();
}
addEventListener("resize", resize);
addEventListener("orientationchange", () => setTimeout(resize, 150));

function buildGradients() {
  skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON + 4);
  skyGrad.addColorStop(0, "#1d3f76");
  skyGrad.addColorStop(0.45, "#4a86c4");
  skyGrad.addColorStop(0.82, "#8fc4e2");
  skyGrad.addColorStop(1, "#d9e9ef");
  groundGrad = ctx.createLinearGradient(0, HORIZON, 0, H);
  groundGrad.addColorStop(0, "#a8bcc0");
  groundGrad.addColorStop(0.22, "#7b9298");
  groundGrad.addColorStop(1, "#31424c");
  fogGrad = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + (H - HORIZON) * 0.22);
  fogGrad.addColorStop(0, "rgba(226,240,240,.8)");
  fogGrad.addColorStop(1, "rgba(226,240,240,0)");
}

const px_ = (wx, sc) => CX + (wx - cam.x) * sc;
const py_ = (wy, sc) => HORIZON + (CAM_H - wy) * sc;
const scaleAt = (dz) => (CAM_DEPTH / dz) * CX;

/* ============================ 9. World state ============================ */

const ST = { LOAD: 0, TITLE: 1, RUN: 2, PAUSE: 3, DEAD: 4 };

const G = {
  state: ST.LOAD,
  z: 0, m: 0, speed: CFG.SPEED_MIN, score: 0, coins: 0, combo: 0,
  lane: 1, fromX: 0, toX: 0, laneT: 1, x: 0,
  y: 0, vy: 0, grounded: true, rolling: 0, runPhase: 0,
  invuln: 0, revived: 0, seed: 1, jetNext: 0, demo: false,
  pu: [0, 0, 0, 0],
  shake: 0, tilt: 0, flash: 0, chaser: 0,
  nextZ: 0, nextPU: 0, lastGrade: 1,
  obs: [], coinArr: [], parts: [], partN: 0,
};

const laneX = (l) => (l - 1) * CFG.LANE_W;

function resetRun(seed) {
  G.seed = (seed >>> 0) || 1;
  rng = mulberry32(G.seed);
  G.z = 0; G.m = 0; G.speed = CFG.SPEED_MIN; G.score = 0; G.coins = 0; G.combo = 0;
  G.lane = 1; G.x = 0; G.fromX = 0; G.toX = 0; G.laneT = 1;
  G.y = 0; G.vy = 0; G.grounded = true; G.rolling = 0; G.runPhase = 0;
  G.invuln = 0; G.revived = 0; G.jetNext = 0; G.demo = false;
  SFX.muted = false; botCool = 0;
  G.pu[0] = G.pu[1] = G.pu[2] = G.pu[3] = 0;
  G.shake = 0; G.tilt = 0; G.flash = 0; G.chaser = 3400;
  G.obs.length = 0; G.coinArr.length = 0; G.partN = 0;
  G.nextZ = 9000; G.nextPU = 15000; G.lastGrade = 1;
  cam.x = 0; cam.z = -CFG.CAM_BACK;
  Input.clear();
}

/* ============================ 10. Content patterns ============================
   Each module is graded trivial(0) / normal(1) / tight(2) and gated by distance so
   exactly one new answer is introduced at a time; a tight module is always followed
   by a breather. */

function addObs(type, lane, z, extra) {
  const s = OBS[type];
  const o = {
    type, x: laneX(lane), z, w: s.w, y0: s.y0, y1: s.y1, zl: s.zl, base: 0,
    img: s.img, walk: !!s.walk, slope: !!s.slope, box: !!s.box, vz: 0, hit: false, dead: 0,
  };
  if (extra) Object.assign(o, extra);
  G.obs.push(o);
  return o;
}
const addCoin = (lane, z, y) => G.coinArr.push({ x: laneX(lane), y: y ?? 300, z, got: 0, pu: null, dead: 0 });
function coinLine(lane, z, n, step, y) { for (let i = 0; i < n; i++) addCoin(lane, z + i * (step || 900), y); }
function coinArc(lane, z, n, step, peak) {
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    addCoin(lane, z + i * step, 300 + Math.sin(u * Math.PI) * peak);
  }
}
const other = (l) => (l === 0 ? (rng() < .5 ? 1 : 2) : l === 2 ? (rng() < .5 ? 0 : 1) : (rng() < .5 ? 0 : 2));
const freeOf = (a, b) => (a + b === 1 ? 2 : a + b === 2 ? 1 : a + b === 3 ? 0 : a === 0 ? 1 : 0);

const PATTERNS = [
  { id: "coins", minM: 0, grade: 0, len: 7000, build(z) { coinLine(ri(3), z + 1200, 7, 850); } },
  { id: "coin_field", minM: 0, grade: 0, len: 9000, build(z) {
      for (let l = 0; l < 3; l++) coinLine(l, z + 1400 + l * 500, 5, 1000);
    } },
  { id: "breather", minM: 250, grade: 0, len: 10000, build(z) {
      for (let i = 0; i < 3; i++) coinArc(i, z + 1800 + i * 700, 6, 800, 260);
    } },
  { id: "barrier1", minM: 0, grade: 1, len: 8000, build(z) {
      const l = ri(3); addObs("barrier", l, z + 3400); coinArc(l, z + 1700, 7, 560, 640);
    } },
  { id: "barrier2", minM: 350, grade: 2, len: 9000, build(z) {
      const a = ri(3), b = other(a);
      addObs("barrier", a, z + 3400); addObs("barrier", b, z + 3400);
      coinLine(freeOf(a, b), z + 1800, 6, 800);
    } },
  { id: "gantry1", minM: 260, grade: 1, len: 8000, build(z) {
      const l = ri(3); addObs("gantry", l, z + 3400); coinLine(l, z + 1900, 7, 700, 190);
    } },
  { id: "gantry2", minM: 620, grade: 2, len: 9000, build(z) {
      const a = ri(3), b = other(a);
      addObs("gantry", a, z + 3400); addObs("gantry", b, z + 3400);
      coinLine(freeOf(a, b), z + 1900, 6, 800);
    } },
  { id: "train1", minM: 600, grade: 1, len: 14000, build(z) {
      const l = ri(3); addObs("train", l, z + 5600); coinLine(other(l), z + 2000, 10, 900);
    } },
  { id: "train2", minM: 1000, grade: 2, len: 15000, build(z) {
      const a = ri(3), b = other(a);
      addObs("train", a, z + 5800); addObs("train", b, z + 5800);
      coinLine(freeOf(a, b), z + 2200, 11, 900);
    } },
  { id: "gate", minM: 1150, grade: 2, len: 16000, build(z) {
      addObs("train", 0, z + 5600); addObs("train", 2, z + 5600);
      addObs("barrier", 1, z + 12000);
      coinArc(1, z + 10000, 8, 560, 660);
    } },
  { id: "zigzag", minM: 800, grade: 2, len: 15000, build(z) {
      let l = ri(3);
      for (let i = 0; i < 3; i++) {
        addObs(rng() < .5 ? "barrier" : "gantry", l, z + 3200 + i * 3800);
        const n = other(l); coinLine(n, z + 3200 + i * 3800, 3, 700); l = n;
      }
    } },
  { id: "slalom", minM: 1400, grade: 2, len: 16000, build(z) {
      const l = ri(3);
      addObs("barrier", l, z + 3200); addObs("gantry", l, z + 6800); addObs("barrier", l, z + 10400);
      coinArc(l, z + 1600, 5, 560, 640); coinLine(l, z + 5400, 4, 620, 190);
    } },
  { id: "ramp_roof", minM: 1500, grade: 2, len: 22000, build(z) {
      const l = ri(3);
      addObs("ramp", l, z + 3400);                                   // spans 2000..4800
      addObs("train", l, z + 8150);                                  // spans 4850..11450
      coinLine(l, z + 5400, 8, 780, 1470);                           // reward line on the roof
      addObs("gantry", l, z + 9400, { y0: 1650, y1: 2600, base: 1180 });
      coinLine(other(l), z + 3000, 6, 900);
    } },
  { id: "moving", minM: 1900, grade: 2, len: 19000, build(z) {
      const l = ri(3);
      addObs("train", l, z + 6400, { vz: 3200 });
      coinLine(other(l), z + 2400, 12, 900);
    } },
  { id: "gauntlet", minM: 2300, grade: 2, len: 27000, build(z) {
      const a = ri(3), b = other(a), c = freeOf(a, b);
      addObs("train", a, z + 5000); addObs("train", b, z + 5000);
      addObs("gantry", c, z + 13200);
      addObs("barrier", a, z + 18000); addObs("barrier", c, z + 18000);
      coinLine(c, z + 4200, 7, 800, 190);
      coinArc(b, z + 16000, 7, 560, 640);
    } },
];

function spawnAhead() {
  while (G.nextZ < G.z + CFG.SPAWN_AHEAD) {
    const wantEasy = G.lastGrade >= 2;               // compression is always followed by expansion
    let chosen = PATTERNS[0];
    let n = 0;
    for (let i = 0; i < PATTERNS.length; i++) {
      const p = PATTERNS[i];
      if (p.minM > G.m) continue;
      if (wantEasy && p.grade !== 0) continue;
      n++;
      if (rng() < 1 / n) chosen = p;                 // reservoir pick — no array allocation
    }
    chosen.build(G.nextZ);
    G.lastGrade = chosen.grade;
    G.nextZ += chosen.len;
  }
  if (G.z + CFG.SPAWN_AHEAD > G.nextPU) {
    const k = G.m < 400 ? (rng() < .5 ? PU.magnet : PU.x2) : ri(4);
    G.coinArr.push({ x: laneX(ri(3)), y: 430, z: G.nextPU, got: 0, pu: k, dead: 0 });
    G.nextPU += 22000 + ri(16000);
  }
}

/* ============================ 11. Particles ============================ */

function emit(x, y, z, n, kind) {
  if (!SAVE.fx) return;
  for (let i = 0; i < n && G.partN < CFG.MAX_PARTICLES; i++) {
    const p = G.parts[G.partN] || (G.parts[G.partN] = {});
    p.x = x; p.y = y; p.z = z;
    p.vx = (rng() - .5) * (kind === 2 ? 2600 : 900);
    p.vy = kind === 2 ? rng() * 2600 : 200 + rng() * 900;
    p.vz = (rng() - .5) * (kind === 2 ? 2600 : 700);
    p.life = p.max = (kind === 2 ? 700 : 420) + rng() * 260;
    p.s = kind === 2 ? 180 : 110;
    p.dead = 0;
    G.partN++;
  }
}

function stepParticles(s) {
  for (let i = 0; i < G.partN; i++) {
    const p = G.parts[i];
    p.life -= s * 1000;
    if (p.life <= 0) { p.dead = 1; continue; }
    p.x += p.vx * s; p.y += p.vy * s; p.z += p.vz * s;
    p.vy -= 3200 * s;
  }
  let k = 0;
  for (let i = 0; i < G.partN; i++) {
    const p = G.parts[i];
    if (!p.dead) { const q = G.parts[k]; G.parts[k] = p; G.parts[i] = q; k++; }
  }
  G.partN = k;
}

/* ============================ 12. Simulation ============================ */

function tryCommand(c) {
  if (c === CMD.LEFT || c === CMD.RIGHT) {
    const nl = G.lane + (c === CMD.RIGHT ? 1 : -1);
    if (nl < 0 || nl > 2) return true;
    G.lane = nl; G.fromX = G.x; G.toX = laneX(nl); G.laneT = 0;
    G.tilt = c === CMD.RIGHT ? 1 : -1;
    return true;
  }
  if (c === CMD.JUMP) {
    if (G.pu[PU.jet] > 0) return true;
    if (!G.grounded) return false;                    // buffer it until we land
    G.vy = CFG.JUMP_V; G.grounded = false; G.rolling = 0;
    SFX.jump(); emit(G.x, G.y, G.z, 6, 0);
    return true;
  }
  if (c === CMD.ROLL) {
    if (G.pu[PU.jet] > 0) return true;
    if (!G.grounded) { G.vy = Math.min(G.vy, CFG.DIVE_V); return true; }   // dive
    G.rolling = CFG.ROLL_TIME; SFX.roll();
    return true;
  }
  return true;
}

function consumeInput(now) {
  for (let guard = 0; guard < 4 && Input.qn; guard++) {
    const cmd = Input.queue[0];
    if (tryCommand(cmd.c)) { Input.shift(); continue; }
    if (now - cmd.t > CFG.BUFFER_MS) { Input.shift(); continue; }
    break;
  }
}

const heroHeight = () => (G.rolling > 0 ? CFG.HERO_ROLL_H : CFG.HERO_H);

function teach(key, strKey) {
  if (SAVE.taught[key]) return;
  SAVE.taught[key] = 1; persist();
  showToast(t(strKey));
}

function update(dt) {                                 // dt in ms, fixed step
  const s = dt / 1000, now = performance.now();
  if (G.demo) autopilot(dt); else Input.pollPad();
  consumeInput(now);

  G.speed = CFG.SPEED_MIN + (CFG.SPEED_MAX - CFG.SPEED_MIN) * Math.min(1, G.m / CFG.SPEED_RAMP_M);
  G.z += G.speed * s;
  G.m = G.z / CFG.U_PER_M;

  if (G.laneT < 1) {
    G.laneT = Math.min(1, G.laneT + dt / CFG.LANE_TIME);
    const u = 1 - Math.pow(1 - G.laneT, 3);
    G.x = G.fromX + (G.toX - G.fromX) * u;
  } else G.x = G.toX;
  G.tilt *= Math.pow(0.86, dt / 16.67);

  for (let i = 0; i < 4; i++) if (G.pu[i] > 0) G.pu[i] = Math.max(0, G.pu[i] - dt);
  if (G.invuln > 0) G.invuln -= dt;
  if (G.rolling > 0) G.rolling -= dt;
  if (G.chaser > 0) G.chaser -= dt;
  if (G.flash > 0) G.flash -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);

  const jet = G.pu[PU.jet] > 0;
  if (jet) {
    G.y += (CFG.JET_Y - G.y) * Math.min(1, s * 6);
    G.vy = 0; G.grounded = false; G.rolling = 0;
    if (SAVE.fx && rng() < 0.5) emit(G.x, G.y - 60, G.z - 140, 1, 1);
  } else {
    G.vy -= CFG.GRAV * s;
    G.y += G.vy * s;
  }

  spawnAhead();

  /* ---- obstacles: movement, support surfaces and collision ---- */
  let support = 0, crashed = false;
  const bottom = G.y, top = G.y + heroHeight();
  for (let i = 0; i < G.obs.length; i++) {
    const o = G.obs[i];
    if (o.vz) o.z += o.vz * s;
    if (o.z + o.zl / 2 < G.z - CFG.DESPAWN_BEHIND) { o.dead = 1; continue; }
    if (jet) continue;
    if (Math.abs(G.z - o.z) > o.zl / 2 + CFG.HERO_HZ) continue;
    if (Math.abs(G.x - o.x) > o.w / 2 + CFG.HERO_HW) continue;

    if (o.slope) {                                    // a ramp carries the hero up its length
      const u = Math.min(1, Math.max(0, (G.z - (o.z - o.zl / 2)) / o.zl));
      const surf = u * o.y1;
      if (bottom >= surf - CFG.LAND_TOL && G.vy <= 0) {
        if (support < surf) support = surf;
        if (!o.hit) { o.hit = true; teach("ramp", "tutRamp"); emit(G.x, surf, G.z, 6, 0); }
      }
      continue;
    }
    if (o.walk && bottom >= o.y1 - CFG.LAND_TOL && G.vy <= 0) {
      if (support < o.y1) support = o.y1;
      continue;
    }
    if (bottom < o.y1 - 20 && top > o.y0 + 20) crashed = true;
  }
  compact(G.obs);

  if (!jet) {
    if (G.vy <= 0 && G.y <= support) {
      if (!G.grounded && G.y < support - 6) emit(G.x, support, G.z, 5, 0);
      G.y = support; G.vy = 0; G.grounded = true;
    } else G.grounded = false;
  }

  if (crashed && G.invuln <= 0) {
    if (G.demo) { G.invuln = 1200; G.shake = 140; }
    else if (G.pu[PU.board] > 0) {
      G.pu[PU.board] = 0; G.invuln = CFG.INVULN_MS; G.chaser = 900;
      G.shake = 260; G.flash = 160;
      SFX.save(); emit(G.x, G.y + 200, G.z, 18, 2); showToast(t("boardSaved"));
    } else { die(); return; }
  }

  /* ---- coins & power-ups ---- */
  const magnet = G.pu[PU.magnet] > 0;
  const eyeY = G.y + heroHeight() * 0.45;
  for (let i = 0; i < G.coinArr.length; i++) {
    const c = G.coinArr[i];
    if (c.got || c.z < G.z - CFG.DESPAWN_BEHIND) { c.dead = 1; continue; }
    if (magnet && c.pu === null) {
      const dz = c.z - G.z;
      if (dz > -400 && dz < CFG.MAGNET_R) {
        const k = Math.min(1, s * 7);
        c.x += (G.x - c.x) * k;
        c.y += (G.y + 300 - c.y) * k;
        c.z += (G.z + 140 - c.z) * k * 0.55;
      }
    }
    if (Math.abs(c.z - G.z) < 250 && Math.abs(c.x - G.x) < 370 && Math.abs(c.y - eyeY) < 640) {
      c.got = 1; c.dead = 1;
      if (c.pu !== null) activatePU(c.pu);
      else {
        G.coins++; G.combo++;
        G.score += CFG.COIN_SCORE * (G.pu[PU.x2] > 0 ? 2 : 1);
        SFX.coin(G.combo); emit(c.x, c.y, c.z, 3, 1);
      }
    }
  }
  compact(G.coinArr);

  if (jet && G.z > G.jetNext) {                       // the jetpack lays its own coin trail
    G.jetNext = G.z + 800;
    G.coinArr.push({ x: G.x, y: CFG.JET_Y + 280, z: G.z + 24000, got: 0, pu: null, dead: 0 });
  }

  G.score += (G.speed * s / CFG.U_PER_M) * (G.pu[PU.x2] > 0 ? 2 : 1);

  stepParticles(s);
  lookAheadTeach();

  cam.x += (G.x * CFG.CAM_LAG - cam.x) * Math.min(1, s * 9);
  cam.z = G.z - CFG.CAM_BACK;
  G.runPhase += (G.speed / 2600) * s;
}

function compact(arr) {
  let k = 0;
  for (let i = 0; i < arr.length; i++) { const o = arr[i]; if (!o.dead) arr[k++] = o; }
  arr.length = k;
}

/* ---- autopilot: drives the title-screen attract mode and the ?bot=1 test run ---- */
let botCool = 0;

function laneFree(lane, z0, z1) {
  const lx = laneX(lane);
  for (let i = 0; i < G.obs.length; i++) {
    const o = G.obs[i];
    if (o.slope) continue;
    if (Math.abs(o.x - lx) > o.w / 2 + CFG.HERO_HW) continue;
    if (o.z + o.zl / 2 < z0 || o.z - o.zl / 2 > z1) continue;
    return false;
  }
  return true;
}

function autopilot(dt) {
  botCool -= dt;
  if (botCool > 0 || Input.qn) return;
  const react = G.speed * 0.9;                        // roughly a second of track
  let near = null, nearDz = 1e9;
  for (let i = 0; i < G.obs.length; i++) {
    const o = G.obs[i];
    if (o.slope) continue;
    const dz = (o.z - o.zl / 2) - G.z;
    if (dz < -o.zl || dz > react) continue;
    if (Math.abs(o.x - G.x) > o.w / 2 + CFG.HERO_HW) continue;
    if (dz < nearDz) { nearDz = dz; near = o; }
  }

  if (near) {
    const soon = nearDz < G.speed * 0.34;
    if (near.type === "barrier" && G.grounded && soon) { Input.push(CMD.JUMP); botCool = 280; return; }
    if (near.type === "gantry" && G.grounded && soon) { Input.push(CMD.ROLL); botCool = 280; return; }
    const z1 = G.z + react + 1400;
    const canL = G.lane > 0 && laneFree(G.lane - 1, G.z - 500, z1);
    const canR = G.lane < 2 && laneFree(G.lane + 1, G.z - 500, z1);
    if (canL || canR) {
      Input.push(canL && (!canR || rng() < 0.5) ? CMD.LEFT : CMD.RIGHT);
      botCool = 210; return;
    }
    if (G.grounded && near.type === "barrier") { Input.push(CMD.JUMP); botCool = 280; }
    return;
  }

  // nothing in the way: drift toward whichever free lane pays the most
  let bestLane = G.lane, bestN = 0;
  for (let l = 0; l < 3; l++) {
    if (!laneFree(l, G.z - 500, G.z + react + 1400)) continue;
    let n = 0;
    const lx = laneX(l);
    for (let i = 0; i < G.coinArr.length; i++) {
      const c = G.coinArr[i], dz = c.z - G.z;
      if (dz < 0 || dz > 14000) continue;
      if (Math.abs(c.x - lx) < 320) n += c.pu !== null ? 9 : 1;
    }
    if (n > bestN) { bestN = n; bestLane = l; }
  }
  if (bestLane !== G.lane) {
    Input.push(bestLane < G.lane ? CMD.LEFT : CMD.RIGHT);
    botCool = 330;
  }
}

function lookAheadTeach() {
  if (G.demo) return;
  if (SAVE.taught.jump && SAVE.taught.roll && SAVE.taught.swipe) return;
  for (let i = 0; i < G.obs.length; i++) {
    const o = G.obs[i], dz = o.z - G.z;
    if (dz < 3500 || dz > 10000) continue;
    if (Math.abs(o.x - G.x) > 300) continue;
    if (o.type === "barrier") { teach("jump", "tutJump"); return; }
    if (o.type === "gantry") { teach("roll", "tutRoll"); return; }
    if (o.type === "train") { teach("swipe", "tutSwipe"); return; }
  }
}

function activatePU(kind) {
  SFX.power();
  G.pu[kind] = PU_MS[kind];
  if (kind === PU.jet) G.jetNext = 0;
  G.flash = 150;
  showToast(t(PU_KEYS[kind]));
  emit(G.x, G.y + 300, G.z, 14, 1);
}

function die() {
  G.state = ST.DEAD;
  G.shake = 420; G.flash = 220; G.chaser = 1800;
  SFX.crash(); emit(G.x, G.y + 220, G.z, 26, 2);
  if (navigator.vibrate && SAVE.fx) { try { navigator.vibrate(90); } catch {} }
  SAVE.coins += G.coins;
  const sc = Math.floor(G.score), isBest = sc > SAVE.best;
  if (isBest) SAVE.best = sc;
  persist();
  setTimeout(() => showGameOver(isBest), 640);
}

/* ============================ 13. Rendering ============================ */

// One depth-sorted draw list so coins, obstacles and particles occlude correctly.
let DRAW = [], drawN = 0;
function dpush(kind, ref, dz) {
  let e = DRAW[drawN];
  if (!e) e = DRAW[drawN] = { k: 0, o: null, dz: 0 };
  e.k = kind; e.o = ref; e.dz = dz; drawN++;
}
const byDepth = (a, b) => b.dz - a.dz;

function drawSky() {
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, HORIZON + 2);
  const city = IMG.city;
  if (!city) return;
  const ch = H * 0.30, cw = ch * (city.width / city.height);
  const span = Math.max(cw, 1);
  let off = -(((cam.x * 0.05 + cam.z * 0.004) % span + span) % span);
  const y = HORIZON - ch * 0.92;
  for (let x = off; x < W; x += span) ctx.drawImage(city, x, y, cw, ch);
}

function drawGround() {
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  const tile = IMG.trackTile;
  const bands = quality ? CFG.BANDS : 28;
  const K = CAM_DEPTH * CAM_H * CX;
  const span = H - HORIZON;
  const TILE_LEN = 2600;                              // world units per tile repeat

  if (tile) {
    const th = tile.height / 2, tw = tile.width;
    for (let i = 0; i < bands; i++) {
      const y0 = H - span * (i / bands);
      const y1 = H - span * ((i + 1) / bands);
      const d0 = K / Math.max(1, y0 - HORIZON);
      const d1 = K / Math.max(1, y1 - HORIZON);
      if (d0 > CFG.DRAW_DIST) break;
      const sc = scaleAt((d0 + d1) * 0.5);
      const halfW = CFG.ROAD_HALF * sc;
      if (halfW < 0.5) break;
      const cxs = px_(0, sc);
      let dv = (d1 - d0) / TILE_LEN;
      if (dv > 0.98) dv = 0.98;
      let v0 = ((cam.z + d0) / TILE_LEN) % 1; if (v0 < 0) v0 += 1;
      ctx.drawImage(tile, 0, v0 * th, tw, Math.max(0.7, dv * th),
        cxs - halfW, y1, halfW * 2, (y0 - y1) + 1.2);
    }
  } else {
    const scN = scaleAt(K / Math.max(1, H - HORIZON));
    ctx.fillStyle = "#4c5a63";
    ctx.beginPath();
    ctx.moveTo(px_(-CFG.ROAD_HALF, scN), H);
    ctx.lineTo(px_(CFG.ROAD_HALF, scN), H);
    ctx.lineTo(px_(CFG.ROAD_HALF * .02, 0.002), HORIZON);
    ctx.lineTo(px_(-CFG.ROAD_HALF * .02, 0.002), HORIZON);
    ctx.closePath(); ctx.fill();
  }

  // roadside pylons — the speed cue
  if (IMG.pylon) {
    const step = 2600;
    const first = Math.ceil((cam.z + 500) / step) * step;
    for (let z = first; z < cam.z + CFG.DRAW_DIST; z += step) {
      const sc = scaleAt(z - cam.z);
      const hgt = 900 * sc, wid = 360 * sc;
      if (hgt < 1.5) continue;
      const gy = py_(0, sc);
      for (let k = 0; k < 2; k++) {
        const x = px_((CFG.ROAD_HALF + 520) * SIDES[k], sc);
        if (x < -wid || x > W + wid) continue;
        ctx.drawImage(IMG.pylon, x - wid / 2, gy - hgt, wid, hgt);
      }
    }
  }

  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, HORIZON, W, (H - HORIZON) * 0.22 + 1);
}

function shadow(wx, wy, wz, worldW, strength) {
  const dz = wz - cam.z;
  if (dz < 150 || dz > CFG.DRAW_DIST * 0.55) return;
  const sc = scaleAt(dz), rw = worldW * sc * 0.5;
  if (rw < 1) return;
  ctx.globalAlpha = 0.3 * strength;
  ctx.fillStyle = "#0b1220";
  ctx.beginPath(); ctx.ellipse(px_(wx, sc), py_(wy, sc), rw, rw * 0.3, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
}

// Flat billboard: wy is the sprite's BOTTOM in world space, worldH its height.
function billboard(img, wx, wy, wz, worldW, worldH, alpha) {
  const dz = wz - cam.z;
  if (dz < 110 || dz > CFG.DRAW_DIST) return;
  const sc = scaleAt(dz), w = worldW * sc, h = worldH * sc;
  if (w < 1 || h < 1) return;
  const x = px_(wx, sc), y = py_(wy, sc);
  if (x + w < -40 || x - w > W + 40) return;
  if (alpha != null && alpha < 1) {
    ctx.globalAlpha = alpha; ctx.drawImage(img, x - w / 2, y - h, w, h); ctx.globalAlpha = 1;
  } else ctx.drawImage(img, x - w / 2, y - h, w, h);
}

// A train is a real box: the rear face is axis-aligned (constant z), the top and
// one side are projected quads. That is what sells the depth.
function drawBox(o) {
  const zn = Math.max(o.z - o.zl / 2, cam.z + 130);
  const zf = o.z + o.zl / 2;
  if (zf - cam.z < 150 || zn - cam.z > CFG.DRAW_DIST) return;
  const scN = scaleAt(zn - cam.z), scF = scaleAt(zf - cam.z);
  const hw = o.w / 2;
  const lN = px_(o.x - hw, scN), rN = px_(o.x + hw, scN);
  const lF = px_(o.x - hw, scF), rF = px_(o.x + hw, scF);
  const tN = py_(o.y1, scN), bN = py_(0, scN);
  const tF = py_(o.y1, scF), bF = py_(0, scF);

  ctx.lineJoin = "round";
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(1, 1.6 * (W / 400));

  // top face
  ctx.fillStyle = "#93a9c0";
  ctx.beginPath(); ctx.moveTo(lN, tN); ctx.lineTo(rN, tN); ctx.lineTo(rF, tF); ctx.lineTo(lF, tF);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  ctx.strokeStyle = "rgba(22,34,58,.35)";              // roof ribs
  for (let i = 1; i < 5; i++) {
    const zr = zn + (zf - zn) * (i / 5);
    const sr = scaleAt(zr - cam.z), yr = py_(o.y1, sr);
    ctx.beginPath();
    ctx.moveTo(px_(o.x - hw, sr), yr); ctx.lineTo(px_(o.x + hw, sr), yr); ctx.stroke();
  }
  ctx.strokeStyle = NAVY;

  // the visible side is the one facing the camera
  const right = o.x - cam.x < 0;
  const xN = right ? rN : lN, xF = right ? rF : lF;
  ctx.fillStyle = "#5d7086";
  ctx.beginPath(); ctx.moveTo(xN, tN); ctx.lineTo(xF, tF); ctx.lineTo(xF, bF); ctx.lineTo(xN, bN);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = CORAL;                              // graffiti stripe
  const sy = (t0, b0) => t0 + (b0 - t0) * 0.55;
  ctx.beginPath();
  ctx.moveTo(xN, sy(tN, bN)); ctx.lineTo(xF, sy(tF, bF));
  ctx.lineTo(xF, sy(tF, bF) + (bF - tF) * 0.13); ctx.lineTo(xN, sy(tN, bN) + (bN - tN) * 0.13);
  ctx.closePath(); ctx.fill();

  // rear face — the generated sprite drops straight into the axis-aligned rect
  const img = IMG[o.img];
  if (img && o.z - o.zl / 2 - cam.z > 130) {
    ctx.drawImage(img, lN, tN, rN - lN, bN - tN);
  } else {
    ctx.fillStyle = "#6f8296";
    ctx.fillRect(lN, tN, rN - lN, bN - tN);
    ctx.strokeRect(lN, tN, rN - lN, bN - tN);
  }
}

// A ramp is a wedge: rear edge on the ground, far edge at roof height.
function drawRamp(o) {
  const zn = Math.max(o.z - o.zl / 2, cam.z + 130), zf = o.z + o.zl / 2;
  if (zf - cam.z < 150 || zn - cam.z > CFG.DRAW_DIST) return;
  const u = Math.min(1, Math.max(0, (zn - (o.z - o.zl / 2)) / o.zl));
  const scN = scaleAt(zn - cam.z), scF = scaleAt(zf - cam.z);
  const hw = o.w / 2;
  const lN = px_(o.x - hw, scN), rN = px_(o.x + hw, scN);
  const lF = px_(o.x - hw, scF), rF = px_(o.x + hw, scF);
  const tN = py_(u * o.y1, scN), bN = py_(0, scN);
  const tF = py_(o.y1, scF), bF = py_(0, scF);

  ctx.lineJoin = "round";
  ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1, 1.6 * (W / 400));
  ctx.fillStyle = "#9fb0c6";
  ctx.beginPath(); ctx.moveTo(lN, tN); ctx.lineTo(rN, tN); ctx.lineTo(rF, tF); ctx.lineTo(lF, tF);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  const right = o.x - cam.x < 0;
  const xN = right ? rN : lN, xF = right ? rF : lF;
  ctx.fillStyle = GREY_D;
  ctx.beginPath(); ctx.moveTo(xN, tN); ctx.lineTo(xF, tF); ctx.lineTo(xF, bF); ctx.lineTo(xN, bN);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // warning striping across the lip
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const a = i / segs, b = (i + 1) / segs;
    ctx.fillStyle = i % 2 ? "#ffffff" : CORAL;
    ctx.beginPath();
    ctx.moveTo(lN + (rN - lN) * a, tN); ctx.lineTo(lN + (rN - lN) * b, tN);
    ctx.lineTo(lN + (rN - lN) * b, tN + (bN - tN) * 0.10);
    ctx.lineTo(lN + (rN - lN) * a, tN + (bN - tN) * 0.10);
    ctx.closePath(); ctx.fill();
  }
}

function drawObstacle(o) {
  if (o.box) { shadow(o.x, 0, o.z - o.zl * 0.25, o.w * 1.15, 1); drawBox(o); return; }
  if (o.slope) { drawRamp(o); return; }
  const img = IMG[o.img];
  if (o.type === "gantry") {
    if (img) billboard(img, o.x, o.base, o.z, o.w * 1.2, o.y1 - o.base);
    return;
  }
  shadow(o.x, 0, o.z, o.w * 1.1, 1);
  if (img) billboard(img, o.x, 0, o.z, o.w * 1.3, o.y1 * 1.18);
}

function drawCoin(c, tms) {
  const dz = c.z - cam.z;
  const sc = scaleAt(dz);
  const bob = Math.sin(tms * 0.004 + c.z * 0.001) * 40;
  const x = px_(c.x, sc), y = py_(c.y + bob, sc);
  if (c.pu !== null) {
    const s = 330 * sc;
    if (s < 2) return;
    const pulse = 1 + Math.sin(tms * 0.006) * 0.08;
    ctx.drawImage(IMG.tokens[c.pu], x - s * pulse / 2, y - s * pulse / 2, s * pulse, s * pulse);
  } else {
    const s = 250 * sc;
    if (s < 1.5) return;
    const f = ((((tms * 0.012 + c.z * 0.0016) | 0) % COIN_FRAMES) + COIN_FRAMES) % COIN_FRAMES;
    ctx.drawImage(IMG.coin, f * COIN_SIZE, 0, COIN_SIZE, COIN_SIZE, x - s / 2, y - s / 2, s, s);
  }
}

function drawParticle(p) {
  const sc = scaleAt(p.z - cam.z);
  const s = p.s * sc * (p.life / p.max);
  if (s < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, p.life / p.max) * 0.9;
  ctx.drawImage(IMG.spark, px_(p.x, sc) - s / 2, py_(p.y, sc) - s / 2, s, s);
  ctx.restore();
}

function heroFrame() {
  if (G.pu[PU.jet] > 0 || !G.grounded) return IMG.hero_jump || IMG.hero_a;
  if (G.rolling > 0) return IMG.hero_roll || IMG.hero_a;
  const f = ((G.runPhase | 0) % 4 + 4) % 4;
  return [IMG.hero_a, IMG.hero_b, IMG.hero_a_m, IMG.hero_b_m][f] || IMG.hero_a;
}

function drawHero(tms) {
  const rolling = G.rolling > 0 && G.grounded;
  const hgt = rolling ? CFG.HERO_ROLL_H * 1.3 : CFG.HERO_H;
  const wid = rolling ? 720 : 540;
  const bob = G.grounded && !rolling ? Math.abs(Math.sin(G.runPhase * Math.PI)) * 22 : 0;
  shadow(G.x, 0, G.z, 470, G.grounded ? 1 : Math.max(0.22, 1 - G.y / 1800));

  const img = heroFrame();
  if (!img) return;
  const sc = scaleAt(CFG.CAM_BACK);
  const x = px_(G.x, sc), y = py_(G.y + bob, sc);
  const w = wid * sc, h = hgt * sc;
  const blink = G.invuln > 0 && ((tms * 0.02) | 0) % 2 === 0 ? 0.4 : 1;

  ctx.save();
  ctx.globalAlpha = blink;
  ctx.translate(x, y);
  ctx.rotate(G.tilt * 0.15);
  if (G.pu[PU.board] > 0) {                            // hoverboard under the feet
    ctx.fillStyle = CORAL; ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1, w * 0.012);
    roundRect(ctx, -w * 0.34, -h * 0.055, w * 0.68, h * 0.075, h * 0.03);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.45 * blink; ctx.fillStyle = TEAL;
    ctx.beginPath(); ctx.ellipse(0, h * 0.035, w * 0.32, h * 0.02, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = blink;
  }
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();

  if (G.pu[PU.jet] > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const fl = 0.7 + Math.sin(tms * 0.03) * 0.3;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(IMG.spark, x - w * 0.32, y - h * 0.10, w * 0.3 * fl, h * 0.42 * fl);
    ctx.drawImage(IMG.spark, x + w * 0.02, y - h * 0.10, w * 0.3 * fl, h * 0.42 * fl);
    ctx.restore();
  }
}

// Scripted: the inspector starts right on the hero's heels and is shaken off.
// He is nearer the camera than the hero, so "falling behind" is animated, not simulated.
function drawChaser(tms) {
  if (G.chaser <= 0 || !IMG.chaser) return;
  const dead = G.state === ST.DEAD;
  const u = Math.min(1, 1 - G.chaser / 3400);
  const a = dead ? 1 : Math.max(0, 1 - u * u * u);
  if (a <= 0.03) return;
  const sc = scaleAt(CFG.CAM_BACK * (0.80 + u * 0.14));
  const scale = (1 - u * 0.3) * (dead ? 1.35 : 1);
  const w = 860 * sc * scale, h = 950 * sc * scale;
  const x = px_(G.x * 0.55 + Math.sin(tms * 0.006) * 70, sc);
  const y = py_(0, sc) + h * 0.06;
  ctx.globalAlpha = a;
  ctx.drawImage(IMG.chaser, x - w / 2, y - h, w, h);
  ctx.globalAlpha = 1;
}

function drawSpeedLines(tms) {
  if (!SAVE.fx) return;
  const u = (G.speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN);
  if (u < 0.3) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255,255,255," + (0.03 + u * 0.07).toFixed(3) + ")";
  ctx.lineWidth = 2;
  const R = Math.min(W, H), n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + tms * 0.0012;
    const r0 = R * (0.32 + (((i * 37 + ((tms * 0.22) | 0)) % 300) / 640));
    const r1 = r0 + R * (0.07 + u * 0.11);
    const y0 = HORIZON + Math.sin(a) * r0;
    if (y0 < HORIZON * 0.55) continue;               // keep the sky clean
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * r0, y0);
    ctx.lineTo(CX + Math.cos(a) * r1, HORIZON + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

function outlineText(txt, x, y, fill) {
  ctx.strokeStyle = "rgba(10,15,24,.85)";
  ctx.lineWidth = 5;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}

function drawHUD() {
  const pad = 14, topPad = pad + safeTop;
  ctx.save();
  ctx.textBaseline = "top"; ctx.lineJoin = "round";

  const big = Math.round(Math.min(42, W * 0.1));
  ctx.font = "900 " + big + "px system-ui,sans-serif";
  ctx.textAlign = "left";
  outlineText(String(Math.floor(G.score)), pad, topPad, "#ffffff");
  ctx.font = "700 " + Math.round(Math.min(15, W * 0.037)) + "px system-ui,sans-serif";
  outlineText(Math.floor(G.m) + " " + t("meters"), pad + 2, topPad + big + 2, "rgba(255,255,255,.75)");

  // coins sit under the pause button so the two never collide
  const cs = Math.round(Math.min(30, W * 0.072));
  const cy = topPad + 48;
  ctx.textAlign = "right";
  ctx.font = "900 " + cs + "px system-ui,sans-serif";
  outlineText(String(G.coins), W - pad - cs - 8, cy, GOLD);
  ctx.drawImage(IMG.coin, 0, 0, COIN_SIZE, COIN_SIZE, W - pad - cs - 2, cy, cs, cs);

  let by = cy + cs + 12;
  for (let i = 0; i < 4; i++) {
    if (G.pu[i] <= 0) continue;
    const bw = Math.min(120, W * 0.3), bh = 8, bx = W - pad - bw;
    ctx.fillStyle = "rgba(10,16,26,.55)";
    roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 6); ctx.fill();
    ctx.fillStyle = PU_COLORS[i];
    roundRect(ctx, bx, by, Math.max(3, bw * (G.pu[i] / PU_MS[i])), bh, 4); ctx.fill();
    by += bh + 8;
  }

  if (G.pu[PU.x2] > 0) {
    ctx.textAlign = "center";
    ctx.font = "900 " + Math.round(Math.min(26, W * 0.062)) + "px system-ui,sans-serif";
    outlineText("×2", CX, topPad + 4, GOLD);
  }
  ctx.restore();
}

function render(tms) {
  let sx = 0, sy = 0;
  if (G.shake > 0 && SAVE.fx) {
    const k = G.shake / 420;
    sx = (Math.random() - .5) * 26 * k; sy = (Math.random() - .5) * 26 * k;
  }
  ctx.save();
  if (sx || sy) ctx.translate(sx, sy);

  drawSky();
  drawGround();

  drawN = 0;
  for (let i = 0; i < G.obs.length; i++) {
    const o = G.obs[i], dz = o.z - cam.z;
    if (dz + o.zl / 2 < 130 || dz - o.zl / 2 > CFG.DRAW_DIST) continue;
    dpush(0, o, dz);
  }
  for (let i = 0; i < G.coinArr.length; i++) {
    const c = G.coinArr[i], dz = c.z - cam.z;
    if (dz < 140 || dz > CFG.DRAW_DIST * 0.75) continue;
    dpush(1, c, dz);
  }
  for (let i = 0; i < G.partN; i++) {
    const p = G.parts[i], dz = p.z - cam.z;
    if (dz < 120 || dz > 16000) continue;
    dpush(2, p, dz);
  }
  DRAW.length = drawN;
  DRAW.sort(byDepth);
  for (let i = 0; i < drawN; i++) {
    const e = DRAW[i];
    if (e.k === 0) drawObstacle(e.o);
    else if (e.k === 1) drawCoin(e.o, tms);
    else drawParticle(e.o);
  }

  drawHero(tms);
  drawChaser(tms);
  ctx.restore();

  drawSpeedLines(tms);
  if (G.flash > 0 && SAVE.fx) {
    ctx.fillStyle = "rgba(255,255,255," + (G.flash / 220 * 0.38).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
  }
  if (G.state === ST.RUN || G.state === ST.PAUSE || G.state === ST.DEAD) drawHUD();
}

/* ============================ 14. UI plumbing ============================ */

const $ = (id) => document.getElementById(id);
const LAYERS = ["loadLayer", "titleLayer", "howLayer", "setLayer", "pauseLayer", "overLayer"];
const show = (id) => LAYERS.forEach((l) => $(l).classList.toggle("show", l === id));
const hideAll = () => LAYERS.forEach((l) => $(l).classList.remove("show"));

let toastT = 0;
function showToast(txt) {
  const el = $("toast");
  el.textContent = txt;
  el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("go"), 1250);
}

function applyStrings() {
  const set = (id, key) => { $(id).textContent = t(key); };
  set("tTitle", "title"); set("loadLogo", "title"); set("loadTxt", "loading");
  set("tTag", "tagline"); set("btnPlay", "play"); set("btnHow", "howToTitle");
  set("btnSet", "settings"); set("tBestL", "best"); set("tCoinsL", "coins");
  set("hTitle", "howToTitle"); set("hSub", "tagline"); set("hSwipe", "howToSwipe");
  set("hUp", "howToUp"); set("hDown", "howToDown"); set("hKeys", "howToKeys");
  set("hPad", "howToPad"); set("btnHowOk", "gotIt");
  set("sTitle", "settings"); set("sSound", "sound"); set("sMusic", "music");
  set("sFx", "effects"); set("sLang", "language"); set("btnSetOk", "close");
  set("pTitle", "pause"); set("btnResume", "resume"); set("btnQuit", "restart");
  set("oTitle", "gameOver"); set("newbest", "newBest"); set("oScoreL", "score");
  set("oDistL", "distance"); set("oCoinsL", "coinsRun");
  set("btnAgain", "restart"); set("btnHome", "title");
  refreshToggles(); refreshTitle();
}

function refreshToggles() {
  const set = (id, on, label) => {
    const b = $(id); b.dataset.on = on ? "1" : "0";
    b.textContent = label ?? (on ? t("on") : t("off"));
  };
  set("tgSound", SAVE.sound); set("tgMusic", SAVE.music); set("tgFx", SAVE.fx);
  set("tgLang", 1, getLang().toUpperCase());
}

function refreshTitle() {
  $("tBest").textContent = SAVE.best;
  $("tCoins").textContent = SAVE.coins;
}

function showGameOver(isBest) {
  $("oScore").textContent = Math.floor(G.score);
  $("oDist").textContent = Math.floor(G.m);
  $("oCoins").textContent = G.coins;
  $("newbest").style.display = isBest ? "block" : "none";
  $("oBest").textContent = t("best") + ": " + SAVE.best + "   ·   " + t("total") + ": " + SAVE.coins;
  const rv = $("btnRevive");
  const can = !G.revived && SAVE.coins >= CFG.REVIVE_COST;
  rv.style.display = G.revived ? "none" : "flex";
  rv.disabled = !can;
  rv.innerHTML = "";
  rv.append(t("revive") + " ");
  const small = document.createElement("small");
  small.textContent = can ? t("reviveCost") : t("notEnoughCoins");
  rv.append(small);
  show("overLayer");
  $("pauseBtn").classList.remove("show");
}

function startRun() {
  const url = new URLSearchParams(location.search);
  const seed = url.has("seed") ? (parseInt(url.get("seed"), 10) || 1) : ((Math.random() * 1e9) | 0);
  resetRun(seed);
  G.demo = url.has("bot"); SFX.muted = G.demo;
  if (devOn && url.has("start")) {                    // dev: jump straight to a distance
    G.z = Math.max(0, parseFloat(url.get("start")) || 0) * CFG.U_PER_M;
    G.m = G.z / CFG.U_PER_M;
    G.nextZ = G.z + 9000; G.nextPU = G.z + 12000;
    cam.z = G.z - CFG.CAM_BACK;
  }
  G.state = ST.RUN;
  hideAll();
  $("pauseBtn").classList.add("show");
  onUserGesture(); SFX.startMusic();
  acc = 0; last = performance.now();
}

function goTitle() {
  resetRun((Math.random() * 1e9) | 0);
  G.demo = true; SFX.muted = true; G.chaser = 0;
  G.z = 300000; G.m = G.z / CFG.U_PER_M;      // attract mode shows the richer patterns
  G.nextZ = G.z + 9000; G.nextPU = G.z + 12000;
  cam.z = G.z - CFG.CAM_BACK;
  spawnAhead();                                // a live demo run behind the title screen
  G.state = ST.TITLE;
  refreshTitle();
  show("titleLayer");
  $("pauseBtn").classList.remove("show");
  SFX.stopMusic();
}

function pause() {
  if (G.state !== ST.RUN) return;
  G.state = ST.PAUSE; show("pauseLayer");
  $("pauseBtn").classList.remove("show");
  SFX.stopMusic();
}
function unpause() {
  if (G.state !== ST.PAUSE) return;
  hideAll(); G.state = ST.RUN;
  $("pauseBtn").classList.add("show");
  SFX.startMusic(); Input.clear();
  acc = 0; last = performance.now();
}

function revive() {
  if (G.revived || SAVE.coins < CFG.REVIVE_COST) return;
  SAVE.coins -= CFG.REVIVE_COST; persist();
  G.revived = 1;
  for (let i = 0; i < G.obs.length; i++) {
    const o = G.obs[i];
    if (o.z > G.z - 4000 && o.z < G.z + 24000) o.dead = 1;
  }
  compact(G.obs);
  G.y = 0; G.vy = 0; G.grounded = true; G.rolling = 0;
  G.invuln = 2200; G.combo = 0; G.state = ST.RUN;
  hideAll(); $("pauseBtn").classList.add("show");
  SFX.startMusic(); SFX.save(); Input.clear();
  acc = 0; last = performance.now();
}

let howReturnsToPlay = false;
$("btnPlay").onclick = () => {
  if (!SAVE.seenHow) { SAVE.seenHow = 1; persist(); howReturnsToPlay = true; show("howLayer"); }
  else startRun();
};
$("btnHow").onclick = () => { howReturnsToPlay = false; show("howLayer"); };
$("btnHowOk").onclick = () => { if (howReturnsToPlay) { howReturnsToPlay = false; startRun(); } else show("titleLayer"); };
$("btnSet").onclick = () => show("setLayer");
$("btnSetOk").onclick = () => show("titleLayer");
$("btnResume").onclick = unpause;
$("btnQuit").onclick = goTitle;
$("btnAgain").onclick = startRun;
$("btnHome").onclick = goTitle;
$("btnRevive").onclick = revive;
$("pauseBtn").onclick = pause;
$("tgSound").onclick = () => { SAVE.sound = SAVE.sound ? 0 : 1; persist(); refreshToggles(); onUserGesture(); };
$("tgMusic").onclick = () => {
  SAVE.music = SAVE.music ? 0 : 1; persist(); refreshToggles();
  if (SAVE.music) { if (G.state === ST.RUN) SFX.startMusic(); } else SFX.stopMusic();
};
$("tgFx").onclick = () => { SAVE.fx = SAVE.fx ? 0 : 1; persist(); refreshToggles(); };
$("tgLang").onclick = () => {
  const i = (LANGS.indexOf(getLang()) + 1) % LANGS.length;
  setLang(LANGS[i]); SAVE.lang = LANGS[i]; persist(); applyStrings();
};

addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") { G.state === ST.PAUSE ? unpause() : pause(); }
  if (e.code === "Enter" && (G.state === ST.TITLE || G.state === ST.DEAD)) startRun();
});
addEventListener("blur", () => { if (G.state === ST.RUN) pause(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && G.state === ST.RUN) pause(); });

/* ============================ 15. Main loop ============================ */

const STEP = 1000 / 60;
let acc = 0, last = performance.now();
let frames = 0, fpsAt = last, fps = 60, slowFor = 0;
const devOn = new URLSearchParams(location.search).has("dev");
if (devOn) $("dev").style.display = "block";

function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;                             // recover from a stall without teleporting

  if (G.state === ST.RUN || G.state === ST.TITLE) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      update(STEP); acc -= STEP; steps++;
      if (G.state !== ST.RUN && G.state !== ST.TITLE) break;
    }
    if (acc > STEP * 5) acc = 0;
  } else if (G.state === ST.DEAD) {
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
    if (G.flash > 0) G.flash -= dt;
    if (G.chaser > 0) G.chaser -= dt;
    stepParticles(dt / 1000);
  }

  if (G.state !== ST.LOAD) render(now);

  frames++;
  if (now - fpsAt >= 500) {
    fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now;
    if (devOn) {
      $("dev").textContent =
        fps + " fps  dpr " + DPR.toFixed(2) + "\nobs " + G.obs.length + "  coins " + G.coinArr.length +
        "\nparts " + G.partN + "  draw " + drawN + "\nspd " + Math.round(G.speed) + "  seed " + G.seed;
    }
    if (G.state === ST.RUN && fps < 46 && quality) {
      if (++slowFor >= 2) { quality = 0; resize(); slowFor = 0; }
    } else slowFor = 0;
  }
}

/* ============================ 16. Boot ============================ */

function measureSafeArea() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px)";
  document.body.appendChild(probe);
  safeTop = probe.getBoundingClientRect().height || 0;
  probe.remove();
}

function checkOrientation() {
  $("rotate").style.display = (innerWidth > innerHeight && innerHeight < 380) ? "flex" : "none";
}
addEventListener("resize", checkOrientation);

(async function boot() {
  measureSafeArea();
  resize();
  applyStrings();
  checkOrientation();
  await loadAssets();
  goTitle();
  requestAnimationFrame(frame);
})();
