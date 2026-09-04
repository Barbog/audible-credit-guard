// Interactive driver for the Chrome Web Store developer console, used by a
// Claude Code session (or you) to fill the item form step by step with
// Playwright on the dedicated signed-in profile. See HANDOFF.md §3.9.
//
// Run from audible-credit-guard/tools, in the background:
//   node console-drive.js
// Then talk to it over HTTP on 127.0.0.1:9333:
//   POST /eval   body = source of an async function body; `page`, `ctx`, `fs`
//                are in scope; the return value comes back as JSON
//   POST /shot   body "full" for a full-page capture; writes shot.png next to
//                this file and returns its path, the URL and the title
//   POST /quit   closes Chrome and exits
// It also exits when the browser window is closed or after 30 minutes idle,
// so it never outlives the session by accident.
//
// Gotchas learned on 4 Sept 2026:
// - The console regenerates element ids (c153, c198, ...) on every re-render;
//   locate fields by label (page.getByLabel(/Privacy policy URL/)) not by id.
// - The remote-code radio defaults to "Yes". Clicking its label text does not
//   toggle it; click the radio control itself ([role=radio] first()).
// - File inputs have no ids or names. In DOM order they are: icon, screenshot
//   slot, small promo tile, marquee. Screenshots go one at a time through the
//   same slot (nth(1)); it stays in place after each upload.
// - Save draft shows an "Item saved." toast; nothing is persisted until then.
// - "Why can't I submit?" (on the listing/privacy/distribution tabs, not on
//   Package or Status) opens the dialog that lists the real blockers.
// - A background Bash task in Claude Code is capped at ten minutes; the draft
//   is server-side after each save, so just relaunch this script.
// - Only one Chrome can hold the profile: close `node console.js` first.
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const profile = process.env.CWS_PROFILE ||
  path.join(process.env.LOCALAPPDATA || os.homedir(), "cws-profile");
const SHOT = path.join(__dirname, "shot.png");
const PORT = Number(process.env.CWS_DRIVER_PORT || 9333);
const IDLE_MS = 30 * 60 * 1000;
let idle;
function bump() { clearTimeout(idle); idle = setTimeout(() => { console.log("idle exit"); shutdown(); }, IDLE_MS); }

let ctx, page;
async function shutdown() { try { await ctx.close(); } catch {} process.exit(0); }

(async () => {
  ctx = await chromium.launchPersistentContext(profile, {
    channel: "chrome", headless: false, viewport: { width: 1400, height: 950 }
  });
  ctx.on("close", () => process.exit(0));
  page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(15000);
  bump();
  http.createServer(async (req, res) => {
    bump();
    let body = ""; for await (const c of req) body += c;
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    try {
      if (req.url === "/quit") { send(200, { ok: true }); setTimeout(shutdown, 100); return; }
      if (req.url === "/shot") {
        await page.screenshot({ path: SHOT, fullPage: body.includes("full") });
        send(200, { ok: true, path: SHOT, url: page.url(), title: await page.title() }); return;
      }
      if (req.url === "/eval") {
        const fn = new Function("page", "ctx", "fs", `return (async () => { ${body} })();`);
        const out = await fn(page, ctx, fs);
        send(200, { ok: true, result: out === undefined ? null : out }); return;
      }
      send(404, { error: "unknown" });
    } catch (e) { send(500, { ok: false, error: String(e && e.message || e) }); }
  }).listen(PORT, "127.0.0.1", () => console.log("driver listening on", PORT, "profile", profile));
})().catch(e => { console.error(e.message); process.exit(1); });
