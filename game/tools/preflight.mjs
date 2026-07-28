/* Preflight: run the real game in headless Chromium at a phone viewport,
   drive it with touch and keyboard, capture console errors, fps and screenshots. */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../public/", import.meta.url).pathname;
const PORT = 8123;
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".png": "image/png",
  ".mp3": "audio/mpeg", ".json": "application/json", ".css": "text/css",
};

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  const file = join(ROOT, normalize(p === "/" ? "/index.html" : p));
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404).end("nope");
  }
});
await new Promise((r) => server.listen(PORT, r));

const errors = [], warnings = [], requests404 = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  locale: "ru-RU",
});
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if (m.type() === "warning") warnings.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("response", (r) => { if (r.status() >= 400) requests404.push(r.status() + " " + r.url()); });

const url = `http://127.0.0.1:${PORT}/?dev=1&bot=1&start=1500`;
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const shot = (n) => page.screenshot({ path: `../work/shot_${n}.png` });

// --- title screen ---
await shot("1_title");
const titleVisible = await page.locator("#titleLayer.show").isVisible();

// --- start: first run shows the controls card ---
await page.locator("#btnPlay").click();
await page.waitForTimeout(300);
const howVisible = await page.locator("#howLayer.show").isVisible();
await shot("2_howto");
await page.locator("#btnHowOk").click();
await page.waitForTimeout(2600);
await shot("3_run_early");

// --- drive it: touch swipes ---
async function swipe(dx, dy) {
  const x = 195, y = 500;
  await page.touchscreen.tap(x, y).catch(() => {});
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(220);
}
await swipe(-90, 0); await swipe(90, 0); await swipe(0, -90); await swipe(0, 90);

// --- keyboard (physical codes) ---
for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD"]) {
  await page.keyboard.press(k);
  await page.waitForTimeout(200);
}

// --- let it run far enough to reach trains, ramps and power-ups ---
const samples = [];
for (let i = 0; i < 26; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => document.getElementById("dev").textContent);
  samples.push(s);
  if (i === 8) await shot("4_run_mid");
  if (i === 18) await shot("5_run_late");
}

const state = await page.evaluate(() => {
  const d = document.getElementById("dev").textContent;
  return { dev: d, over: !!document.querySelector("#overLayer.show") };
});
await shot("6_final");

// --- crash on purpose is not needed; force game over via the API surface we expose ---
const fpsVals = samples.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
const minFps = Math.min(...fpsVals), avgFps = Math.round(fpsVals.reduce((a, b) => a + b, 0) / fpsVals.length);

// --- landscape sanity ---
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(700);
await shot("7_landscape");
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);

console.log(JSON.stringify({
  titleVisible, howVisible,
  minFps, avgFps, samples: samples.slice(0, 3),
  finalDev: state.dev.replace(/\n/g, " | "),
  gameOverShown: state.over,
  errors, warnings: warnings.slice(0, 5), http4xx: requests404,
}, null, 2));

await browser.close();
server.close();
