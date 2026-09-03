/* Credit Guard for Audible — MV3 service worker
 *
 * Model (UK, corrected 2026-09-03):
 *   - Ordinary Audible credits do NOT expire on a clock. They OVERFLOW: at the
 *     accrual event, any balance above the plan's cap is lost.
 *   - Therefore there is exactly ONE decision point per cycle: just after
 *     accrual. We check once per cycle, not on a poll.
 *   - Pausing suspends accrual and billing, so nothing overflows while paused.
 *     Pause allowance (per Audible support, unverified): up to 3 months per
 *     hold, with at least 1 paid month between holds.
 *   - Goodwill / reinstated credits are a separate bucket and MAY carry a
 *     12-month expiry. Tracked separately via the expiry watch.
 *
 * We never confirm a pause or resume. We open Audible's own dialog; you click.
 *
 * Site access is OPTIONAL and is requested for exactly one Audible marketplace
 * during setup. Nothing here touches the network until that grant exists.
 */

/* Audible runs one site per market. The English-language ones share this page
 * structure; what differs is the domain and the date order. Non-English markets
 * (de/fr/it/es/jp) print different labels and are deliberately out of scope
 * rather than half-supported. */
const MARKETS = [
  { id: "co.uk",  origin: "https://www.audible.co.uk",  host: "audible.co.uk",  order: "dmy", label: "United Kingdom", langs: ["en-gb", "en-ie"] },
  { id: "com",    origin: "https://www.audible.com",    host: "audible.com",    order: "mdy", label: "United States",  langs: ["en-us", "en"] },
  { id: "ca",     origin: "https://www.audible.ca",     host: "audible.ca",     order: "mdy", label: "Canada",         langs: ["en-ca", "fr-ca"] },
  { id: "com.au", origin: "https://www.audible.com.au", host: "audible.com.au", order: "dmy", label: "Australia",      langs: ["en-au", "en-nz"] },
  { id: "in",     origin: "https://www.audible.in",     host: "audible.in",     order: "dmy", label: "India",          langs: ["en-in", "hi-in"] }
];
const market = id => MARKETS.find(m => m.id === id) || MARKETS[0];
const overviewUrl = id => market(id).origin + "/account/overview";
const originPattern = id => market(id).origin + "/*";
const overviewPattern = id => market(id).origin + "/account/overview*";

/** Best guess at the marketplace from the browser's UI language. Only a
 *  default for the setup page's dropdown; the person confirms it. */
function guessMarket(lang) {
  const l = String(lang || "").toLowerCase();
  const exact = MARKETS.find(m => m.langs.includes(l));
  if (exact) return exact.id;
  const base = l.split("-")[0];
  const loose = MARKETS.find(m => m.langs.some(x => x.split("-")[0] === base));
  return loose ? loose.id : "co.uk";
}

const TICK = "acg-tick";
const CS_ID = "acg-overview";
const DAY = 86400000;

const CFG = {
  marketId: null,                  // which Audible site; chosen at setup
  accrualDay: 12,                  // fallback only; the page states the real one
  accrualDate: null,               // exact next-credit date, read from the page
  holdUntil: null,                 // exact hold-end date, read from the page
  checkOffsetDays: 1,              // check this many days after accrual
  capOverride: null,               // null => infer from plan text
  pauseMaxMonths: 3,
  minPaidMonthsBetweenPauses: 1,
  expiryWatchDate: null,           // "YYYY-MM-DD" for goodwill credits
  expiryWatchCount: null,
  earlyRetryDays: 7,               // weekly attempts until one succeeds
  lateDaysBefore: 2,               // final look this many days before accrual
  earlyStopDays: 3,                // early window closes here
  staleDays: 45,                   // no successful check in this long => shout
  errorRenotifyDays: 3,            // don't nag more often than this on failure
  staleRenotifyDays: 7,
  pausedCheckDays: 7,              // while on hold, check pace weekly
  spendTargetOverride: null,       // null => cap minus one accrual
  holdStartedOn: null,             // manual override; detection is inferred
  resumeDateOverride: null
};

const STATE = {
  lastCheckedCycle: null,          // "2026-10"
  cycles: [],                      // [{cycle, day, balance, cap, paused, delta, phase}]
  pauseLog: [],                    // [{startedOn, resumedOn|null}]
  pendingIntent: null,             // {intent: "pause"|"resume", at}
  state: null,                     // last computed snapshot
  installedAt: null,
  lastOkAt: null,                  // timestamp of the last SUCCESSFUL check
  lastErrorNotifiedAt: null,
  lastStaleNotifiedAt: null,
  consecutiveFailures: 0,
  setupComplete: false,
  sessionState: null,              // "ok" | "signedout" | "permission" | "error"
  sessionCheckedAt: null,
  cycleState: null,                // per-cycle progress, see nextAction()
  spendStart: null,                // where the current spend-down began
  spendNotified: null,             // {deadline, bands:[], done}
  expiryNotified: null             // {date, bands:[]}
};

// ---------------- storage ----------------

const get = async () => {
  const s = await chrome.storage.local.get({ ...CFG, ...STATE });
  return { ...CFG, ...STATE, ...s };
};
const set = data => chrome.storage.local.set(data);

// ---------------- date helpers ----------------

const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Audible prints dd-mm-yyyy in the UK/AU/IN and mm-dd-yyyy in the US/CA. The
 *  two are indistinguishable for the first twelve days of a month, so the order
 *  must come from the marketplace, never be guessed from the value. Every date
 *  is normalised to ISO the moment it is parsed; nothing downstream sees the
 *  local format again. */
function toISO(str, order = "dmy") {
  if (!str) return null;
  const p = String(str).trim().split("-").map(Number);
  if (p.length !== 3 || p.some(isNaN)) return null;
  const [a, b, y] = p;
  const day = order === "mdy" ? b : a;
  const mon = order === "mdy" ? a : b;
  if (mon < 1 || mon > 12 || day < 1 || day > 31 || y < 2000) return null;
  return `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
const fromISO = v => {
  if (v instanceof Date) return v;
  const [y, m, d] = String(v).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const ukDate = fromISO;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const cycleId = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / DAY);

/** "12 Oct" in the user's locale, for notification text. */
function longDate(isoStr) {
  if (!isoStr) return "";
  const d = fromISO(isoStr);
  if (isNaN(d)) return String(isoStr);
  try { return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  catch { return String(isoStr); }
}

/** The next date credits actually land. */
function nextAccrualDate(cfg, now = new Date()) {
  const today = midnight(now);
  // If the page told us the exact date and it hasn't passed, trust it over any
  // day-of-month arithmetic — it already accounts for holds and odd months.
  if (cfg.accrualDate) {
    const d = midnight(fromISO(cfg.accrualDate));
    if (!isNaN(d) && d >= today) return d;
  }
  const clamp = (y, m) => Math.min(cfg.accrualDay || 1, new Date(y, m + 1, 0).getDate());
  const thisMonth = midnight(new Date(today.getFullYear(), today.getMonth(), clamp(today.getFullYear(), today.getMonth())));
  if (today <= thisMonth) return thisMonth;
  const y = today.getFullYear(), m = today.getMonth() + 1;
  return midnight(new Date(y, m, clamp(y, m)));
}

/** Cycles are named for the accrual they lead up to. The window for the
 *  October accrual opens the day after the September one. */
function cycleKey(cfg, now = new Date()) {
  return cycleId(nextAccrualDate(cfg, now));
}

/** Which scheduled read a check made right now would count as. */
function phaseFor(c, days) {
  if (days <= c.lateDaysBefore) return "late";
  if (days <= c.earlyStopDays) return "between";
  return "early";
}

/** The whole schedule, as one pure decision. At most two notifications per
 *  cycle: one early enough to act on, one final reminder before the credit
 *  lands. Retries exist only to get a first successful read.
 *
 *  Key insight: a balance can only FALL between accruals, because credits
 *  arrive only at the accrual event. So an early read below the cap closes the
 *  cycle outright — nothing can put you back at risk. */
function nextAction(c, now = new Date()) {
  if (!c.setupComplete) return { do: "none", reason: "setup not complete" };

  const key = cycleKey(c, now);
  const cs = c.cycleState && c.cycleState.key === key ? c.cycleState : { key };
  const days = daysBetween(now, nextAccrualDate(c, now));
  const sinceDays = t => (t ? (now.getTime() - t) / DAY : 999);

  if (days <= c.lateDaysBefore) {
    if (cs.earlyOkAt && cs.earlyAtRisk === false)
      return { do: "none", key, days, cs, reason: "early read was under the cap; balance can only fall" };
    if (cs.lateDoneAt) return { do: "none", key, days, cs, reason: "final check already done" };
    if (sinceDays(cs.lastAttemptAt) < 1) return { do: "none", key, days, cs, reason: "already attempted today" };
    return { do: "late", key, days, cs, reason: "final check before accrual" };
  }

  if (days <= c.earlyStopDays) return { do: "none", key, days, cs, reason: "between windows" };
  if (cs.earlyOkAt) return { do: "none", key, days, cs, reason: "early read done; waiting for the final check" };
  if (sinceDays(cs.lastAttemptAt) < c.earlyRetryDays)
    return { do: "none", key, days, cs, reason: "waiting out the retry interval" };
  return { do: "early", key, days, cs, reason: cs.lastAttemptAt ? "retrying the early read" : "first early read" };
}

// ---------------- scraping ----------------

const grabInt = (s, re) => { const m = s.match(re); return m ? parseInt(m[1].replace(/,/g, ""), 10) : null; };
const grabStr = (s, re) => { const m = s.match(re); return m ? m[1] : null; };

/** dd-mm and mm-dd are indistinguishable for the first twelve days of a month,
 *  so a wrong marketplace date order fails SILENTLY and by up to eleven days.
 *  The next credit date is always within about a month for a monthly plan, and
 *  within about a year for an annual one — enough to detect the mistake. */
function plausibleAccrual(isoStr, now = new Date(), horizon = 40) {
  if (!isoStr) return false;
  const d = fromISO(isoStr);
  if (isNaN(d)) return false;
  const days = daysBetween(now, d);
  return days >= -3 && days <= horizon;
}

/** Returns the order that makes sense of this date, or null if neither does. */
function inferOrder(raw, configured, now = new Date(), horizon = 40) {
  const other = configured === "dmy" ? "mdy" : "dmy";
  if (plausibleAccrual(toISO(raw, configured), now, horizon)) return configured;
  if (plausibleAccrual(toISO(raw, other), now, horizon)) return other;
  return null;
}

function parseOverview(html, order = "dmy", now = new Date()) {
  const looksLikeAccount = /next (?:bill|billing|credit) date|membership/i.test(html);
  const looksLikeSignIn = /Sign in with your Amazon account|id="ap_email"|name="ap_email"|ap_signin|Sign-In<\/title>/i.test(html);
  if (!looksLikeAccount && looksLikeSignIn) return { signedOut: true };

  const balance = grabInt(html, /You have\s+([\d,]+)\s+Credits?\b/i)
    ?? grabInt(html, /([\d,]+)\s+Credits?\s+available/i)
    ?? grabInt(html, /Credits?\s+balance:?\s*(?:<[^>]*>\s*)*([\d,]+)/i);

  // Monthly plans state "1 credit a month"; annual plans state "12 credits a
  // year" and deliver them in one go, so "per accrual" is what we track.
  let perMonth = grabInt(html, /(\d+)\s+credits?\s+(?:a|per|every)\s+month/i);
  let annual = false;
  if (perMonth == null) {
    const perYear = grabInt(html, /(\d+)\s+credits?\s+(?:a|per|every)\s+year/i);
    if (perYear != null) { perMonth = perYear; annual = true; }
  }

  // The page states every date we need, and labels them differently by state:
  //   active: "Your next bill date is: 12-09-2026"
  //   paused: "Account on hold till: 03-12-2026"
  //           "Your next credit date: 12-12-2026"
  // What matters is when CREDITS arrive, not when money moves — and on a
  // paused account those are nine days apart.
  // Skip only COMPLETE tags between the label and the date. A loose [^>]* here
  // is greedy enough to swallow the leading digit of an unpadded day, turning
  // 13-12-2026 into 3-12-2026.
  const dated = label => grabStr(html, new RegExp(label + "(?:\\s*<[^>]*>)*\\s*([0-3]?\\d-[01]?\\d-\\d{4})", "i"));
  const rawCredit = dated("next credit date:?");
  const rawBill   = dated("next bill(?:ing)? date(?: is)?:?");
  const rawHold   = dated("on hold till:?") || dated("paused until") || dated("resumes? on");

  // Let the dates themselves confirm the marketplace's order before trusting it.
  const horizon = annual ? 400 : 40;
  const confirmed = inferOrder(rawCredit || rawBill, order, now, horizon) || order;
  const orderTrusted = !((rawCredit || rawBill) && confirmed !== order);

  const nextCreditDate = toISO(rawCredit, confirmed);
  const nextBillDate   = toISO(rawBill, confirmed);
  const holdUntil      = toISO(rawHold, confirmed);
  const billDate = nextCreditDate || nextBillDate;

  // Pause-state detection. `pauseEligibleLink` is only rendered when Audible
  // considers the account eligible to pause, so its absence is itself a signal.
  // Verified against a real paused account: the plan name itself carries the
  // state — "Audible Premium Plus (Paused)" — and the pause link disappears.
  const pauseLinkPresent = /pauseEligibleLink/.test(html);
  const pausedLabel = /Audible[^<\n]{0,40}\(\s*Paused\s*\)/i.test(html)
                   || /membership is (currently )?paused|membership is on hold/i.test(html);
  const paused = pausedLabel || (!!holdUntil && !pauseLinkPresent);

  return {
    signedOut: false, balance, perMonth, annual, billDate,
    accrualDate: billDate, nextCreditDate, nextBillDate, holdUntil,
    paused, pauseLinkPresent, resumeDate: holdUntil,
    dateOrder: confirmed, orderTrusted,
    markers: { pauseLinkPresent, pausedLabel, holdUntil, nextCreditDate, nextBillDate, rawCredit, rawBill }
  };
}

/** Plan caps, as Audible applies them: 6 for 1/month, 12 for 2/month, and one
 *  and a half times the annual allowance (18 for 12/year, 36 for 24/year). */
function capFor(perMonth, override, annual = false) {
  if (override != null) return override;
  if (perMonth == null) return null;
  if (annual) return Number.isInteger(perMonth * 1.5) ? perMonth * 1.5 : null;
  if (perMonth === 2) return 12;
  if (perMonth === 1) return 6;
  return null;
}

// ---------------- pause allowance bookkeeping ----------------

function pauseStatus(cfg, pauseLog, now = new Date()) {
  const open = pauseLog.find(p => !p.resumedOn);
  if (open) {
    const started = fromISO(open.startedOn);
    const expected = new Date(started); expected.setMonth(expected.getMonth() + cfg.pauseMaxMonths);
    return { onHold: true, since: open.startedOn, expectedResume: iso(expected), daysLeft: daysBetween(now, expected) };
  }
  const last = [...pauseLog].reverse().find(p => p.resumedOn);
  if (!last) return { onHold: false, canPause: true };
  const eligible = fromISO(last.resumedOn);
  eligible.setMonth(eligible.getMonth() + cfg.minPaidMonthsBetweenPauses);
  const wait = daysBetween(now, eligible);
  return { onHold: false, canPause: wait <= 0, cooldownUntil: iso(eligible), cooldownDays: Math.max(0, wait) };
}

/** While on hold: how far you must get before accrual restarts.
 *  Target is cap minus one accrual, so the credit that lands on resume puts
 *  you exactly at the cap rather than over it. */
function spendDown(cfg, s, ps, now = new Date()) {
  if (s.cap == null) return null;
  const target = cfg.spendTargetOverride != null
    ? cfg.spendTargetOverride
    : Math.max(0, s.cap - (s.perMonth || 1));
  // The deadline is when the CREDIT lands, not when the hold ends or billing
  // restarts. Audible states both and they are not the same day.
  const deadline = cfg.resumeDateOverride || s.nextCreditDate || ps.expectedResume || null;
  const needed = Math.max(0, s.balance - target);
  if (!deadline) return { target, needed, done: needed === 0 };
  const daysLeft = daysBetween(now, fromISO(deadline));
  return {
    target, deadline, daysLeft, needed, holdEnds: s.holdUntil || null,
    done: needed === 0,
    perWeek: daysLeft > 0 ? +(needed / (daysLeft / 7)).toFixed(1) : null
  };
}

/** Milestones for a countdown. Returns the band we have just entered and not
 *  yet announced, or null. With weekly checks that is at most six alerts over
 *  a whole hold, and none more than once per band. */
const BANDS = [60, 30, 14, 7, 3, 1];
function dueBand(daysLeft, notified = []) {
  if (daysLeft == null || isNaN(daysLeft) || daysLeft < 0) return null;
  const inside = BANDS.filter(b => daysLeft <= b);
  if (!inside.length) return null;
  const band = inside[inside.length - 1];
  return notified.includes(band) ? null : band;
}

/** Cycles that should have been recorded but weren't. A gap means the check
 *  didn't run that month — the failure mode that costs you credits silently.
 *  Months spent on hold don't count: nothing accrues, so nothing is checked. */
function missedCycles(cycles, cfg, now = new Date()) {
  if (!cycles?.length) return [];
  const have = new Map(cycles.map(c => [c.cycle, c]));
  const [cy, cm] = cycleKey(cfg, now).split("-").map(Number);
  const end = new Date(cy, cm - 2, 1);           // the cycle before the one in progress
  const [fy, fm] = cycles[0].cycle.split("-").map(Number);
  const out = [];
  let lastSeen = null;
  for (let d = new Date(fy, fm - 1, 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const rec = have.get(cycleId(d));
    if (rec) lastSeen = rec;
    else if (!(lastSeen && lastSeen.paused)) out.push(cycleId(d));
  }
  return out;
}

/** Purely local health check — no network, safe to run on every tick. */
function healthState(c, now = Date.now()) {
  const ref = c.lastOkAt ?? c.installedAt;
  const daysSinceOk = ref ? Math.floor((now - ref) / DAY) : null;
  const stale = daysSinceOk != null && daysSinceOk > c.staleDays;
  return {
    daysSinceOk,
    stale,
    neverRan: c.lastOkAt == null,
    failures: c.consecutiveFailures || 0,
    missed: missedCycles(c.cycles, c, new Date(now))
  };
}

function setBadge(kind, text) {
  if (!chrome.action?.setBadgeText) return;
  const colors = { bad: "#c62828", warn: "#ef6c00", none: "#00000000" };
  chrome.action.setBadgeText({ text: text || "" });
  chrome.action.setBadgeBackgroundColor({ color: colors[kind] || colors.none });
}

// ---------------- fetching the account page ----------------

/** Pure: what does a response to the overview URL mean? A signed-out session
 *  is bounced to Amazon's sign-in page, which is a different origin. */
function classifyResponse(res, mk) {
  if (res.type === "opaqueredirect") return "signedout";
  const url = res.url || "";
  if (url && !url.startsWith(mk.origin)) return "signedout";
  if (/\/ap\/signin|\/sign-?in\b/i.test(url)) return "signedout";
  if (res.ok === false) return "http";
  return "ok";
}

async function fetchOverview(mk) {
  const url = overviewUrl(mk.id);
  // A hung request must not leave the popup on "Checking…" forever.
  const opts = { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(20000) };
  let res;
  try {
    res = await fetch(url, { ...opts, redirect: "follow" });
  } catch (e) {
    // A cross-origin redirect (to Amazon's sign-in page, which we have no access
    // to) is blocked and surfaces as a TypeError. Confirm with a no-follow
    // request before calling it a network problem.
    try {
      const r2 = await fetch(url, { ...opts, redirect: "manual" });
      if (classifyResponse(r2, mk) === "signedout") return { kind: "signedout" };
    } catch { /* fall through */ }
    return { kind: "network", error: "Network error: " + (e && e.message ? e.message : String(e)) };
  }
  const verdict = classifyResponse(res, mk);
  if (verdict === "signedout") return { kind: "signedout" };
  if (verdict === "http") return { kind: "network", error: `Audible answered with HTTP ${res.status}.` };
  return { kind: "ok", html: await res.text() };
}

/** Read-only dry run: fetch, parse, derive, report. Writes nothing and
 *  notifies nobody. The setup page and every scheduled check go through it. */
async function probe(capOverride = null, marketId = null) {
  if (!marketId) return { ok: false, kind: "setup", error: "No Audible site has been chosen yet. Run setup." };
  const mk = market(marketId);
  const granted = await chrome.permissions.contains({ origins: [originPattern(mk.id)] }).catch(() => false);
  if (!granted) {
    return { ok: false, kind: "permission", marketId: mk.id,
      error: `Access to ${mk.host} hasn't been granted in Chrome.` };
  }

  const f = await fetchOverview(mk);
  if (f.kind === "signedout") return { ok: false, kind: "signedout", marketId: mk.id, error: `Not signed in to ${mk.host} in this Chrome profile.` };
  if (f.kind !== "ok") return { ok: false, kind: "network", marketId: mk.id, error: f.error };

  const p = parseOverview(f.html, mk.order);
  if (p.signedOut) return { ok: false, kind: "signedout", marketId: mk.id, error: `Not signed in to ${mk.host} in this Chrome profile.` };
  if (p.balance == null) return { ok: false, kind: "markup", marketId: mk.id, error: "Signed in, but the credit balance wasn't where expected on the account page." };

  const cap = capFor(p.perMonth, capOverride, p.annual);
  const accrualDay = p.accrualDate ? parseInt(p.accrualDate.split("-")[2], 10) : null;
  return {
    ok: true, marketId: mk.id, host: mk.host, balance: p.balance, billDate: p.billDate, perMonth: p.perMonth, annual: p.annual,
    cap, accrualDay, paused: p.paused, pauseLinkPresent: p.pauseLinkPresent,
    resumeDate: p.resumeDate, accrualDate: p.accrualDate,
    dateOrder: p.dateOrder, orderTrusted: p.orderTrusted,
    nextCreditDate: p.nextCreditDate, nextBillDate: p.nextBillDate, holdUntil: p.holdUntil,
    suggestedTarget: cap == null ? null : Math.max(0, cap - (p.perMonth || 1)),
    overflowing: cap != null && p.balance > cap,
    atCap: cap != null && p.balance >= cap
  };
}

// ---------------- one check, whatever prompted it ----------------

/** Every read of the account goes through here, so the popup, the badge, the
 *  session state and the cycle record can never disagree.
 *  phase: "early" | "late" | "between" | "hold"; manual: from a click. */
async function attempt({ phase, manual = false, plan = null }) {
  const c = await get();
  const now = Date.now();
  const today = new Date(now);
  const key = plan?.key ?? cycleKey(c, today);
  const days = plan?.days ?? daysBetween(today, nextAccrualDate(c, today));
  const cs = c.cycleState && c.cycleState.key === key ? { ...c.cycleState } : { key };
  const scheduled = !manual && (phase === "early" || phase === "late");
  if (scheduled) cs.lastAttemptAt = now;

  const p = await probe(c.capOverride, c.marketId);
  if (!p.ok) return recordFailure(c, p, { phase, manual, days, cs: scheduled ? cs : null, now });
  if (phase === "hold" && !p.paused) phase = phaseFor(c, days);   // the hold ended since we last looked

  // Record one observation per cycle. This is the empirical record of what
  // Audible actually does to your balance across an accrual boundary.
  const cycles = (c.cycles || []).filter(x => x.cycle !== key);
  const prev = cycles[cycles.length - 1] || null;
  const delta = prev ? p.balance - prev.balance : null;
  cycles.push({ cycle: key, day: iso(today), balance: p.balance, cap: p.cap, paused: p.paused, delta, phase });
  while (cycles.length > 36) cycles.shift();

  // Keep the pause log in sync with what the site says.
  const pauseLog = (c.pauseLog || []).map(x => ({ ...x }));
  const open = pauseLog.find(x => !x.resumedOn);
  if (p.paused && !open) pauseLog.push({ startedOn: iso(today), inferred: true });
  if (!p.paused && open) open.resumedOn = iso(today);
  if (c.holdStartedOn && !pauseLog.some(x => x.startedOn === c.holdStartedOn)) {
    pauseLog.push({ startedOn: c.holdStartedOn, manual: true });
  }
  const ps = pauseStatus(c, pauseLog, today);

  const atRisk = !p.paused && p.cap != null && p.balance >= p.cap;
  const cfgNext = { ...c, accrualDate: p.accrualDate || c.accrualDate, accrualDay: p.accrualDay ?? c.accrualDay };
  const state = {
    ok: true, checkedAt: now, cycle: key, phase, manual, marketId: c.marketId,
    balance: p.balance, cap: p.cap, perMonth: p.perMonth, annual: p.annual, billDate: p.billDate,
    accrualDate: p.accrualDate, nextCreditDate: p.nextCreditDate, holdUntil: p.holdUntil,
    paused: p.paused, delta, atCap: p.atCap, overflowing: p.overflowing, atRisk,
    daysToAccrual: days, nextCheck: iso(nextAccrualDate(cfgNext, today)),
    pause: ps, spend: null, dateOrder: p.dateOrder, orderTrusted: p.orderTrusted
  };
  if (p.paused) state.spend = spendDown(c, state, ps, today);

  // Remember where the spend-down started, so progress can be shown as a
  // fraction of the original gap rather than of nothing.
  let spendStart = c.spendStart || null;
  if (state.spend && !state.spend.done) {
    if (!(spendStart && spendStart.deadline === state.spend.deadline)) {
      spendStart = { needed: state.spend.needed, balance: p.balance, deadline: state.spend.deadline, at: iso(today) };
    }
    state.spend.startNeeded = spendStart.needed;
  } else if (!state.spend) {
    spendStart = null;
  }

  // Cycle progress. A manual read counts as whichever scheduled read is
  // current: the "balance can only fall" logic holds either way.
  if (!p.paused) {
    if (phase === "early") { cs.earlyOkAt = cs.earlyOkAt || now; cs.earlyAtRisk = atRisk; }
    else if (phase === "late") { cs.lateDoneAt = now; }
  }

  await set({
    state, cycles, pauseLog, spendStart, cycleState: cs, lastCheckedCycle: key,
    lastOkAt: now, consecutiveFailures: 0, sessionState: "ok", sessionCheckedAt: now,
    accrualDate: p.accrualDate || null, holdUntil: p.holdUntil || null,
    accrualDay: p.accrualDay ?? c.accrualDay
  });

  if (p.paused) {
    const sp = state.spend;
    const urgent = !!(sp && !sp.done && sp.daysLeft != null && sp.daysLeft <= 14);
    setBadge(urgent ? "warn" : "none", urgent ? String(sp.needed) : "");
    await notifyHold(state, c);
    return state;
  }
  setBadge(atRisk ? "warn" : "none", atRisk ? String(p.balance) : "");
  if (atRisk) await notifyAtRisk(state, c, cs, days, phase, now);
  return state;
}

async function recordFailure(c, p, { phase, manual, days, cs, now }) {
  const kind = p.kind === "signedout" ? "signedout"
             : (p.kind === "permission" || p.kind === "setup") ? "permission"
             : "error";
  const state = { ok: false, kind: p.kind, error: p.error, checkedAt: now, phase, manual };
  const patch = { state, sessionState: kind, sessionCheckedAt: now, consecutiveFailures: (c.consecutiveFailures || 0) + 1 };
  if (cs) patch.cycleState = cs;
  await set(patch);
  setBadge("bad", kind === "signedout" ? "!" : "?");

  // The popup is open and shows this; a notification would only duplicate it.
  if (manual) return state;

  // Sign-in asks are paced by the retry schedule itself, so they can't outrun
  // it: weekly during the early window, daily in the final days.
  const nag = c.lastErrorNotifiedAt ? (now - c.lastErrorNotifiedAt) / DAY : 999;
  const minGap = phase === "late" ? 1 : phase === "hold" ? c.pausedCheckDays : c.earlyRetryDays;
  if (nag < minGap) return state;
  await set({ lastErrorNotifiedAt: now });

  const soon = days != null && days <= c.lateDaysBefore;
  if (kind === "signedout") {
    notify("acg-signedout",
      soon ? "Sign in to Audible — your credit lands soon" : "Sign in to Audible",
      "Your Audible session in this Chrome profile has expired, so your credit balance can't be checked." +
      (days != null ? ` Your next credit lands in ${days} day${days === 1 ? "" : "s"}.` : "") +
      " Signing in takes a moment and checking resumes on its own.",
      ["Sign in to Audible"]);
  } else if (kind === "permission") {
    notify("acg-permission", "Credit Guard needs site access again",
      `${p.error} Run setup to grant it; nothing is being checked until then.`,
      ["Open setup"]);
  } else {
    notify("acg-error", "Credit Guard can't read your Audible account",
      `${p.error} ${advice(p.kind)}`, ["Open Audible"]);
  }
  return state;
}

function advice(kind) {
  if (kind === "signedout") return "Open Audible in this Chrome profile and sign in.";
  if (kind === "markup") return "Audible may have changed their account page. Check for an update to this extension.";
  if (kind === "network") return "Probably transient — it will retry. If it persists, check your connection.";
  return "";
}

// ---------------- what to tell you ----------------

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function notifyAtRisk(s, c, cs, days, phase, now) {
  const per = s.perMonth || 1;
  const over = Math.max(0, s.balance - s.cap);
  const lost = over + per;
  const spendTo = Math.max(0, s.cap - per);
  const when = s.accrualDate ? longDate(s.accrualDate) : `the ${ord(c.accrualDay)}`;
  const canPause = s.pause?.canPause !== false && !s.annual;
  const pauseClause = canPause
    ? "or pause the membership so nothing accrues"
    : s.pause?.cooldownUntil ? `(pausing isn't available again until ${longDate(s.pause.cooldownUntil)})` : "";
  const buttons = canPause ? ["Pause membership"] : ["Open Audible"];

  if (phase !== "late") {
    if (cs.earlyNotifiedAt) return;
    cs.earlyNotifiedAt = now;
    await set({ cycleState: cs });
    return notify("acg-pause",
      `${plural(lost, "Audible credit")} will be lost on ${when}`,
      `You have ${s.balance} against a cap of ${s.cap}. ${plural(days, "day")} to act: spend down to ${spendTo}, ` +
      `${pauseClause}. Buying a title is enough — you keep it whether or not you listen.`,
      buttons);
  }
  if (cs.lateNotifiedAt) return;
  cs.lateNotifiedAt = now;
  await set({ cycleState: cs });
  notify("acg-pause",
    `Last call — your Audible credit lands in ${plural(days, "day")}`,
    `Still ${s.balance} credits against a cap of ${s.cap}. Spend down to ${spendTo} ${pauseClause} ` +
    `before ${when}, or ${plural(lost, "credit")} ${lost === 1 ? "is" : "are"} wasted.`,
    buttons);
}

async function notifyHold(s, c) {
  const sp = s.spend;
  if (!sp) return;
  const deadline = sp.deadline || "none";
  const prevSn = c.spendNotified && c.spendNotified.deadline === deadline ? c.spendNotified : null;
  const sn = { deadline, bands: [...(prevSn?.bands || [])], done: !!prevSn?.done };

  if (sp.done) {
    if (sn.done) return;
    sn.done = true;
    await set({ spendNotified: sn });
    return notify("acg-resume", "Spend-down complete — resume when you like",
      `${s.balance} credits, at or below your target of ${sp.target}. Resuming restarts billing and accrual; ` +
      `the credit that lands will put you at ${s.balance + (s.perMonth || 1)}.`,
      ["Open account page"]);
  }
  if (sp.daysLeft == null) return;
  const band = dueBand(sp.daysLeft, sn.bands);
  if (band == null) return;
  sn.bands.push(band);
  await set({ spendNotified: sn });
  // Remember: credits only need to be SPENT, not listened to. Titles are
  // permanent; credits are the perishable half.
  notify("acg-spend",
    `${plural(sp.needed, "credit")} to spend in ${plural(sp.daysLeft, "day")}`,
    `${s.balance} credits, target ${sp.target} before your next credit lands on ${longDate(sp.deadline)}.` +
    (sp.perWeek != null ? ` That's about ${sp.perWeek} a week.` : "") +
    ` You only need to buy the titles — you keep them whether or not you've listened.`,
    ["Open Audible"]);
}

/** Goodwill-credit expiry watch. Local date arithmetic only; no network. */
async function expiryWatch(c) {
  if (!c.expiryWatchDate) return;
  const left = daysBetween(new Date(), fromISO(c.expiryWatchDate));
  const prev = c.expiryNotified && c.expiryNotified.date === c.expiryWatchDate ? c.expiryNotified : null;
  const bands = [...(prev?.bands || [])];
  const band = dueBand(left, bands);
  if (band == null) return;
  bands.push(band);
  await set({ expiryNotified: { date: c.expiryWatchDate, bands } });
  notify("acg-expiry",
    `${c.expiryWatchCount ?? "Some"} reinstated credits expire in ${plural(left, "day")}`,
    `They expire on ${longDate(c.expiryWatchDate)}. Goodwill credits from Audible support carry their own ` +
    `expiry and don't follow the normal overflow rule.`,
    ["Open Audible"]);
}

function notify(id, title, message, buttons = []) {
  try {
    chrome.notifications.create(id, {
      type: "basic", iconUrl: "icons/128.png", title, message,
      priority: 2, requireInteraction: true,
      buttons: buttons.map(t => ({ title: t }))
    });
  } catch (e) {
    console.warn("notification failed", e);
  }
}

const ord = n => n == null ? "?" : n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

async function openWith(intent) {
  const c = await get();
  await set({ pendingIntent: intent ? { intent, at: Date.now() } : null });
  await chrome.tabs.create({ url: overviewUrl(c.marketId) });
}

function handleClick(id) {
  chrome.notifications.clear(id);
  if (id === "acg-pause") return openWith("pause");
  if (id === "acg-resume") return openWith("resume");
  if (id === "acg-permission") return chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
  // Everything else — signed out, parse failure, stale — wants the account
  // page, which redirects to Amazon sign-in when the session is gone.
  return openWith(null);
}
chrome.notifications.onClicked.addListener(handleClick);
chrome.notifications.onButtonClicked.addListener(handleClick);

// ---------------- content script: registered for ONE site, at runtime ----------------

/** The pause/resume helper runs only on the account page of the chosen
 *  marketplace, and only once site access has been granted for it. */
async function ensureContentScript(marketId) {
  if (!chrome.scripting?.registerContentScripts) return;
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CS_ID] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [CS_ID] });
  } catch { /* nothing registered */ }
  if (!marketId) return;
  const granted = await chrome.permissions.contains({ origins: [originPattern(marketId)] }).catch(() => false);
  if (!granted) return;
  try {
    await chrome.scripting.registerContentScripts([{
      id: CS_ID, matches: [overviewPattern(marketId)], js: ["content.js"],
      runAt: "document_idle", persistAcrossSessions: true
    }]);
  } catch (e) {
    console.warn("content script registration failed", e);
  }
}

async function connect(marketId) {
  if (!MARKETS.some(m => m.id === marketId)) return { ok: false, error: "Unknown marketplace." };
  await set({ marketId });
  await ensureContentScript(marketId);
  return { ok: true, marketId };
}

// ---------------- scheduling ----------------
// A cheap local tick. Network only fires on the accrual schedule (or weekly
// while on hold), and it catches up if Chrome happened to be closed on the day.

async function watchdog() {
  const c = await get();
  if (!c.setupComplete) return;
  const h = healthState(c);
  if (!h.stale && !h.missed.length) return;

  setBadge("bad", "!");
  const since = c.lastStaleNotifiedAt ? (Date.now() - c.lastStaleNotifiedAt) / DAY : 99;
  if (since < c.staleRenotifyDays) return;
  await set({ lastStaleNotifiedAt: Date.now() });

  const bits = [];
  if (h.neverRan) bits.push("It has never completed a successful check.");
  else if (h.stale) bits.push(`The last successful check was ${h.daysSinceOk} days ago.`);
  if (h.missed.length) bits.push(`No reading for ${h.missed.join(", ")}.`);
  notify("acg-stale", "Credit Guard may not be running",
    bits.join(" ") + " Open the popup and press Check now. If it fails, your credits are unmonitored.",
    ["Open Audible"]);
}

async function manualCheck() {
  const c = await get();
  const today = new Date();
  if (c.state?.ok && c.state.paused) return attempt({ phase: "hold", manual: true });
  const days = daysBetween(today, nextAccrualDate(c, today));
  return attempt({ phase: phaseFor(c, days), manual: true });
}

async function tick() {
  await watchdog();
  const c = await get();
  if (!c.setupComplete) return;
  await expiryWatch(c);

  // On hold nothing accrues, so the accrual schedule is irrelevant. Track
  // spend-down pace weekly instead, daily in the last few days.
  if (c.state?.ok && c.state.paused) {
    const sinceDays = c.state.checkedAt ? (Date.now() - c.state.checkedAt) / DAY : 99;
    const interval = (c.state.spend?.daysLeft ?? 99) <= 3 ? 1 : c.pausedCheckDays;
    if (sinceDays >= interval) await attempt({ phase: "hold" });
    return;
  }

  const plan = nextAction(c);
  if (plan.do !== "none") await attempt({ phase: plan.do, plan });
}

chrome.runtime.onInstalled.addListener(async details => {
  const { installedAt, setupComplete, marketId } =
    await chrome.storage.local.get({ installedAt: null, setupComplete: false, marketId: null });
  if (!installedAt) await set({ installedAt: Date.now() });
  chrome.alarms.create(TICK, { periodInMinutes: 60 * 6, when: Date.now() + 3000 });
  await ensureContentScript(marketId);
  // A silent first run leaves you with defaults that may be wrong for your
  // account and no way to know. Walk the setup instead.
  if (details.reason === "install" || !setupComplete) {
    chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create(TICK, { periodInMinutes: 60 * 6 });
  const { sessionState, setupComplete, marketId } =
    await chrome.storage.local.get({ sessionState: null, setupComplete: false, marketId: null });
  await ensureContentScript(marketId);
  // If the session was broken last time, re-check on launch: the user may have
  // signed in since, and if not, the red badge should be there when they look.
  if (setupComplete && sessionState && sessionState !== "ok") setBadge("bad", sessionState === "signedout" ? "!" : "?");
  tick();
});

chrome.alarms.onAlarm.addListener(a => { if (a.name === TICK) tick(); });

// If site access is revoked from chrome://extensions, say so rather than
// failing quietly at the next scheduled check.
chrome.permissions?.onRemoved?.addListener(async perms => {
  const c = await get();
  if (!c.marketId) return;
  const origin = market(c.marketId).origin;
  if (!(perms.origins || []).some(o => o.startsWith(origin))) return;
  await set({
    sessionState: "permission", sessionCheckedAt: Date.now(),
    state: { ok: false, kind: "permission", error: `Access to ${market(c.marketId).host} was removed.`, checkedAt: Date.now() }
  });
  setBadge("bad", "?");
  await ensureContentScript(null);
});

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  const reply = pr => {
    pr.then(respond, e => respond({ ok: false, kind: "error", error: String(e && e.message ? e.message : e) }));
    return true;
  };
  switch (msg?.type) {
    case "check":      return reply(manualCheck());
    case "probe":      return reply(probe(msg.capOverride ?? null, msg.marketId ?? null));
    case "connect":    return reply(connect(msg.marketId));
    case "intent":     return reply(openWith(msg.intent ?? null).then(() => ({ ok: true })));
    case "health":     return reply(get().then(c => ({
                         ...healthState(c), setupComplete: c.setupComplete, marketId: c.marketId,
                         host: c.marketId ? market(c.marketId).host : null
                       })));
    case "markets":
      respond({ markets: MARKETS.map(m => ({ id: m.id, label: m.label, host: m.host, origin: m.origin })), guess: guessMarket(msg.lang) });
      return false;
    case "testNotify":
      notify("acg-test", "Test notification", "If you can see this, alerts from Credit Guard for Audible will reach you.");
      respond({ ok: true });
      return false;
    case "openSetup":
      chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
      respond({ ok: true });
      return false;
  }
  return false;
});

// exported for the test harness
if (typeof module !== "undefined") {
  module.exports = {
    MARKETS, market, overviewUrl, originPattern, overviewPattern, guessMarket,
    toISO, fromISO, ukDate, iso, inferOrder, plausibleAccrual, nextAccrualDate, cycleKey, phaseFor, nextAction,
    parseOverview, capFor, pauseStatus, spendDown, dueBand, missedCycles, healthState,
    classifyResponse, probe, daysBetween, longDate, ord
  };
}
