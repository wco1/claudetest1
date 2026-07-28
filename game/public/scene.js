/* Rail Rush — 3D scene layer (three.js).

   STYLE FORMULA v2 governs every material and light in this file: glossy 3D toon
   render with smooth rounded low-poly geometry and soft cel shading, chunky rounded
   silhouettes, environment in warm concrete cream and dusty teal with saturated
   sky-blue shadows, hero in vivid coral-orange and white, hazards in saturated
   warning red with white chevrons, coins in glowing electric gold, bright midday
   sun with a warm key light and cool bounce fill.

   The hero never moves in Z: the world scrolls toward the camera. Uniform geometry
   (rails, ballast, side walls) is static; only varying props recycle. */

import * as THREE from "./vendor/three.module.min.js";

export const U = 1 / 300;                  // sim units -> world units (lane = 2.0)

/* ------------------------------------------------------------------ palette */
const C = {
  cream:   0xf2e3c2, creamD: 0xd4bf95,
  concrete:0xd8d5c9, concreteD: 0xa8a89c,
  teal:    0x25c6c0, tealD: 0x16918e,
  coral:   0xff5c2e, coralD: 0xcf3d16, coralL: 0xff8f60,
  gold:    0xffcf1f, goldD: 0xe8a300,
  red:     0xe83f2e, white: 0xf6f2ea,
  navy:    0x1d2b45, steel: 0x9fb0c4, steelD: 0x60728a,
  wood:    0x6b4f3a, ballast: 0xa6a49a,
  sky:     0x8fd0ee, skyHi: 0x3a8fd0, skin: 0xf0b98d, hair: 0x3a2a20,
  glass:   0x24374f, jeans: 0x3b5680, jeansD: 0x2e456a,
  train:   0x2f7fc0, trainD: 0x1f5e94,
};

/* ------------------------------------------------------- toon shading ramp */
function toonRamp(steps) {
  const d = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) d[i] = Math.round(112 + (143 * i) / (steps - 1));
  const t = new THREE.DataTexture(d, steps, 1, THREE.RedFormat);
  t.needsUpdate = true;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
}
let RAMP = null;
const matCache = new Map();
export function toon(color, opts) {
  const key = color + "|" + JSON.stringify(opts || {});
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: RAMP }, opts));
    matCache.set(key, m);
  }
  return m;
}
const basic = (color, opts) => new THREE.MeshBasicMaterial(Object.assign({ color }, opts));

/* --------------------------------------------------------- rounded box geo */
const geoCache = new Map();
export function roundedBox(w, h, d, r = 0.08) {
  const key = [w, h, d, r].join(",");
  let g = geoCache.get(key);
  if (g) return g;
  r = Math.min(r, w / 2.2, h / 2.2, d / 2.2);
  const s = new THREE.Shape();
  const x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -y - r);
  s.lineTo(x, -y - r); s.quadraticCurveTo(x + r, -y - r, x + r, -y);
  s.lineTo(x + r, y);  s.quadraticCurveTo(x + r, y + r, x, y + r);
  s.lineTo(-x, y + r); s.quadraticCurveTo(-x - r, y + r, -x - r, y);
  s.lineTo(-x - r, -y);s.quadraticCurveTo(-x - r, -y - r, -x, -y - r);
  g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, d - r * 2), bevelEnabled: true,
    bevelSize: r, bevelThickness: r, bevelSegments: 2, curveSegments: 3,
  });
  g.center();
  geoCache.set(key, g);
  return g;
}
const box = (w, h, d, color, r) => new THREE.Mesh(roundedBox(w, h, d, r), toon(color));

/* ---------------------------------------------------------- geometry baking
   Prop groups are static once built, so every sub-mesh is flattened into one
   vertex-coloured geometry: 20 draw calls per building becomes 1. */
let VC_MAT = null;
function vcMat() {
  if (!VC_MAT) VC_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP });
  return VC_MAT;
}
function mergeGeos(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
export function bake(group) {
  group.updateMatrixWorld(true);
  const geos = [];
  const c = new THREE.Color();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.normal) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    c.set(o.material.color.getHex()).convertSRGBToLinear();
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) {
      if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
    }
    geos.push(g);
  });
  const mesh = new THREE.Mesh(mergeGeos(geos), vcMat());
  return mesh;
}

/* ------------------------------------------------------------ soft shadow */
function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(20,30,50,.75)");
  rg.addColorStop(0.55, "rgba(20,30,50,.35)");
  rg.addColorStop(1, "rgba(20,30,50,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,235,1)");
  rg.addColorStop(0.25, "rgba(255,201,60,.55)");
  rg.addColorStop(1, "rgba(255,201,60,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* =========================================================== the scene =========================================================== */

export class World {
  constructor(canvas, cfg) {
    this.cfg = cfg;
    RAMP = toonRamp(4);

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: "high-performance",
    });
    this.renderer.setClearColor(C.sky);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbfe4f2, 34, 108);

    this.camera = new THREE.PerspectiveCamera(54, 1, 0.4, 260);
    this.camShake = 0; this.camRoll = 0;

    this.blobTex = blobTexture();
    this.glowTex = glowTexture();

    this.buildLights();
    this.buildSky();
    this.buildGround();
    this.buildProps();
    this.buildCoins();
    this.hero = buildHero();
    this.scene.add(this.hero.root);

    this.heroShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false })
    );
    this.heroShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.heroShadow);

    this.obsPool = new Map();     // type -> [mesh]
    this.obsLive = new Map();     // sim object -> mesh
    this.tmpV = new THREE.Vector3();
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new THREE.Vector3(1, 1, 1);
  }

  /* --------------------------------------------------------------- lights */
  buildLights() {
    // Formula blocks 3-4: warm midday key, cool teal bounce, sky-blue shadow tint.
    const hemi = new THREE.HemisphereLight(0xfff4e2, 0x6fa8ad, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6e0, 1.15);
    sun.position.set(-7, 13, 5);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xa8dcff, 0.35);
    rim.position.set(6, 5, -9);
    this.scene.add(rim);
  }

  /* ------------------------------------------------------------------ sky */
  buildSky() {
    const c = document.createElement("canvas");
    c.width = 4; c.height = 256;
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#2f7fc4");
    grd.addColorStop(0.45, "#78bfe6");
    grd.addColorStop(0.82, "#bfe4f2");
    grd.addColorStop(1, "#e6f2f4");
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(200, 16, 12),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.scene.add(dome);
    this.sky = dome;

    // distant skyline: a ring of blocks that never moves, only re-centred on the camera
    const city = new THREE.Group();
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const r = 118 + rnd() * 22;
      const h = 10 + rnd() * 30;
      const w = 7 + rnd() * 9;
      const shade = [0x8fb0cc, 0x7ea2c2, 0xa2bfd6][i % 3];
      const b = new THREE.Mesh(roundedBox(w, h, w, 0.5), toon(shade, { fog: false }));
      b.position.set(Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r);
      city.add(b);
    }
    const cityBaked = bake(city);
    cityBaked.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, fog: false });
    this.scene.add(cityBaked);
    this.city = cityBaked;

    const clouds = new THREE.Group();
    let cs = 91;
    const crnd = () => ((cs = (cs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 9; i++) {
      const g2 = new THREE.Group();
      const puffs = 3 + ((crnd() * 3) | 0);
      for (let k = 0; k < puffs; k++) {
        const r = 3 + crnd() * 3;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), toon(0xfdfefe, { fog: false }));
        puff.position.set((k - puffs / 2) * 4 + crnd() * 2, crnd() * 1.6, crnd() * 2);
        puff.scale.y = 0.62;
        g2.add(puff);
      }
      const a = (i / 9) * Math.PI * 2 + 0.4;
      const rr = 95 + crnd() * 30;
      g2.position.set(Math.sin(a) * rr, 34 + crnd() * 22, Math.cos(a) * rr);
      clouds.add(g2);
    }
    const cb = bake(clouds);
    cb.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, fog: false });
    this.scene.add(cb);
    this.clouds = cb;
  }

  /* --------------------------------------------------------------- ground */
  buildGround() {
    const LEN = 300, HALF = this.cfg.ROAD_HALF * U;   // 3.0
    const g = new THREE.Group();

    // wide concrete apron
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(46, LEN), toon(0xd6d8cf));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.02, -LEN / 2 + 40);
    g.add(apron);

    // three ballast beds + rails
    for (let l = 0; l < 3; l++) {
      const cx = (l - 1) * this.cfg.LANE_W * U;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.16, LEN), toon(C.ballast));
      bed.position.set(cx, 0.06, -LEN / 2 + 40);
      g.add(bed);
      for (const off of [-0.52, 0.52]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, LEN), toon(C.steel));
        rail.position.set(cx + off, 0.21, -LEN / 2 + 40);
        g.add(rail);
        const web = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, LEN), toon(C.steelD));
        web.position.set(cx + off, 0.15, -LEN / 2 + 40);
        g.add(web);
      }
    }

    // retaining walls either side of the whole yard
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, LEN), toon(C.concrete));
      wall.position.set(s * (HALF + 4.6), 1.3, -LEN / 2 + 40);
      g.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, LEN), toon(C.teal));
      cap.position.set(s * (HALF + 4.6), 2.66, -LEN / 2 + 40);
      g.add(cap);
    }

    // side aprons in flat colour blocks so the yard is not one grey field
    for (const s2 of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.2, LEN), toon(C.concrete));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(s2 * (HALF + 1.9), 0.005, -LEN / 2 + 40);
      g.add(strip);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, LEN), toon(C.tealD));
      curb.position.set(s2 * (HALF + 0.35), 0.13, -LEN / 2 + 40);
      g.add(curb);
    }
    const baked = bake(g);
    this.scene.add(baked);
    this.ground = baked;
  }

  /* ---------------------------------------------------------------- props */
  buildProps() {
    this.props = [];

    // sleepers under every lane, recycled along Z
    this.sleeperStep = 1.05;
    const sleeperGeo = new THREE.BoxGeometry(1.5, 0.1, 0.34);
    const sleeperMat = toon(C.wood);
    this.sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, 3 * 96);
    this.sleepers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sleepers.frustumCulled = false;
    this.scene.add(this.sleepers);

    // lamp posts
    this.lampStep = 13;
    this.lamps = [];
    for (let i = 0; i < 10; i++) {
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5.4, 6), toon(C.steelD));
      pole.position.y = 2.7; grp.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.12), toon(C.steelD));
      arm.position.set(0.7, 5.3, 0); grp.add(arm);
      const head = new THREE.Mesh(roundedBox(0.7, 0.24, 0.42, 0.1), toon(C.cream));
      head.position.set(1.4, 5.18, 0); grp.add(head);
      const b = bake(grp);
      this.lamps.push(b);
      this.scene.add(b);
    }

    // buildings behind the walls
    this.bldStep = 13;
    this.blds = [];
    let seed = 21;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 16; i++) {
      const h = 7 + rnd() * 19, w = 5.5 + rnd() * 7, d = 5.5 + rnd() * 7;
      const shade = [0xf0dcb4, 0xd8c49c, 0xa8cdd6, 0xe6b98e, 0xc9d4b8][i % 5];
      const grp = new THREE.Group();
      const body = new THREE.Mesh(roundedBox(w, h, d, 0.25), toon(shade));
      body.position.y = h / 2; grp.add(body);
      const roof = new THREE.Mesh(roundedBox(w * 0.55, 0.7, d * 0.55, 0.15), toon(C.tealD));
      roof.position.y = h + 0.35; grp.add(roof);
      for (let r = 0; r < 3; r++) {                       // window bands
        const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.7, 0.06), toon(C.glass));
        win.position.set(0, h * (0.28 + r * 0.22), d / 2 + 0.02);
        grp.add(win);
      }
      const b = bake(grp);
      b.userData.h = h;
      this.blds.push(b);
      this.scene.add(b);
    }

    // overhead arches spanning the yard — the strongest depth cue
    this.archStep = 34;
    this.arches = [];
    for (let i = 0; i < 5; i++) {
      const grp = new THREE.Group();
      const HALF = this.cfg.ROAD_HALF * U;
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(roundedBox(0.42, 7.8, 0.42, 0.12), toon(C.steelD));
        leg.position.set(s * (HALF + 1.1), 3.9, 0);
        grp.add(leg);
      }
      const beam = new THREE.Mesh(roundedBox((HALF + 1.3) * 2, 0.55, 0.6, 0.14), toon(C.steel));
      beam.position.y = 7.6; grp.add(beam);
      const sign = new THREE.Mesh(roundedBox(3.0, 0.9, 0.14, 0.1), toon(C.teal));
      sign.position.set(0, 6.85, 0.22); grp.add(sign);
      for (let k = 0; k < 4; k++) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), basic(C.gold));
        lamp.position.set(-2.4 + k * 1.6, 7.2, 0.32); grp.add(lamp);
      }
      const b = bake(grp);
      this.arches.push(b);
      this.scene.add(b);
    }
  }

  /* ---------------------------------------------------------------- coins */
  buildCoins() {
    const MAX = 190;
    const geo = new THREE.CylinderGeometry(0.30, 0.30, 0.08, 14);
    geo.rotateX(Math.PI / 2);
    this.coinMesh = new THREE.InstancedMesh(geo, toon(C.gold, { emissive: 0x6a4a00 }), MAX);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);

    const glowMat = new THREE.SpriteMaterial({
      map: this.glowTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.85, fog: false,
    });
    this.coinGlow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({
        map: this.glowTex, transparent: true, depthWrite: false, opacity: 0.55,
        blending: THREE.AdditiveBlending, fog: false,
      }),
      MAX
    );
    this.coinGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinGlow.frustumCulled = false;
    this.scene.add(this.coinGlow);
    void glowMat;

    // power-up tokens are few — plain meshes from a small pool
    this.tokens = [];
    for (let i = 0; i < 4; i++) {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 8, 18), toon(C.gold, { emissive: 0x6a4a00 }));
      grp.add(ring);
      const core = new THREE.Mesh(roundedBox(0.62, 0.62, 0.2, 0.12), toon(C.white));
      grp.add(core);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 2.6),
        new THREE.MeshBasicMaterial({
          map: this.glowTex, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, fog: false,
        })
      );
      grp.add(glow);
      grp.userData.core = core;
      grp.visible = false;
      this.tokens.push(grp);
      this.scene.add(grp);
    }
    this.tokenColors = [C.coral, C.teal, C.gold, 0xb07cff];
  }

  /* ------------------------------------------------------- obstacle meshes */
  acquire(type) {
    let pool = this.obsPool.get(type);
    if (!pool) { pool = []; this.obsPool.set(type, pool); }
    let m = pool.pop();
    if (!m) { m = buildObstacle(type, this.cfg, this.blobTex); this.scene.add(m); }
    m.visible = true;
    return m;
  }
  release(type, m) {
    m.visible = false;
    this.obsPool.get(type).push(m);
  }

  /* --------------------------------------------------------------- resize */
  resize(w, h, dpr) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const portrait = h >= w;
    this.baseFov = portrait ? 60 : 48;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }
}

/* ================================================= obstacle construction ================================================= */

function buildObstacle(type, cfg, blobTex) {
  const g = new THREE.Group();
  if (type === "train") {
    const w = 580 * U, h = 1180 * U, len = 6600 * U;
    const body = new THREE.Mesh(roundedBox(w, h, len, 0.34), toon(C.train));
    body.position.y = h / 2;
    g.add(body);
    const skirt = new THREE.Mesh(roundedBox(w * 1.02, 0.42, len * 0.99, 0.12), toon(C.navy));
    skirt.position.y = 0.24; g.add(skirt);
    const stripe = new THREE.Mesh(roundedBox(w * 1.03, 0.42, len * 0.985, 0.1), toon(C.gold));
    stripe.position.y = h * 0.52; g.add(stripe);
    const roof = new THREE.Mesh(roundedBox(w * 0.82, 0.24, len * 0.94, 0.12), toon(C.trainD));
    roof.position.y = h + 0.06; g.add(roof);
    // rear face
    const face = new THREE.Mesh(roundedBox(w * 0.86, h * 0.46, 0.12, 0.14), toon(C.glass));
    face.position.set(0, h * 0.66, len / 2 + 0.03); g.add(face);
    for (const s of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), basic(C.red));
      light.position.set(s * w * 0.32, h * 0.24, len / 2 + 0.05); g.add(light);
      // side windows
      for (let i = 0; i < 6; i++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, h * 0.34, len * 0.1), toon(C.glass));
        win.position.set(s * (w / 2 + 0.01), h * 0.66, -len * 0.36 + i * len * 0.145);
        g.add(win);
      }
    }
    for (let i = 0; i < 4; i++) {                            // roof vents
      const v = new THREE.Mesh(roundedBox(0.5, 0.22, 0.7, 0.08), toon(C.teal));
      v.position.set(0, h + 0.24, -len * 0.3 + i * len * 0.2); g.add(v);
    }
  } else if (type === "barrier") {
    const w = 540 * U, h = 430 * U;
    const body = new THREE.Mesh(roundedBox(w, h, 0.5, 0.1), toon(C.white));
    body.position.y = h / 2; g.add(body);
    for (let i = 0; i < 5; i++) {                            // warning chevrons
      const c = new THREE.Mesh(new THREE.BoxGeometry(w / 10, h * 0.86, 0.54), toon(C.red));
      c.position.set(-w / 2 + w / 10 + i * (w / 5), h / 2, 0);
      c.rotation.z = 0.32;
      g.add(c);
    }
    const cap = new THREE.Mesh(roundedBox(w * 1.06, 0.16, 0.62, 0.06), toon(C.navy));
    cap.position.y = h + 0.02; g.add(cap);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), basic(C.gold));
    lamp.position.set(0, h + 0.2, 0); g.add(lamp);
  } else if (type === "gantry") {
    const w = 660 * U, top = 1420 * U, gap = 470 * U;
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(roundedBox(0.24, top, 0.24, 0.07), toon(C.steelD));
      leg.position.set(s * w / 2, top / 2, 0); g.add(leg);
    }
    const beam = new THREE.Mesh(roundedBox(w * 1.12, top - gap, 0.42, 0.12), toon(C.steel));
    beam.position.y = (top + gap) / 2; g.add(beam);
    const panel = new THREE.Mesh(roundedBox(w * 0.9, (top - gap) * 0.6, 0.1, 0.08), toon(C.white));
    panel.position.set(0, (top + gap) / 2, 0.24); g.add(panel);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w * 0.09, (top - gap) * 0.56, 0.06), toon(C.red));
      c.position.set(-w * 0.36 + i * w * 0.18, (top + gap) / 2, 0.3);
      c.rotation.z = 0.3; g.add(c);
    }
  } else if (type === "ramp") {
    const w = 580 * U, h = 1180 * U, len = 2800 * U;
    const shape = new THREE.Shape();
    shape.moveTo(-len / 2, 0); shape.lineTo(len / 2, 0);
    shape.lineTo(len / 2, h); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.rotateY(Math.PI / 2); geo.translate(w / 2, 0, 0);
    const m = new THREE.Mesh(geo, toon(C.steel));
    g.add(m);
    for (let i = 0; i < 6; i++) {                            // striped lip
      const c = new THREE.Mesh(new THREE.BoxGeometry(w / 6, 0.1, 0.5), toon(i % 2 ? C.white : C.red));
      c.position.set(-w / 2 + w / 12 + i * (w / 6), h + 0.04, len / 2 - 0.3);
      g.add(c);
    }
  }
  const out = new THREE.Group();
  out.add(bake(g));
  if (type !== "gantry") {
    const w = type === "train" ? 3.2 : 2.4;
    const l = type === "train" ? 24 : type === "ramp" ? 11 : 2.6;
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, l),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.75 })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.04;
    out.add(sh);
    out.userData.shadow = sh;
  }
  return out;
}

/* ============================================================ the hero ============================================================ */

export function buildHero() {
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.98; root.add(hips);
  const torso = new THREE.Group(); hips.add(torso);

  const chest = new THREE.Mesh(roundedBox(0.66, 0.84, 0.44, 0.17), toon(C.coral));
  chest.position.y = 0.42; torso.add(chest);
  const hood = new THREE.Mesh(roundedBox(0.66, 0.3, 0.42, 0.14), toon(C.coralD));
  hood.position.set(0, 0.8, -0.06); torso.add(hood);
  const pack = new THREE.Mesh(roundedBox(0.48, 0.56, 0.26, 0.12), toon(C.teal));
  pack.position.set(0, 0.44, -0.3); torso.add(pack);
  const buckle = new THREE.Mesh(roundedBox(0.3, 0.1, 0.06, 0.04), toon(C.gold));
  buckle.position.set(0, 0.4, -0.44); torso.add(buckle);

  const neck = new THREE.Group(); neck.position.y = 0.9; torso.add(neck);
  const head = new THREE.Mesh(roundedBox(0.5, 0.5, 0.48, 0.18), toon(C.skin));
  head.position.y = 0.25; neck.add(head);
  const hair = new THREE.Mesh(roundedBox(0.52, 0.27, 0.5, 0.15), toon(C.hair));
  hair.position.y = 0.41; neck.add(hair);
  const cap = new THREE.Mesh(roundedBox(0.54, 0.14, 0.52, 0.07), toon(C.teal));
  cap.position.y = 0.48; neck.add(cap);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(roundedBox(0.07, 0.14, 0.12, 0.04), toon(C.skin));
    ear.position.set(s * 0.27, 0.23, 0); neck.add(ear);
  }

  const limb = (color, w, l) => {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(roundedBox(w, l, w, w * 0.42), toon(color));
    m.position.y = -l / 2; grp.add(m);
    return grp;
  };

  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.44, 0.74, 0); torso.add(shoulder);
    const upper = limb(C.coral, 0.24, 0.42); shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.42; upper.add(elbow);
    const fore = limb(C.coralL, 0.21, 0.4); elbow.add(fore);
    const hand = new THREE.Mesh(roundedBox(0.22, 0.22, 0.22, 0.09), toon(C.skin));
    hand.position.y = -0.44; elbow.add(hand);
    arms.push({ shoulder, elbow, s });

    const hip = new THREE.Group();
    hip.position.set(s * 0.21, 0, 0); hips.add(hip);
    const thigh = limb(C.jeans, 0.28, 0.48); hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.48; thigh.add(knee);
    const shin = limb(C.jeansD, 0.24, 0.44); knee.add(shin);
    const foot = new THREE.Mesh(roundedBox(0.3, 0.18, 0.46, 0.08), toon(C.white));
    foot.position.set(0, -0.5, 0.08); knee.add(foot);
    const sole = new THREE.Mesh(roundedBox(0.31, 0.07, 0.47, 0.03), toon(C.coral));
    sole.position.set(0, -0.56, 0.08); knee.add(sole);
    legs.push({ hip, knee, s });
  }

  const jet = new THREE.Group();
  jet.position.set(0, 0.44, -0.42);
  for (const s of [-1, 1]) {
    const tank = new THREE.Mesh(roundedBox(0.2, 0.5, 0.2, 0.09), toon(C.steel));
    tank.position.set(s * 0.17, 0, 0); jet.add(tank);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.62, 7), toon(C.gold));
    flame.position.set(s * 0.17, -0.56, 0); flame.rotation.x = Math.PI; jet.add(flame);
  }
  jet.visible = false;
  torso.add(jet);

  return { root, hips, torso, neck, arms, legs, jet, board: null };
}

/* Procedural clips. Phase is the run cycle position in radians. */
export function poseHero(h, state, phase, t) {
  const { hips, torso, neck, arms, legs } = h;
  if (h.jet && state !== "jet") h.jet.visible = false;
  const set = (o, x, y, z) => o.rotation.set(x, y || 0, z || 0);

  if (state === "run") {
    const sw = Math.sin(phase), sw2 = Math.sin(phase * 2);
    hips.position.y = 0.98 + Math.abs(sw2) * 0.07;
    set(hips, 0.06, 0, Math.sin(phase) * 0.03);
    set(torso, 0.13, Math.sin(phase) * 0.09, 0);
    set(neck, -0.1, Math.sin(phase) * -0.06, 0);
    legs.forEach((L, i) => {
      const p = phase + (i ? Math.PI : 0);
      set(L.hip, Math.sin(p) * 0.95 - 0.1);
      set(L.knee, Math.max(0, -Math.sin(p - 0.7)) * 1.5);
    });
    arms.forEach((A, i) => {
      const p = phase + (i ? 0 : Math.PI);
      set(A.shoulder, Math.sin(p) * 0.85, 0, -A.s * 0.16);
      set(A.elbow, -0.5 - Math.max(0, Math.sin(p)) * 0.6);
    });
  } else if (state === "jump") {
    hips.position.y = 1.0;
    set(hips, -0.12);
    set(torso, 0.18);
    set(neck, -0.14);
    legs.forEach((L, i) => { set(L.hip, -0.9 + i * 0.18); set(L.knee, 1.5); });
    arms.forEach((A) => { set(A.shoulder, -2.2, 0, -A.s * 0.5); set(A.elbow, -0.3); });
  } else if (state === "fall") {
    hips.position.y = 1.0;
    set(hips, 0.05);
    set(torso, 0.1);
    legs.forEach((L, i) => { set(L.hip, (i ? -0.5 : 0.35)); set(L.knee, 0.7); });
    arms.forEach((A) => { set(A.shoulder, -1.5, 0, -A.s * 0.7); set(A.elbow, -0.5); });
  } else if (state === "roll") {
    hips.position.y = 0.52;
    set(hips, 0.5);
    set(torso, 0.55);
    set(neck, -0.4);
    legs.forEach((L, i) => { set(L.hip, -1.5 + i * 0.2); set(L.knee, 2.0); });
    arms.forEach((A) => { set(A.shoulder, -1.1, 0, -A.s * 0.35); set(A.elbow, -1.5); });
  } else if (state === "jet") {
    h.jet.visible = true;
    h.jet.children.forEach((c, i) => { if (i % 2) c.scale.y = 0.7 + Math.abs(Math.sin(t * 22 + i)) * 0.7; });
    hips.position.y = 0.98;
    set(hips, -0.05);
    set(torso, -0.08);
    legs.forEach((L, i) => { set(L.hip, 0.25 + Math.sin(t * 4 + i) * 0.12); set(L.knee, 0.35); });
    arms.forEach((A) => { set(A.shoulder, 0.4, 0, -A.s * 0.9); set(A.elbow, -0.25); });
  }
}

export { THREE, C };
