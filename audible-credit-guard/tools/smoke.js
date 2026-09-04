// Loads the unpacked extension into headless Chromium and checks that the
// service worker starts, setup opens, the popup renders, and messaging works.
// Run with: node tools/smoke.js
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const ext = path.resolve(__dirname, "..", "src");
(async () => {
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const problems = [];
  ctx.on("page", p => p.on("pageerror", e => problems.push(`pageerror ${p.url()}: ${e.message}`)));
  ctx.on("page", p => p.on("console", m => { if (m.type() === "error") problems.push(`console ${p.url()}: ${m.text()}`); }));

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const id = sw.url().split("/")[2];
  console.log("service worker:", sw.url());

  // onInstalled runs asynchronously after the worker starts; give it a moment.
  for (let i = 0; i < 40; i++) {
    if (await sw.evaluate(async () => (await chrome.storage.local.get("installedAt")).installedAt != null)) break;
    await new Promise(r => setTimeout(r, 250));
  }
  // Top-level script ran: the pure functions exist and the alarm was created.
  const swState = await sw.evaluate(async () => ({
    fns: ["nextAction", "attempt", "probe", "parseOverview", "ensureContentScript"].map(f => typeof self[f] === "function" ? f : `MISSING:${f}`),
    alarms: (await chrome.alarms.getAll()).map(a => a.name),
    manifest: chrome.runtime.getManifest().name,
    installedAt: (await chrome.storage.local.get("installedAt")).installedAt
  }));
  console.log("worker state:", JSON.stringify(swState));
  if (swState.fns.some(f => f.startsWith("MISSING"))) problems.push("worker functions missing: " + swState.fns);
  if (!swState.alarms.includes("acg-tick")) problems.push("tick alarm not created");
  if (!swState.installedAt) problems.push("installedAt not recorded on install");

  // onInstalled should have opened setup.html.
  await new Promise(r => setTimeout(r, 1500));
  const setupTab = ctx.pages().find(p => p.url().endsWith("/setup.html"));
  if (!setupTab) problems.push("setup.html was not opened on install");
  else {
    await setupTab.waitForFunction(() => document.querySelectorAll("#market option").length > 0);
    const opts = await setupTab.$$eval("#market option", os => os.map(o => o.value));
    console.log("setup market options:", opts.join(", "), "| selected:", await setupTab.$eval("#market", s => s.value));
    if (opts.length !== 5) problems.push("expected 5 market options, got " + opts.length);
    const finishDisabled = await setupTab.$eval("#finish", b => b.disabled);
    if (!finishDisabled) problems.push("Finish should be disabled before a probe succeeds");
  }

  // Popup before setup: says so and offers setup.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() => !document.getElementById("out").textContent.startsWith("Loading"));
  const outText = await popup.$eval("#out", e => e.textContent.trim());
  console.log("popup (pre-setup):", outText.slice(0, 80));
  if (!/Setup hasn't been completed/.test(outText)) problems.push("popup did not report incomplete setup");

  // Messaging round-trips from an extension page.
  const msgs = await popup.evaluate(async () => ({
    markets: await chrome.runtime.sendMessage({ type: "markets", lang: "en-GB" }),
    probe: await chrome.runtime.sendMessage({ type: "probe", marketId: "co.uk" }),
    probeNoSite: await chrome.runtime.sendMessage({ type: "probe" }),
    health: await chrome.runtime.sendMessage({ type: "health" }),
    perms: await chrome.permissions.getAll()
  }));
  console.log("markets guess:", msgs.markets.guess, "| probe without grant:", msgs.probe.kind, "| probe without site:", msgs.probeNoSite.kind);
  console.log("granted permissions:", JSON.stringify(msgs.perms));
  if (msgs.markets.guess !== "co.uk") problems.push("en-GB should guess co.uk");
  if (msgs.probe.kind !== "permission") problems.push("probe without a grant should report 'permission', got " + msgs.probe.kind);
  if (msgs.probeNoSite.kind !== "setup") problems.push("probe without a site should report 'setup'");
  if ((msgs.perms.origins || []).length) problems.push("no host permission should be granted at install");
  if (!msgs.health || msgs.health.setupComplete !== false) problems.push("health message failed");

  // Popup in the signed-out state, with history, renders the sign-in panel.
  await popup.evaluate(() => chrome.storage.local.set({
    setupComplete: true, marketId: "co.uk", sessionState: "signedout", sessionCheckedAt: Date.now(),
    state: { ok: false, kind: "signedout", error: "x", balance: 15, checkedAt: Date.now() },
    cycles: [{ cycle: "2026-09", balance: 15, cap: 6, delta: 1 }]
  }));
  await popup.reload();
  await popup.waitForFunction(() => /Signed out/.test(document.getElementById("out").textContent));
  const rows = await popup.$$eval("#cycles tr", r => r.length);
  console.log("popup (signed out) renders; cycle rows:", rows);
  if (rows !== 1) problems.push("cycle history not rendered in signed-out state");

  // Popup in a healthy at-cap state shows the Pause… action.
  await popup.evaluate(() => chrome.storage.local.set({
    sessionState: "ok",
    state: { ok: true, checkedAt: Date.now(), cycle: "2026-10", phase: "early", balance: 15, cap: 6, perMonth: 1,
      accrualDate: "2026-10-12", paused: false, delta: 0, atCap: true, overflowing: true, atRisk: true, daysToAccrual: 9,
      pause: { onHold: false, canPause: true } },
    cycleState: { key: "2026-10", earlyOkAt: Date.now(), earlyAtRisk: true }
  }));
  await popup.reload();
  await popup.waitForFunction(() => /credits/.test(document.getElementById("out").textContent));
  const actVisible = await popup.$eval("#act", b => !b.hidden && b.textContent);
  const cycleLine = await popup.$$eval("#out .row", rows => rows.map(r => r.textContent).find(t => t.startsWith("This cycle")));
  console.log("popup (at cap) action:", actVisible, "|", cycleLine);
  if (actVisible !== "Pause…") problems.push("Pause… action not offered at cap");

  await ctx.close();
  if (problems.length) { console.log("\nPROBLEMS:\n - " + problems.join("\n - ")); process.exit(1); }
  console.log("\nsmoke test passed");
})().catch(e => { console.error(e); process.exit(1); });
