/* Rail Rush — the 3D render layer.

   Owns everything between the simulation state and the screen: camera dynamics,
   world scrolling, obstacle/coin pooling, and the 2D HUD overlay drawn on a second
   canvas stacked over the WebGL one. */

import { THREE, World, poseHero, U } from "./scene.js";

const DEG = Math.PI / 180;

export class Renderer {
  constructor(glCanvas, hudCanvas, CFG, PU, PU_MS, PU_COLORS, coinAtlas, t) {
    this.CFG = CFG; this.PU = PU; this.PU_MS = PU_MS; this.PU_COLORS = PU_COLORS;
    this.coinAtlas = coinAtlas; this.t = t;
    this.world = new World(glCanvas, CFG);
    this.ctx = hudCanvas.getContext("2d");
    this.hud = hudCanvas;
    this.W = 0; this.H = 0; this.CX = 0; this.DPR = 1; this.safeTop = 0;

    this.tick = 0;
    this.live = new Map();                 // sim obstacle -> mesh
    this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.m = new THREE.Matrix4();
    this.up = new THREE.Vector3(0, 1, 0);
    this.look = new THREE.Vector3();
    this.HALF = CFG.ROAD_HALF * U;
    this.shake = { x: 0, y: 0, r: 0 };
  }

  resize(W, H, DPR, safeTop) {
    this.W = W; this.H = H; this.CX = W / 2; this.DPR = DPR; this.safeTop = safeTop;
    this.hud.width = Math.round(W * DPR); this.hud.height = Math.round(H * DPR);
    this.hud.style.width = W + "px"; this.hud.style.height = H + "px";
    this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    this.world.resize(W, H, DPR);
  }

  /* ------------------------------------------------------------- camera */
  camera(G, fxOn) {
    const w = this.world, cam = w.camera, CFG = this.CFG;
    const spd = (G.speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN);
    const hy = G.y * U;

    let sx = 0, sy = 0, sr = 0;
    if (G.shake > 0 && fxOn) {
      const k = (G.shake / 420) * 0.34;
      sx = (Math.random() - 0.5) * k; sy = (Math.random() - 0.5) * k;
      sr = (Math.random() - 0.5) * k * 0.12;
    }

    // The camera trails the hero laterally, sits well above the rails looking down,
    // and follows him all the way up when the jetpack fires.
    cam.position.set(G.x * U * 0.55 + sx, 4.7 + hy * 0.72 + sy, 8.9 - spd * 0.7);
    this.look.set(G.x * U * 0.42, 0.9 + hy * 0.92, -12);
    cam.lookAt(this.look);
    cam.rotation.z += G.tilt * 0.05 + sr;
    const fov = w.baseFov + spd * 9;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

    // px-per-world-unit at a given depth, for projecting particles onto the HUD
    this.pxScale = (this.H / 2) / Math.tan((cam.fov / 2) * DEG);
  }

  /* --------------------------------------------------------------- hero */
  heroState(G) {
    if (G.pu[this.PU.jet] > 0) return "jet";
    if (G.rolling > 0 && G.grounded) return "roll";
    if (!G.grounded) return G.vy > 0 ? "jump" : "fall";
    return "run";
  }

  hero(G, tms) {
    const w = this.world, h = w.hero;
    h.root.position.set(G.x * U, G.y * U, 0);
    h.root.rotation.z = -G.tilt * 0.14;
    h.root.rotation.y = G.tilt * 0.20;
    poseHero(h, this.heroState(G), G.runPhase * Math.PI, tms / 1000);

    const blink = G.invuln > 0 && ((tms * 0.007) | 0) % 2 === 0;
    h.root.visible = !blink;

    const hy = Math.max(0, G.y * U);
    const sh = w.heroShadow;
    sh.position.set(G.x * U, 0.05, 0);
    const k = Math.max(0.34, 1 - hy * 0.16);
    sh.scale.set(k, k, k);
    sh.material.opacity = Math.max(0.1, 0.6 - hy * 0.11);
  }

  /* ---------------------------------------------------- scrolling props */
  props(G) {
    const w = this.world;
    const z = G.z * U;
    const HALF = this.HALF;

    // sleepers
    const st = w.sleeperStep, off = z % st;
    const perLane = 90;
    let n = 0;
    for (let l = 0; l < 3; l++) {
      const x = (l - 1) * this.CFG.LANE_W * U;
      for (let i = 0; i < perLane; i++) {
        const pz = off + 6 - i * st;
        this.v.set(x, 0.16, pz);
        this.m.compose(this.v, this.q.identity(), this.s.set(1, 1, 1));
        w.sleepers.setMatrixAt(n++, this.m);
      }
    }
    w.sleepers.count = n;
    w.sleepers.instanceMatrix.needsUpdate = true;

    // lamp posts, alternating sides
    const ls = w.lampStep, lo = z % ls;
    w.lamps.forEach((g, i) => {
      g.position.set((i % 2 ? 1 : -1) * (HALF + 1.5), 0, lo + 8 - i * ls);
      g.rotation.y = i % 2 ? 0 : Math.PI;
    });

    // buildings behind the walls
    const bs = w.bldStep, bo = z % bs;
    w.blds.forEach((g, i) => {
      const side = i % 2 ? 1 : -1;
      g.position.set(side * (HALF + 14 + ((i * 7) % 7)), 0, bo + 6 - ((i / 2) | 0) * bs);
    });

    // overhead arches: they approach, pass over the camera, then wrap far ahead
    const as = w.archStep, ao = z % as, total = as * w.arches.length;
    w.arches.forEach((g, i) => {
      let zz = (i * as - ao) % total;
      if (zz < 0) zz += total;
      g.position.z = 16 - zz;
    });

    // sky, skyline and clouds ride with the camera so they never approach
    w.sky.position.set(w.camera.position.x, 0, w.camera.position.z);
    w.city.position.set(w.camera.position.x * 0.6, 0, w.camera.position.z);
    w.clouds.position.set(w.camera.position.x * 0.3, 0, w.camera.position.z - (z * 0.05) % 40);
  }

  /* ----------------------------------------------------- obstacle meshes */
  obstacles(G) {
    const w = this.world, CFG = this.CFG;
    this.tick++;
    for (let i = 0; i < G.obs.length; i++) {
      const o = G.obs[i];
      const dz = o.z - G.z;
      if (dz < -3200 || dz > CFG.DRAW_DIST) continue;
      let m = this.live.get(o);
      if (!m) { m = w.acquire(o.type); this.live.set(o, m); }
      m.userData.tick = this.tick;
      m.position.set(o.x * U, (o.base || 0) * U, -dz * U);
      if (m.userData.shadow) m.userData.shadow.position.y = 0.03 - (o.base || 0) * U;
    }
    for (const [o, m] of this.live) {
      if (m.userData.tick !== this.tick) { w.release(o.type, m); this.live.delete(o); }
    }
  }

  /* ---------------------------------------------------------- coins */
  coins(G, tms) {
    const w = this.world, CFG = this.CFG;
    const MAX = w.coinMesh.instanceMatrix.count;
    let n = 0, tk = 0;
    const spin = tms * 0.004;
    for (let i = 0; i < G.coinArr.length; i++) {
      const c = G.coinArr[i];
      const dz = c.z - G.z;
      if (dz < -600 || dz > CFG.DRAW_DIST * 0.8) continue;
      const bob = Math.sin(tms * 0.004 + c.z * 0.001) * 0.12;
      const x = c.x * U, y = c.y * U + bob, pz = -dz * U;
      if (c.pu !== null) {
        if (tk >= w.tokens.length) continue;
        const g = w.tokens[tk++];
        g.visible = true;
        g.position.set(x, y, pz);
        g.rotation.y = spin * 1.4;
        g.userData.core.material = g.userData.core.material;
        g.children[1].material.color.setHex(this.PU_COLORS_HEX(c.pu));
        continue;
      }
      if (n >= MAX) continue;
      this.q.setFromAxisAngle(this.up, spin + c.z * 0.002);
      this.m.compose(this.v.set(x, y, pz), this.q, this.s.set(1, 1, 1));
      w.coinMesh.setMatrixAt(n, this.m);
      this.q.identity();
      this.m.compose(this.v.set(x, y, pz + 0.02), this.q, this.s.set(1, 1, 1));
      w.coinGlow.setMatrixAt(n, this.m);
      n++;
    }
    w.coinMesh.count = n;
    w.coinGlow.count = n;
    w.coinMesh.instanceMatrix.needsUpdate = true;
    w.coinGlow.instanceMatrix.needsUpdate = true;
    for (let i = tk; i < w.tokens.length; i++) w.tokens[i].visible = false;
  }

  PU_COLORS_HEX(k) {
    return [0xff6a3d, 0x3fb8b4, 0xffc93c, 0xb07cff][k] || 0xffffff;
  }

  /* ------------------------------------------------------------- frame */
  draw(G, tms, fxOn, ST) {
    this.camera(G, fxOn);
    this.hero(G, tms);
    this.props(G);
    this.obstacles(G);
    this.coins(G, tms);
    this.world.renderer.render(this.world.scene, this.world.camera);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.particles(G, fxOn);
    if (G.flash > 0 && fxOn) {
      ctx.fillStyle = "rgba(255,255,255," + (G.flash / 220 * 0.34).toFixed(3) + ")";
      ctx.fillRect(0, 0, this.W, this.H);
    }
    if (G.state === ST.RUN || G.state === ST.PAUSE || G.state === ST.DEAD) this.drawHUD(G);
  }

  /* Particles live in the sim; project them and draw additively on the HUD. */
  particles(G, fxOn) {
    if (!G.partN || !fxOn) return;
    const ctx = this.ctx, cam = this.world.camera;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < G.partN; i++) {
      const p = G.parts[i];
      const dz = p.z - G.z;
      if (dz < -400 || dz > 14000) continue;
      this.v.set(p.x * U, p.y * U, -dz * U);
      const dist = this.v.distanceTo(cam.position);
      this.v.project(cam);
      if (this.v.z > 1) continue;
      const sx = (this.v.x * 0.5 + 0.5) * this.W;
      const sy = (-this.v.y * 0.5 + 0.5) * this.H;
      const size = (p.s * U) * (this.pxScale / Math.max(0.5, dist)) * (p.life / p.max);
      if (size < 1 || sx < -80 || sx > this.W + 80) continue;
      ctx.globalAlpha = Math.min(1, p.life / p.max) * 0.85;
      ctx.drawImage(this.glowSprite(), sx - size / 2, sy - size / 2, size, size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  glowSprite() {
    if (this._glow) return this._glow;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(0.35, "rgba(255,201,60,.85)");
    rg.addColorStop(1, "rgba(255,201,60,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    this._glow = c;
    return c;
  }

  /* --------------------------------------------------------------- HUD */
  outline(txt, x, y, fill) {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(12,20,34,.8)";
    ctx.lineWidth = 5;
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
  }

  drawHUD(G) {
    const ctx = this.ctx, W = this.W, t = this.t;
    const pad = 14, topPad = pad + this.safeTop;
    ctx.save();
    ctx.textBaseline = "top"; ctx.lineJoin = "round";

    const big = Math.round(Math.min(42, W * 0.1));
    ctx.font = "900 " + big + "px system-ui,sans-serif";
    ctx.textAlign = "left";
    this.outline(String(Math.floor(G.score)), pad, topPad, "#ffffff");
    ctx.font = "700 " + Math.round(Math.min(15, W * 0.037)) + "px system-ui,sans-serif";
    this.outline(Math.floor(G.m) + " " + t("meters"), pad + 2, topPad + big + 2, "rgba(255,255,255,.8)");

    const cs = Math.round(Math.min(30, W * 0.072));
    const cy = topPad + 48;
    ctx.textAlign = "right";
    ctx.font = "900 " + cs + "px system-ui,sans-serif";
    this.outline(String(G.coins), W - pad - cs - 8, cy, "#ffd24a");
    if (this.coinAtlas) ctx.drawImage(this.coinAtlas, 0, 0, 72, 72, W - pad - cs - 2, cy, cs, cs);

    let by = cy + cs + 12;
    for (let i = 0; i < 4; i++) {
      if (G.pu[i] <= 0) continue;
      const bw = Math.min(120, W * 0.3), bh = 8, bx = W - pad - bw;
      ctx.fillStyle = "rgba(12,20,34,.5)";
      this.rrect(bx - 2, by - 2, bw + 4, bh + 4, 6); ctx.fill();
      ctx.fillStyle = this.PU_COLORS[i];
      this.rrect(bx, by, Math.max(3, bw * (G.pu[i] / this.PU_MS[i])), bh, 4); ctx.fill();
      by += bh + 8;
    }

    if (G.pu[this.PU.x2] > 0) {
      ctx.textAlign = "center";
      ctx.font = "900 " + Math.round(Math.min(26, W * 0.062)) + "px system-ui,sans-serif";
      this.outline("×2", this.CX, topPad + 4, "#ffd24a");
    }
    ctx.restore();
  }

  rrect(x, y, w, h, r) {
    const ctx = this.ctx;
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  info() {
    const r = this.world.renderer.info;
    return r.render.calls + " calls  " + Math.round(r.render.triangles / 1000) + "k tris";
  }
}
