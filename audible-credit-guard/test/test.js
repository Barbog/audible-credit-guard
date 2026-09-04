// Verification harness. Stubs the chrome API, then exercises the scheduling
// logic, the pause bookkeeping, the parser and the failure classification.
// Run with: node test/test.js
const noop = () => {};
const listener = { addListener: noop, removeListener: noop };
global.chrome = {
  storage: { local: { get: async d => d, set: async () => {} } },
  alarms: { create: noop, onAlarm: listener },
  notifications: { create: noop, clear: noop, onClicked: listener, onButtonClicked: listener },
  runtime: { onInstalled: listener, onStartup: listener, onMessage: listener, getURL: p => "chrome-extension://test/" + p },
  tabs: { create: async () => ({ id: 1 }) },
  permissions: { contains: async () => false, request: async () => false, remove: async () => true, onRemoved: listener },
  scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
  action: { setBadgeText: noop, setBadgeBackgroundColor: noop }
};
const m = require("../src/background.js");
let fail = 0, count = 0;
const eq = (label, got, want) => {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const cfg = { accrualDay: 12, checkOffsetDays: 1, pauseMaxMonths: 3, minPaidMonthsBetweenPauses: 1 };
const NOW = new Date(2026, 8, 3);            // 3 Sept 2026, the day the live markup was captured

// --- cycles are named for the accrual they lead up to ---
eq("11 Sept -> cycle 2026-09 (credit lands the 12th)", m.cycleKey(cfg, new Date(2026, 8, 11)), "2026-09");
eq("12 Sept (accrual day) -> still 2026-09", m.cycleKey(cfg, new Date(2026, 8, 12)), "2026-09");
eq("13 Sept -> 2026-10 window opens", m.cycleKey(cfg, new Date(2026, 8, 13)), "2026-10");
eq("28 Sept (Chrome was off) -> still 2026-10", m.cycleKey(cfg, new Date(2026, 8, 28)), "2026-10");
eq("accrual 31st in Nov clamps to the 30th", m.iso(m.nextAccrualDate({ accrualDay: 31 }, new Date(2026, 10, 3))), "2026-11-30");
eq("page date wins over arithmetic", m.iso(m.nextAccrualDate({ accrualDay: 12, accrualDate: "2026-12-12" }, NOW)), "2026-12-12");
eq("stale page date falls back to arithmetic", m.iso(m.nextAccrualDate({ accrualDay: 12, accrualDate: "2026-08-12" }, NOW)), "2026-09-12");
eq("garbage page date falls back to arithmetic", m.iso(m.nextAccrualDate({ accrualDay: 12, accrualDate: "nope" }, NOW)), "2026-09-12");

// --- which scheduled read does a click count as? ---
const pc = { lateDaysBefore: 2, earlyStopDays: 3 };
eq("30 days out -> early", m.phaseFor(pc, 30), "early");
eq("3 days out -> between", m.phaseFor(pc, 3), "between");
eq("2 days out -> late", m.phaseFor(pc, 2), "late");
eq("0 days out -> late", m.phaseFor(pc, 0), "late");

// --- pause bookkeeping ---
eq("no history -> can pause", m.pauseStatus(cfg, [], new Date(2026, 8, 13)).canPause, true);
const onHold = m.pauseStatus(cfg, [{ startedOn: "2026-09-13" }], new Date(2026, 8, 20));
eq("open hold detected", onHold.onHold, true);
eq("expected resume = start + 3 months", onHold.expectedResume, "2026-12-13");
const cool = m.pauseStatus(cfg, [{ startedOn: "2026-06-13", resumedOn: "2026-09-13" }], new Date(2026, 8, 20));
eq("within paid-month gap -> cannot pause", cool.canPause, false);
eq("cooldown ends one month after resume", cool.cooldownUntil, "2026-10-13");
const after = m.pauseStatus(cfg, [{ startedOn: "2026-06-13", resumedOn: "2026-09-13" }], new Date(2026, 9, 14));
eq("after a paid month -> can pause again", after.canPause, true);

// --- parser, against markup captured from the live account page ---
const live = `<div id="membership_information"><span>Audible Premium Plus</span>
  <div class="bc-section">You have 15 Credits</div>
  <div>Your next bill date is: <span class="bc-pub-nowrap">12-09-2026</span></div>
  <li>1 credit a month to pick any audiobook</li></div>
  <a id="pauseEligibleLink" role="link">Pause membership</a>`;
const p = m.parseOverview(live, "dmy", NOW);
eq("balance", p.balance, 15);
eq("bill date normalised to ISO", p.billDate, "2026-09-12");
eq("credits per month", p.perMonth, 1);
eq("monthly, not annual", p.annual, false);
eq("not paused", p.paused, false);
eq("cap inferred from 1/month", m.capFor(p.perMonth, null), 6);
eq("cap inferred from 2/month", m.capFor(2, null), 12);
eq("cap override wins", m.capFor(p.perMonth, 18), 18);
eq("unknown plan -> no cap", m.capFor(3, null), null);
eq("no plan text -> no cap", m.capFor(null, null), null);

// annual plans deliver the year's credits in one go
const annual = m.parseOverview(`<div>You have 20 Credits</div><div>Your next bill date is: 03-03-2027</div>
  <li>12 credits a year</li><a id="pauseEligibleLink">Pause</a>`, "dmy", NOW);
eq("annual: per-accrual allowance", annual.perMonth, 12);
eq("annual: flagged", annual.annual, true);
eq("annual: a date months out is accepted", annual.accrualDate, "2027-03-03");
eq("annual: cap is 1.5x (12 -> 18)", m.capFor(annual.perMonth, null, annual.annual), 18);
eq("annual: cap is 1.5x (24 -> 36)", m.capFor(24, null, true), 36);

// balance wording fallbacks
eq("'credits available' wording", m.parseOverview("<p>4 credits available</p><p>membership</p>", "dmy", NOW).balance, 4);
eq("'Credit balance:' wording", m.parseOverview("<p>membership</p><p>Credit balance: <b>7</b></p>", "dmy", NOW).balance, 7);
eq("thousands separator", m.parseOverview("<p>You have 1,024 Credits</p><p>membership</p>", "dmy", NOW).balance, 1024);

// a sign-in page is recognised even when the fetch didn't bounce
eq("Amazon sign-in markup -> signedOut", m.parseOverview(`<title>Amazon Sign-In</title><input id="ap_email">`, "dmy", NOW).signedOut, true);
eq("account page mentioning sign-in is still an account page", m.parseOverview(`<a>Sign in with your Amazon account</a> Your next bill date is: 12-09-2026 You have 2 Credits`, "dmy", NOW).signedOut, false);

// defensive: other Audible markets word the paused state differently
const altPaused = m.parseOverview(`<div>Your membership is currently paused until 13-12-2026.
  <a>Resume membership</a></div><div>You have 15 Credits</div>`, "dmy", NOW);
eq("alternate phrasing still detects paused", altPaused.paused, true);
eq("alternate phrasing still yields the date", altPaused.resumeDate, "2026-12-13");

// --- spend-down pace, the mechanic that matters during a hold ---
const held = m.pauseStatus(cfg, [{ startedOn: "2026-09-10" }], new Date(2026, 8, 13));
const base = { cap: 6, perMonth: 1, balance: 15 };
const sd = m.spendDown(cfg, base, held, new Date(2026, 8, 13));
eq("target = cap minus one accrual", sd.target, 5);
eq("deadline = hold start + 3 months", sd.deadline, "2026-12-10");
eq("needed = balance - target", sd.needed, 10);
eq("days left", sd.daysLeft, 88);
eq("required pace per week", sd.perWeek, 0.8);
eq("not done yet", sd.done, false);

const doneSd = m.spendDown(cfg, { ...base, balance: 5 }, held, new Date(2026, 10, 1));
eq("at target -> done", doneSd.done, true);
eq("nothing further needed", doneSd.needed, 0);
eq("below target still done", m.spendDown(cfg, { ...base, balance: 2 }, held, new Date(2026, 10, 1)).done, true);

const override = m.spendDown({ ...cfg, spendTargetOverride: 0 }, base, held, new Date(2026, 8, 13));
eq("target override respected", override.target, 0);
eq("override raises the requirement", override.needed, 15);
eq("no cap -> no spend plan", m.spendDown(cfg, { ...base, cap: null }, held, new Date(2026, 8, 13)), null);
eq("no deadline at all -> still reports the gap", m.spendDown(cfg, base, {}, NOW), { target: 5, needed: 10, done: false });

// --- countdown bands: one alert per milestone, never more ---
eq("100 days out -> nothing", m.dueBand(100, []), null);
eq("45 days out -> 60-day band", m.dueBand(45, []), 60);
eq("45 days out, 60 already sent -> nothing", m.dueBand(45, [60]), null);
eq("20 days out -> 30-day band", m.dueBand(20, [60]), 30);
eq("5 days out -> 7-day band", m.dueBand(5, [60, 30, 14]), 7);
eq("1 day out after the 3-day band -> 1-day band", m.dueBand(1, [3]), 1);
eq("today -> 1-day band", m.dueBand(0, []), 1);
eq("past -> nothing", m.dueBand(-1, []), null);
eq("all sent -> nothing", m.dueBand(0, [60, 30, 14, 7, 3, 1]), null);
eq("unknown -> nothing", m.dueBand(null, []), null);

// --- watchdog: the failure modes that would otherwise be silent ---
const DAY = 86400000;
const hcfg = { ...cfg, staleDays: 45 };

const fresh = m.healthState({ ...hcfg, lastOkAt: Date.now() - 3 * DAY, cycles: [], consecutiveFailures: 0 });
eq("recent success -> not stale", fresh.stale, false);
const old50 = m.healthState({ ...hcfg, lastOkAt: Date.now() - 50 * DAY, cycles: [], consecutiveFailures: 0 });
eq("50 days since success -> stale", old50.stale, true);
eq("stale reports the age", old50.daysSinceOk, 50);
const never = m.healthState({ ...hcfg, lastOkAt: null, installedAt: Date.now() - 60 * DAY, cycles: [], consecutiveFailures: 0 });
eq("installed 60d ago, never succeeded -> stale", never.stale, true);
eq("flagged as never having run", never.neverRan, true);
const justInstalled = m.healthState({ ...hcfg, lastOkAt: null, installedAt: Date.now() - 2 * DAY, cycles: [], consecutiveFailures: 0 });
eq("installed 2 days ago -> not yet stale", justInstalled.stale, false);

// missed cycles: a gap means a month went unchecked — unless it was spent on hold
const seq = [{ cycle: "2026-09" }, { cycle: "2026-10" }, { cycle: "2026-11" }];
eq("contiguous cycles -> nothing missed", m.missedCycles(seq, cfg, new Date(2026, 10, 20)), []);
eq("gap detected", m.missedCycles([{ cycle: "2026-09" }, { cycle: "2026-12" }], cfg, new Date(2026, 11, 20)), ["2026-10", "2026-11"]);
eq("gap up to the cycle in progress", m.missedCycles([{ cycle: "2026-09" }], cfg, new Date(2026, 10, 20)), ["2026-10", "2026-11"]);
eq("cycle in progress is not counted", m.missedCycles([{ cycle: "2026-09" }, { cycle: "2026-10" }], cfg, new Date(2026, 9, 13)), []);
eq("no history -> nothing to report", m.missedCycles([], cfg, new Date(2026, 10, 20)), []);
eq("year boundary", m.missedCycles([{ cycle: "2026-11" }, { cycle: "2027-02" }], cfg, new Date(2027, 1, 20)), ["2026-12", "2027-01"]);
eq("months on hold are not missed", m.missedCycles([{ cycle: "2026-09", paused: true }, { cycle: "2026-12" }], cfg, new Date(2026, 11, 20)), []);
eq("gap after the hold ended is missed", m.missedCycles([{ cycle: "2026-09", paused: true }, { cycle: "2026-10" }, { cycle: "2027-01" }], cfg, new Date(2027, 0, 20)), ["2026-11", "2026-12"]);

// --- parsing a real PAUSED account page (captured 3 Sept 2026) ---
const pausedLive = `<div id="membership_information">
  <span>Audible Premium Plus (Paused)</span>
  <div class="bc-section">You have 12 Credits</div>
  <div>Account on hold till: <span class="bc-pub-nowrap">03-12-2026</span></div>
  <div>Your next credit date: <span class="bc-pub-nowrap">12-12-2026</span></div>
  <li>1 credit a month to pick any audiobook</li></div>
  <button class="bc-button-text">Resume membership</button>`;
const pl = m.parseOverview(pausedLive, "dmy", NOW);
eq("paused: balance", pl.balance, 12);
eq("paused: detected from the plan label", pl.paused, true);
eq("paused: hold end date", pl.holdUntil, "2026-12-03");
eq("paused: next credit date", pl.nextCreditDate, "2026-12-12");
eq("paused: accrual date is the CREDIT date, not the hold end", pl.accrualDate, "2026-12-12");
eq("paused: no pause link when already paused", pl.pauseLinkPresent, false);

// unpadded days must survive, tag-wrapped or bare — a greedy tag-skip used to
// eat the leading digit and silently shift the date by ten days
eq("bare unpadded date", m.parseOverview("Your next credit date: 13-12-2026", "dmy", NOW).nextCreditDate, "2026-12-13");
eq("tag-wrapped unpadded date", m.parseOverview("Your next credit date: <span>13-12-2026</span>", "dmy", NOW).nextCreditDate, "2026-12-13");
eq("nested tags before the date", m.parseOverview("on hold till: <b><i>29-11-2026</i></b>", "dmy", NOW).holdUntil, "2026-11-29");

// active page still parses, and has no hold date
const activeLive = `<div id="membership_information"><span>Audible Premium Plus</span>
  <div>You have 15 Credits</div>
  <div>Your next bill date is: <span>12-09-2026</span></div>
  <li>1 credit a month</li></div><a id="pauseEligibleLink">Pause membership</a>`;
const al = m.parseOverview(activeLive, "dmy", NOW);
eq("active: not paused", al.paused, false);
eq("active: falls back to the bill date", al.accrualDate, "2026-09-12");
eq("active: no hold date", al.holdUntil, null);
eq("active: pause link present", al.pauseLinkPresent, true);

eq("ISO round-trips", m.iso(m.fromISO("2026-12-03")), "2026-12-03");

// spend-down deadline is the credit date, nine days after the hold ends
const sdLive = m.spendDown(
  { spendTargetOverride: null },
  { cap: 6, perMonth: 1, balance: 12, nextCreditDate: "2026-12-12", holdUntil: "2026-12-03" },
  { expectedResume: "2026-12-03" }, NOW);
eq("deadline is the credit date", sdLive.deadline, "2026-12-12");
eq("hold end reported separately", sdLive.holdEnds, "2026-12-03");
eq("needs to spend 7 more", sdLive.needed, 7);
eq("100 days of runway, not 91", sdLive.daysLeft, 100);

// --- marketplaces: the same page, different domains and date orders ---
eq("five English-language markets", m.MARKETS.length, 5);
eq("UK is day-first", m.MARKETS.find(x => x.id === "co.uk").order, "dmy");
eq("US is month-first", m.MARKETS.find(x => x.id === "com").order, "mdy");
eq("unknown id falls back to the UK", m.market("nope").id, "co.uk");
eq("overview URL", m.overviewUrl("ca"), "https://www.audible.ca/account/overview");
eq("origin pattern for the permission request", m.originPattern("com.au"), "https://www.audible.com.au/*");
eq("content script pattern", m.overviewPattern("in"), "https://www.audible.in/account/overview*");

eq("en-GB -> co.uk", m.guessMarket("en-GB"), "co.uk");
eq("en-US -> com", m.guessMarket("en-US"), "com");
eq("en -> com", m.guessMarket("en"), "com");
eq("en-CA -> ca", m.guessMarket("en-CA"), "ca");
eq("en-AU -> com.au", m.guessMarket("en-AU"), "com.au");
eq("en-IN -> in", m.guessMarket("en-IN"), "in");
eq("fr -> ca (loose match)", m.guessMarket("fr"), "ca");
eq("de-DE -> co.uk (default)", m.guessMarket("de-DE"), "co.uk");
eq("empty -> co.uk", m.guessMarket(""), "co.uk");

eq("UK 03-12-2026 is 3 December", m.toISO("03-12-2026", "dmy"), "2026-12-03");
eq("US 03-12-2026 is 12 March", m.toISO("03-12-2026", "mdy"), "2026-03-12");
eq("impossible month rejected", m.toISO("13-12-2026", "mdy"), null);
eq("garbage rejected", m.toISO("not-a-date", "dmy"), null);
eq("two-digit year rejected", m.toISO("03-12-26", "dmy"), null);

// A wrong date order is silent and wrong by up to 11 days, so the value itself
// has to vouch for the order.
eq("plausible: 9 days ahead", m.plausibleAccrual("2026-09-12", NOW), true);
eq("implausible: 6 months out", m.plausibleAccrual("2027-03-09", NOW), false);
eq("implausible: long past", m.plausibleAccrual("2026-03-09", NOW), false);
eq("annual horizon: 6 months out is fine", m.plausibleAccrual("2027-03-09", NOW, 400), true);
eq("configured order kept when it makes sense", m.inferOrder("12-09-2026", "dmy", NOW), "dmy");
eq("wrong order detected and corrected", m.inferOrder("09-12-2026", "dmy", NOW), "mdy");
eq("neither order plausible -> null", m.inferOrder("01-01-2030", "dmy", NOW), null);

// US-worded page, parsed with the US order
const usPage = `<div id="membership_information"><span>Audible Premium Plus</span>
  <div>You have 9 Credits</div>
  <div>Your next billing date: <span>09-12-2026</span></div>
  <li>1 credit a month</li></div><a id="pauseEligibleLink">Pause</a>`;
const us = m.parseOverview(usPage, "mdy", NOW);
eq("US label variant parsed", us.balance, 9);
eq("US date read month-first", us.accrualDate, "2026-09-12");
eq("US order trusted", us.orderTrusted, true);

// same page mislabelled as UK: the self-check corrects it rather than silently
// reading 9 December
const mis = m.parseOverview(usPage, "dmy", NOW);
eq("mislabelled order is corrected", mis.accrualDate, "2026-09-12");
eq("and the correction is flagged", mis.orderTrusted, false);

// --- what a response to the overview URL means ---
const uk = m.market("co.uk");
eq("200 on the account page -> ok", m.classifyResponse({ type: "basic", url: "https://www.audible.co.uk/account/overview", ok: true, status: 200 }, uk), "ok");
eq("bounced to Amazon sign-in -> signed out", m.classifyResponse({ type: "basic", url: "https://www.amazon.co.uk/ap/signin?x=1", ok: true, status: 200 }, uk), "signedout");
eq("bounced to an on-site sign-in -> signed out", m.classifyResponse({ type: "basic", url: "https://www.audible.co.uk/sign-in?ref=x", ok: true, status: 200 }, uk), "signedout");
eq("blocked redirect (no-follow probe) -> signed out", m.classifyResponse({ type: "opaqueredirect", url: "", ok: false, status: 0 }, uk), "signedout");
eq("503 -> http problem", m.classifyResponse({ type: "basic", url: "https://www.audible.co.uk/account/overview", ok: false, status: 503 }, uk), "http");
eq("same-origin query redirect -> ok", m.classifyResponse({ type: "basic", url: "https://www.audible.co.uk/account/overview?ipRedirectOverride=true", ok: true, status: 200 }, uk), "ok");

// --- probe refuses to touch the network without a site and a grant ---
(async () => {
  eq("probe with no site -> setup", (await m.probe(null, null)).kind, "setup");
  eq("probe without a grant -> permission", (await m.probe(null, "co.uk")).kind, "permission");

  // --- the schedule: simulate a whole cycle, day by day ---
  // Mirrors what attempt() writes back, so the planner is exercised exactly as
  // the service worker drives it.
  const scfg = { setupComplete: true, accrualDay: 12, lateDaysBefore: 2, earlyStopDays: 3, earlyRetryDays: 7 };

  function simulate({ from, to, outcome }) {
    const c = { ...scfg, cycleState: null };
    const log = [];
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      const plan = m.nextAction(c, day);
      if (plan.do === "none") continue;
      const res = outcome(day, plan);
      const cs = { ...plan.cs, key: plan.key, lastAttemptAt: day.getTime() };
      if (res.ok) {
        if (plan.do === "early") { cs.earlyOkAt = day.getTime(); cs.earlyAtRisk = res.atRisk; if (res.atRisk) cs.earlyNotifiedAt = day.getTime(); }
        else { cs.lateDoneAt = day.getTime(); if (res.atRisk) cs.lateNotifiedAt = day.getTime(); }
      }
      c.cycleState = cs;
      log.push({ day: m.iso(day), phase: plan.do, ok: res.ok, notified: res.ok ? res.atRisk : "signin" });
    }
    return log;
  }

  const SEP13 = new Date(2026, 8, 13), OCT12 = new Date(2026, 9, 12);

  // happy path, at risk: exactly two notifications, one early one late
  const atRisk = simulate({ from: SEP13, to: OCT12, outcome: () => ({ ok: true, atRisk: true }) });
  eq("at-risk cycle: two checks", atRisk.map(x => x.phase), ["early", "late"]);
  eq("at-risk cycle: first check is immediate", atRisk[0].day, "2026-09-13");
  eq("at-risk cycle: final check 2 days out", atRisk[1].day, "2026-10-10");
  eq("at-risk cycle: exactly two notifications", atRisk.filter(x => x.notified === true).length, 2);

  // early read under the cap closes the cycle: one check, zero notifications
  const safe = simulate({ from: SEP13, to: OCT12, outcome: () => ({ ok: true, atRisk: false }) });
  eq("safe cycle: one check only", safe.map(x => x.phase), ["early"]);
  eq("safe cycle: no notifications", safe.filter(x => x.notified === true).length, 0);

  // signed out all early window: weekly retries, then daily in the final days
  const out = simulate({ from: SEP13, to: OCT12, outcome: () => ({ ok: false }) });
  eq("signed out: retries are weekly in the early window",
    out.filter(x => x.phase === "early").map(x => x.day),
    ["2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04"]);
  eq("signed out: final window retries daily",
    out.filter(x => x.phase === "late").map(x => x.day), ["2026-10-10", "2026-10-11", "2026-10-12"]);

  // signed out at first, recovers on the third attempt
  const recover = simulate({ from: SEP13, to: OCT12,
    outcome: d => ({ ok: d >= new Date(2026, 8, 27), atRisk: true }) });
  eq("recovers on the third attempt", recover.filter(x => x.ok).map(x => x.day), ["2026-09-27", "2026-10-10"]);
  eq("no early notification until a read succeeds", recover.filter(x => x.notified === true).length, 2);

  // quiet period: nothing between the early read and the final check
  eq("nothing fires between the two checks", atRisk.length, 2);

  // the whole next cycle starts fresh on the 13th
  const next = simulate({ from: new Date(2026, 9, 13), to: new Date(2026, 10, 12), outcome: () => ({ ok: true, atRisk: false }) });
  eq("next cycle: first read on the 13th again", next.map(x => x.day), ["2026-10-13"]);

  // --- reporting a page that didn't parse: safe diagnostics, prefilled issue ---
  {
    const odd = `<html><head><title>Account details | Audible.com</title><script>var secret = 9999;</script></head>
      <body><p>Hi Gary, we sent a receipt to gary@example.com.</p>
      <p>Credits remaining: 15</p><p>Your membership renews on 12/25/2026 with 2 credits monthly.</p></body></html>`;
    const d = m.diagnose(odd, m.market("com"), "mdy", NOW);
    eq("diagnose: unknown wording -> balance not found", d.balanceFound, false);
    eq("diagnose: page recognised as an account page", d.looksLikeAccount, true);
    eq("diagnose: site named", d.site, "audible.com");
    eq("diagnose: title kept", d.title, "Account details | Audible.com");
    const dump = JSON.stringify(d);
    eq("diagnose: no digits survive", /\d/.test(dump.replace(/"htmlLength":\d+/, "")), false);
    eq("diagnose: e-mail removed", dump.includes("example.com"), false);
    eq("diagnose: script body not quoted", dump.includes("secret"), false);
    eq("diagnose: the unknown wording is quoted", d.snippets.some(s => s.includes("Credits remaining: ##")), true);
    const url = m.reportUrl(d, "1.1.2", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36");
    eq("reportUrl: points at the repo's new-issue page", url.startsWith(m.REPO_URL + "/issues/new?"), true);
    const params = new URL(url).searchParams;
    eq("reportUrl: title names the site", params.get("title"), "Account page didn't parse on audible.com");
    eq("reportUrl: label set", params.get("labels"), "parse-failure");
    eq("reportUrl: body carries version and Chrome", /Credit Guard 1\.1\.2, Chrome 140\.0\.0\.0, Windows/.test(params.get("body")), true);
    eq("reportUrl: body has no balance", params.get("body").includes("15"), false);
    eq("reportUrl: comfortably under GitHub's limit", url.length < 6000, true);
    const huge = m.diagnose("<p>membership</p>" + "credit ".repeat(4000), m.market("co.uk"));
    eq("reportUrl: long pages still produce a bounded URL", m.reportUrl(huge, "x", "").length < 6000, true);
  }

  console.log(fail ? `\n${fail} of ${count} FAILING` : `\nall ${count} checks passed`);
  process.exit(fail ? 1 : 0);
})();
