// Renders the Chrome Web Store listing assets from the real popup and setup
// pages, driven by fixture state through a stubbed chrome.* API:
//   store/icon-128.png            store icon (96px art on a transparent 128 canvas)
//   store/screenshot-1..5.png     1280x800, 24-bit PNG
//   store/small-tile-440x280.png  24-bit PNG
//   store/marquee-1400x560.png    24-bit PNG
// Intermediate renders land in tools/out/. Run with: node assets.js
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const ffmpeg = require("ffmpeg-static");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(__dirname, "out");
const STORE = path.join(ROOT, "store");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(STORE, { recursive: true });

const fontDir = path.join(__dirname, "node_modules/@fontsource/inter/files");
const fontFace = [400, 600, 700, 800].map(w =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(file://${fontDir}/inter-latin-${w}-normal.woff2) format("woff2")}`).join("");

const dataUri = file => "data:image/png;base64," + fs.readFileSync(file).toString("base64");
const T = new Date(2026, 9, 3, 9, 0).getTime();                 // 3 Oct 2026, 9 days before the 12th

// ---------- fixtures ----------
const SETTINGS = { accrualDay: 12, checkOffsetDays: 1, pauseMaxMonths: 3, minPaidMonthsBetweenPauses: 1, pausedCheckDays: 7 };
const HEALTH = { daysSinceOk: 1, stale: false, neverRan: false, failures: 0, missed: [], host: "audible.co.uk", setupComplete: true };
const CYCLES = [
  { cycle: "2026-08", balance: 14, cap: 6, delta: 1, paused: false },
  { cycle: "2026-09", balance: 15, cap: 6, delta: 1, paused: false },
  { cycle: "2026-10", balance: 15, cap: 6, delta: 0, paused: false }
];
const active = over => ({
  storage: {
    ...SETTINGS, setupComplete: true, marketId: "co.uk", sessionState: "ok", cycles: CYCLES,
    cycleState: { key: "2026-10", earlyOkAt: T, earlyAtRisk: over },
    state: {
      ok: true, checkedAt: T, cycle: "2026-10", phase: "early", balance: over ? 15 : 3, cap: 6, perMonth: 1,
      accrualDate: "2026-10-12", paused: false, delta: over ? 0 : -2, atCap: over, overflowing: over, atRisk: over,
      daysToAccrual: 9, pause: { onHold: false, canPause: true }
    }
  },
  replies: { health: HEALTH }
});
const FIXTURES = {
  atRisk: active(true),
  clear: {
    ...active(false),
    storage: { ...active(false).storage, cycles: [
      { cycle: "2026-08", balance: 6, cap: 6, delta: -1 }, { cycle: "2026-09", balance: 5, cap: 6, delta: -1 }, { cycle: "2026-10", balance: 3, cap: 6, delta: -2 }] }
  },
  onHold: {
    storage: {
      ...SETTINGS, setupComplete: true, marketId: "co.uk", sessionState: "ok",
      cycles: [{ cycle: "2026-08", balance: 15, cap: 6, delta: 1 }, { cycle: "2026-09", balance: 15, cap: 6, delta: 0 }, { cycle: "2026-12", balance: 12, cap: 6, delta: -3, paused: true }],
      spendStart: { needed: 10, balance: 15, deadline: "2026-12-12" },
      state: {
        ok: true, checkedAt: T, cycle: "2026-12", phase: "hold", balance: 12, cap: 6, perMonth: 1,
        accrualDate: "2026-12-12", nextCreditDate: "2026-12-12", holdUntil: "2026-12-03", paused: true, delta: -3,
        atCap: true, overflowing: true, atRisk: false, daysToAccrual: 70,
        pause: { onHold: true, since: "2026-09-10", expectedResume: "2026-12-10", daysLeft: 68 },
        spend: { target: 5, deadline: "2026-12-12", daysLeft: 70, needed: 7, holdEnds: "2026-12-03", done: false, perWeek: 0.7, startNeeded: 10 }
      }
    },
    replies: { health: HEALTH }
  },
  signedOut: {
    storage: {
      ...SETTINGS, setupComplete: true, marketId: "co.uk", sessionState: "signedout", sessionCheckedAt: T,
      cycles: CYCLES, state: { ok: false, kind: "signedout", error: "Not signed in.", balance: 15, checkedAt: T }
    },
    replies: { health: { ...HEALTH, failures: 1 } }
  },
  setup: {
    storage: { marketId: "co.uk", capOverride: null },
    replies: {
      markets: { guess: "co.uk", markets: [
        { id: "co.uk", label: "United Kingdom", host: "audible.co.uk", origin: "https://www.audible.co.uk" },
        { id: "com", label: "United States", host: "audible.com", origin: "https://www.audible.com" },
        { id: "ca", label: "Canada", host: "audible.ca", origin: "https://www.audible.ca" },
        { id: "com.au", label: "Australia", host: "audible.com.au", origin: "https://www.audible.com.au" },
        { id: "in", label: "India", host: "audible.in", origin: "https://www.audible.in" }] },
      probe: { ok: true, marketId: "co.uk", host: "audible.co.uk", balance: 15, perMonth: 1, annual: false, cap: 6, accrualDay: 12,
        accrualDate: "2026-10-12", paused: false, pauseLinkPresent: true, holdUntil: null, suggestedTarget: 5, overflowing: true, atCap: true, orderTrusted: true },
      connect: { ok: true }
    }
  }
};

function stub(fixture) {
  return `(() => {
    const store = ${JSON.stringify(fixture.storage)};
    const replies = ${JSON.stringify(fixture.replies || {})};
    window.chrome = {
      storage: { local: {
        get: async q => {
          if (q == null) return { ...store };
          if (typeof q === "string") return { [q]: store[q] };
          if (Array.isArray(q)) return Object.fromEntries(q.map(k => [k, store[k]]));
          const out = { ...q }; for (const k of Object.keys(q)) if (store[k] !== undefined) out[k] = store[k]; return out;
        },
        set: async () => {}
      } },
      runtime: { sendMessage: async msg => (replies[msg && msg.type] !== undefined ? replies[msg.type] : { ok: true }), getURL: p => p },
      tabs: { create: async () => ({}) },
      permissions: { contains: async () => true, request: async () => true, remove: async () => true }
    };
  })();`;
}

// ---------- the store's dark stage ----------
const stage = (w, h, body, extraCss = "") => `<!doctype html><meta charset="utf-8"><style>
  ${fontFace}
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
  body{font-family:Inter,system-ui,sans-serif;color:#fff;background:
    radial-gradient(1200px 700px at 20% -10%, #24406e 0%, transparent 60%),
    radial-gradient(900px 600px at 110% 110%, #1d3a63 0%, transparent 55%),
    linear-gradient(160deg,#152743 0%,#0d1a30 100%)}
  h1{font-weight:800;letter-spacing:-.02em;margin:0;line-height:1.08}
  p{margin:0;color:rgba(255,255,255,.72);line-height:1.45}
  .shot{border-radius:14px;box-shadow:0 30px 70px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.06)}
  .notif{width:380px;background:#1f1f1f;color:#fff;border-radius:10px;padding:16px 18px 14px;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);font-size:14px}
  .notif .hd{display:flex;gap:10px;align-items:center;font-size:12px;color:rgba(255,255,255,.6);margin-bottom:10px}
  .notif .hd img{width:16px;height:16px;border-radius:3px}
  .notif .t{font-weight:600;font-size:15px;margin-bottom:6px;line-height:1.3}
  .notif .m{color:rgba(255,255,255,.8);line-height:1.4}
  .notif .btns{display:flex;gap:8px;margin-top:14px}
  .notif .btns span{background:#2b2b2b;border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:7px 12px;font-weight:600;font-size:13px}
  .notif .btns span.p{background:#3574d4;border-color:transparent}
  .pill{display:inline-block;background:rgba(255,196,77,.16);color:#ffd27a;border:1px solid rgba(255,196,77,.35);border-radius:999px;padding:5px 12px;font-weight:600;font-size:14px}
  ${extraCss}
</style><body>${body}</body>`;

const notif = (icon, title, msg, buttons = ["Pause membership"]) => `
  <div class="notif">
    <div class="hd"><img src="${icon}"> Google Chrome · Credit Guard for Audible</div>
    <div class="t">${title}</div>
    <div class="m">${msg}</div>
    <div class="btns">${buttons.map((b, i) => `<span class="${i === 0 ? "p" : ""}">${b}</span>`).join("")}</div>
  </div>`;

const to24bit = file => {
  const tmp = file + ".tmp.png";
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", file, "-pix_fmt", "rgb24", tmp]);
  fs.renameSync(tmp, file);
};

(async () => {
  const browser = await chromium.launch();

  // --- popup and setup renders at 2x ---
  async function renderPage(file, fixture, width, outName, { height = 100, fullPage = true } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: "light", locale: "en-GB" });
    await ctx.addInitScript(stub(fixture));
    const page = await ctx.newPage();
    await page.goto("file://" + path.join(SRC, file));
    await page.waitForFunction(() => !/Loading…|Checking…|Waiting for step 1/.test(document.body.textContent));
    await page.waitForTimeout(300);
    const out = path.join(OUT, outName);
    await page.screenshot({ path: out, fullPage });
    await ctx.close();
    return out;
  }
  const popupAtRisk = await renderPage("popup.html", FIXTURES.atRisk, 352, "popup-atrisk.png");
  const popupClear = await renderPage("popup.html", FIXTURES.clear, 352, "popup-clear.png");
  const popupHold = await renderPage("popup.html", FIXTURES.onHold, 352, "popup-onhold.png");
  const popupOut = await renderPage("popup.html", FIXTURES.signedOut, 352, "popup-signedout.png");
  const setupShot = await renderPage("setup.html", FIXTURES.setup, 600, "setup.png", { height: 640, fullPage: false });
  console.log("rendered popup + setup");

  // --- icon: SVG art at 96px on a transparent 128 canvas (store), plus a 256px render for tiles ---
  async function renderIcon(size, canvas, outName) {
    const ctx = await browser.newContext({ viewport: { width: canvas, height: canvas }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const svg = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
    await page.setContent(`<style>html,body{margin:0;background:transparent}body{width:${canvas}px;height:${canvas}px;display:grid;place-items:center}svg{width:${size}px;height:${size}px}</style>${svg}`);
    const out = path.join(outName.startsWith("store/") ? ROOT : OUT, outName);
    await page.screenshot({ path: out, omitBackground: true });
    await ctx.close();
    return out;
  }
  const iconStore = await renderIcon(96, 128, "store/icon-128.png");
  const iconBig = await renderIcon(256, 256, "icon-256.png");
  const iconSmall = await renderIcon(32, 32, "icon-32.png");
  console.log("rendered icons");

  // --- 1280x800 screenshots ---
  async function frame(w, h, html, outName, extraCss) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const htmlFile = path.join(OUT, "frame-" + outName.replace(/\.png$/, ".html"));
    fs.writeFileSync(htmlFile, stage(w, h, html, extraCss));
    await page.goto("file://" + htmlFile);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const out = path.join(STORE, outName);
    await page.screenshot({ path: out });
    await ctx.close();
    to24bit(out);
    return out;
  }
  const I = { atRisk: dataUri(popupAtRisk), clear: dataUri(popupClear), hold: dataUri(popupHold), out: dataUri(popupOut), setup: dataUri(setupShot), icon: dataUri(iconBig), icon32: dataUri(iconSmall) };

  const twoCol = (title, sub, left, right, leftW = 520) => `
    <div style="position:absolute;inset:0;display:flex;align-items:center;gap:60px;padding:0 80px">
      <div style="width:${leftW}px;flex:none">
        <h1 style="font-size:50px">${title}</h1>
        <p style="font-size:21px;margin-top:20px">${sub}</p>
        ${left || ""}
      </div>
      <div style="flex:1;display:flex;justify-content:center;align-items:center">${right}</div>
    </div>`;

  // 1. hero: at-risk popup + the alert it produced
  await frame(1280, 800, twoCol(
    "Know before your Audible credits overflow.",
    "Audible caps how many credits you can hold. When a new one lands, anything above the cap is gone — and nothing warns you. This does.",
    `<div style="margin-top:28px">${notif(I.icon32, "10 Audible credits will be lost on 12 Oct",
      "You have 15 against a cap of 6. 9 days to act: spend down to 5, or pause the membership so nothing accrues. Buying a title is enough — you keep it whether or not you listen.")}</div>`,
    `<img class="shot" src="${I.atRisk}" style="width:352px">`, 560), "screenshot-1.png");

  // 2. the schedule
  await frame(1280, 800, `
    <div style="position:absolute;inset:0;padding:72px 90px">
      <h1 style="font-size:50px;max-width:900px">One check a month. Two alerts at most.</h1>
      <p style="font-size:21px;margin-top:18px;max-width:900px">It reads your balance the day after a credit lands, when there is still a month to act. A final reminder comes two days before the next one — and only if you are still at the cap. A safe month is completely silent.</p>
      <div class="tl">
        <div class="line"></div>
        ${[["12th", "credit lands", ""], ["13th", "first read", "alert if at cap"], ["~4 weeks", "quiet", ""], ["10th", "final read", "last call, if still at cap"], ["12th", "next credit", ""]]
          .map(([d, l, s], i) => `<div class="tk" style="left:${8 + i * 21}%"><i class="${i === 1 || i === 3 ? "hot" : ""}"></i><b>${d}</b><span>${l}</span>${s ? `<em>${s}</em>` : ""}</div>`).join("")}
      </div>
      <div style="display:flex;gap:14px;margin-top:46px;flex-wrap:wrap">
        <span class="pill">Under the cap? Nothing is sent</span>
        <span class="pill">Signed out? It asks you, days ahead</span>
        <span class="pill">Chrome was closed? It catches up</span>
      </div>
    </div>`, "screenshot-2.png", `
    .tl{position:relative;height:190px;margin-top:80px}
    .tl .line{position:absolute;left:4%;right:4%;top:36px;height:3px;background:rgba(255,255,255,.22);border-radius:2px}
    .tk{position:absolute;top:22px;width:200px;margin-left:-16px}
    .tk i{display:block;width:30px;height:30px;border-radius:50%;background:#2c4a78;border:3px solid rgba(255,255,255,.55);box-sizing:border-box}
    .tk i.hot{background:#f09019;border-color:#ffd98a;box-shadow:0 0 0 8px rgba(240,144,25,.22)}
    .tk b{display:block;margin-top:14px;font-size:22px}
    .tk span{display:block;color:rgba(255,255,255,.7);font-size:17px}
    .tk em{display:block;font-style:normal;color:#ffd27a;font-size:15px;margin-top:4px}`);

  // 3. on hold
  await frame(1280, 800, twoCol(
    "Paused? It tracks the spend-down.",
    "While a membership is on hold nothing accrues, so the job is to get under the cap before the next credit lands. The popup shows how many to spend and by when — and that buying a title is enough; you keep it whether or not you listen.",
    "", `<img class="shot" src="${I.hold}" style="width:352px">`, 540), "screenshot-3.png");

  // 4. setup reads the account page
  await frame(1280, 800, twoCol(
    "Reads your own account page. Nothing else.",
    "Setup asks for one Audible site and Chrome asks you to allow it. Balance, plan, cap, next-credit date and hold status all come from the page itself. No password, no account, no server.",
    `<div style="margin-top:26px;display:flex;flex-direction:column;gap:10px;font-size:17px;color:rgba(255,255,255,.85)">
      <div>✓&nbsp; Site access for one Audible marketplace, chosen by you</div>
      <div>✓&nbsp; Everything stored on this computer only</div>
      <div>✓&nbsp; Never confirms a pause or resume for you</div></div>`,
    `<div style="width:600px;overflow:hidden;border-radius:14px;position:relative;background:#fff" class="shot"><img src="${I.setup}" style="width:600px;display:block">
      <div style="position:absolute;left:0;right:0;bottom:0;height:140px;background:linear-gradient(rgba(255,255,255,0),#fff)"></div></div>`, 440), "screenshot-4.png");

  // 5. loud when broken
  await frame(1280, 800, twoCol(
    "Loud when it can't see your account.",
    "Audible sessions expire, especially if you rarely visit. If the extension can't read your balance it says so — in a notification, in the badge, and in the popup with the last balance it knew and when. A monitor that fails quietly is worse than none.",
    `<div style="margin-top:28px">${notif(I.icon32, "Sign in to Audible", "Your Audible session in this Chrome profile has expired, so your credit balance can't be checked. Your next credit lands in 9 days. Signing in takes a moment and checking resumes on its own.", ["Sign in to Audible"])}</div>`,
    `<img class="shot" src="${I.out}" style="width:352px">`, 560), "screenshot-5.png");
  console.log("rendered screenshots");

  // --- promo tiles ---
  await frame(440, 280, `
    <div style="position:absolute;inset:0;display:flex;align-items:center;gap:22px;padding:0 30px">
      <img src="${I.icon}" style="width:112px;height:112px;border-radius:26px;flex:none;box-shadow:0 16px 36px rgba(0,0,0,.45)">
      <div><h1 style="font-size:31px">Credit Guard<br>for Audible</h1><p style="font-size:16px;margin-top:10px">Know before your credits overflow.</p></div>
    </div>`, "small-tile-440x280.png");
  await frame(1400, 560, `
    <div style="position:absolute;inset:0;display:flex;align-items:center;gap:60px;padding:0 90px">
      <img src="${I.icon}" style="width:200px;height:200px;border-radius:46px;flex:none;box-shadow:0 24px 50px rgba(0,0,0,.45)">
      <div style="flex:1"><h1 style="font-size:60px">Credit Guard<br>for Audible</h1><p style="font-size:24px;margin-top:16px;max-width:520px">Warns you before Audible credits overflow your plan's cap and are lost. Free, local, no account.</p></div>
      <img class="shot" src="${I.atRisk}" style="width:300px;margin-right:10px">
    </div>`, "marquee-1400x560.png");
  console.log("rendered tiles");

  await browser.close();
  for (const f of fs.readdirSync(STORE).filter(f => f.endsWith(".png"))) {
    const b = fs.readFileSync(path.join(STORE, f));
    console.log(`${f.padEnd(26)} ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}  colour type ${b[25]}  ${(b.length / 1024).toFixed(0)} KB`);
  }
})().catch(e => { console.error(e); process.exit(1); });
