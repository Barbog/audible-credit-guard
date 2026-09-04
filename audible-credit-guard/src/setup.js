const $ = id => document.getElementById(id);
let MARKETS = [];
let chosen = null, probed = null, notifyTested = false;

const mark = (n, kind, glyph) => {
  const d = $("d" + n);
  d.className = "dot" + (kind ? " " + kind : "");
  d.textContent = glyph ?? n;
  // Steps 2–4 dim until reached. Step 1 holds the site dropdown and Connect,
  // so it must never dim: resetting it after a site change used to grey out
  // the very controls the person needs next.
  $("s" + n).dataset.state = kind ? "done" : n === 1 ? "active" : "pending";
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
function put(id, ...nodes) { const b = $(id); b.textContent = ""; nodes.forEach(n => b.append(n)); }
const send = msg => chrome.runtime.sendMessage(msg);
const mk = id => MARKETS.find(m => m.id === id) || MARKETS[0];
const originPattern = id => mk(id).origin + "/*";
const ord = n => n == null ? "?" : n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

function resetLater() {
  probed = null;
  [2, 3, 4].forEach(n => { mark(n, null); $("b" + n).textContent = "Waiting."; });
  gate();
}

async function init() {
  const { marketId } = await chrome.storage.local.get({ marketId: null });
  const { markets, guess } = await send({ type: "markets", lang: navigator.language });
  MARKETS = markets;
  const sel = $("market");
  sel.textContent = "";
  for (const m of markets) {
    const o = el("option", null, `${m.label} — ${m.host}`);
    o.value = m.id;
    sel.append(o);
  }
  chosen = marketId || guess;
  sel.value = chosen;
  sel.onchange = () => { chosen = sel.value; mark(1, null); $("b1").textContent = ""; resetLater(); };

  $("connect").onclick = connect;
  $("recheck").onclick = run;

  // Access already granted for the stored site? Then go straight to the dry run.
  if (marketId && await chrome.permissions.contains({ origins: [originPattern(marketId)] })) run();
}

async function connect() {
  // permissions.request must run inside the click, before anything is awaited.
  let ok = false;
  try { ok = await chrome.permissions.request({ origins: [originPattern(chosen)] }); }
  catch (e) { ok = false; }
  if (!ok) {
    mark(1, "bad", "!");
    const box = el("div", "err");
    box.append(el("b", null, "Site access wasn't granted."));
    box.append(el("div", null, `Chrome asked whether this extension may read ${mk(chosen).host}. ` +
      "Without that it can't see your credit balance. Press Connect to try again."));
    return put("b1", box);
  }
  await send({ type: "connect", marketId: chosen });
  run();
}

async function run() {
  $("finish").disabled = true;
  $("recheck").disabled = false;
  resetLater();
  put("b1", el("div", null, "Checking…"));

  const cfg = await chrome.storage.local.get({ capOverride: null });
  const p = await send({ type: "probe", capOverride: cfg.capOverride, marketId: chosen });
  const host = mk(chosen).host;

  // ---- step 1: session ----
  if (!p.ok) {
    mark(1, "bad", "!");
    const box = el("div", "err");
    if (p.kind === "signedout") {
      box.append(el("b", null, `Not signed in to ${host} in this Chrome profile.`));
      box.append(el("div", null, "Sign in on Audible, then come back here and run the dry run again. Nothing else can be checked until this works."));
      const a = el("button", null, `Open ${host}`);
      a.onclick = () => chrome.tabs.create({ url: mk(chosen).origin + "/account/overview" });
      const again = el("button", null, "I've signed in — check again");
      again.onclick = run;
      const row = el("div", "inline"); row.append(a, again);
      box.append(row);
    } else if (p.kind === "permission") {
      box.append(el("b", null, "Site access hasn't been granted."));
      box.append(el("div", null, "Press Connect and allow Chrome's request."));
    } else if (p.kind === "markup") {
      box.append(el("b", null, "Signed in, but the page didn't parse."));
      box.append(el("div", null, p.error));
      box.append(el("div", "hint", "This extension was verified on audible.co.uk; the other English sites are supported on a best-effort basis. " +
        "Audible may word this page differently on your site, or may have changed it, or this membership may be on a different Audible site than the one selected. " +
        "Try another site above, or check for an update to this extension."));
      if (p.reportUrl) {
        box.append(el("div", "hint", "A report takes a minute and is usually what gets it fixed. It opens a GitHub issue pre-filled with what the parser " +
          "could and couldn't find on the page, with every number masked. You can read and edit it before submitting; nothing is sent until you do."));
        const rep = el("button", "primary", "Report this on GitHub");
        rep.onclick = () => chrome.tabs.create({ url: p.reportUrl });
        const row = el("div", "inline"); row.append(rep);
        box.append(row);
      }
    } else {
      box.append(el("b", null, "Couldn't reach Audible."));
      box.append(el("div", null, p.error || ""));
    }
    return put("b1", box);
  }
  mark(1, "ok", "✓");
  put("b1", el("div", "good", `Signed in to ${host}. The account page loaded and parsed.`));
  probed = p;

  // ---- step 2: what it read ----
  mark(2, p.cap == null ? "warn" : "ok", p.cap == null ? "?" : "✓");
  const t = el("table");
  const row = (k, v) => { const tr = el("tr"); tr.append(el("td", null, k), el("td", null, String(v))); t.append(tr); };
  row("Credit balance", p.balance);
  row(p.annual ? "Credits per year" : "Credits per month", p.perMonth ?? "not found");
  row("Rollover cap", p.cap ?? "unknown — set it manually");
  row("Next credit arrives", p.accrualDate ?? "not found");
  if (p.holdUntil) row("Membership on hold until", p.holdUntil);
  row("Membership state", p.paused ? "paused" : "active");
  row("Pause offered right now", p.pauseLinkPresent ? "yes" : "no");
  put("b2", t, el("div", "hint",
    p.cap == null
      ? "The plan text didn't match a known cap. Set one below or the overflow check can't run."
      : "All read live from your account page just now. Nothing here is assumed, " +
        "and nothing about dates needs to be entered by hand."));
  if (p.orderTrusted === false) {
    $("b2").append(el("div", "warn", "The date on the page only made sense read the other way round " +
      "(day and month swapped). Double-check the next-credit date above; if it's wrong, you may have picked the wrong Audible site."));
  }
  if (p.cap == null) {
    const lab = el("label", null, "Cap override");
    const inp = el("input"); inp.type = "number"; inp.id = "capFix"; inp.min = "1";
    lab.append(inp); $("b2").append(lab);
  }

  // ---- step 3: your situation ----
  mark(3, p.overflowing || p.atCap ? "warn" : "ok", p.overflowing || p.atCap ? "!" : "✓");
  const b3 = $("b3"); b3.textContent = "";
  if (p.paused) {
    const target = p.suggestedTarget ?? 0;
    const need = Math.max(0, p.balance - target);
    b3.append(el("div", "warn",
      `On hold until ${p.holdUntil ?? "an unknown date"}, with the next credit landing ${p.accrualDate ?? "later"}. ` +
      (need > 0
        ? `Nothing accrues meanwhile, so the job is spend-down: get to ${target} before ${p.accrualDate ?? "then"} — ${need} more. ` +
          `Buying a title is enough; you keep it whether or not you listen.`
        : `You're already at or below ${target}, so the returning credit won't overflow.`)));
  } else if (p.cap == null) {
    b3.append(el("div", "warn", `You have ${p.balance} credits. Set a cap above so the overflow check can run.`));
  } else if (p.overflowing) {
    b3.append(el("div", "warn",
      `You have ${p.balance} credits against a cap of ${p.cap}. ${p.balance - p.cap + (p.perMonth || 1)} will be lost when the next credit lands on ${p.accrualDate ?? "the " + ord(p.accrualDay)}. ` +
      `Spend down to ${p.suggestedTarget}, or pause before then.`));
  } else if (p.atCap) {
    b3.append(el("div", "warn", `You're exactly at the cap of ${p.cap}. The next credit will overflow and be lost unless you spend one first.`));
  } else {
    b3.append(el("div", "good", `${p.balance} credits against a cap of ${p.cap}. Nothing at risk right now.`));
  }
  const opt = el("div");
  opt.append(el("div", "hint",
    "One thing Audible doesn't publish anywhere: goodwill credits reinstated by " +
    "support carry their own expiry. If you've been given any, put the date here — " +
    "it's the only field that can't be read from your account. Leave it blank otherwise."));
  opt.append(field("expiryWatchDate", "date", "Reinstated-credit expiry date (optional)"));
  opt.append(field("expiryWatchCount", "number", "…how many credits"));
  b3.append(opt);

  // ---- step 4: notifications ----
  mark(4, notifyTested ? "ok" : "warn", notifyTested ? "✓" : "?");
  const b4 = $("b4"); b4.textContent = "";
  const btn = el("button", null, "Send a test notification");
  const ans = el("div", "hint", "");
  btn.onclick = async () => {
    await send({ type: "testNotify" });
    ans.textContent = "";
    ans.append(el("span", null, "Sent. Did it appear? "));
    const yes = el("button", null, "Yes"), no = el("button", null, "No");
    yes.onclick = () => { notifyTested = true; mark(4, "ok", "✓"); put("b4", el("div", "good", "Alerts will reach you.")); gate(); };
    no.onclick = () => {
      mark(4, "bad", "!");
      const box = el("div", "err");
      box.append(el("b", null, "Alerts are being swallowed."));
      box.append(el("div", null, "Check your system notification settings (Chrome must be allowed, and Focus / Do Not Disturb off), " +
        "then Chrome → Settings → Privacy and security → Site settings → Notifications. Every warning this extension produces depends on this working."));
      put("b4", box);
    };
    ans.append(yes, no);
  };
  b4.append(btn, ans);

  gate();
}

function field(id, type, label) {
  const lab = el("label", null, label);
  const inp = el("input"); inp.type = type; inp.id = id;
  lab.append(inp);
  chrome.storage.local.get({ [id]: null }).then(v => { if (v[id] != null) inp.value = v[id]; });
  return lab;
}

function gate() {
  const capOk = probed && (probed.cap != null || ($("capFix") && $("capFix").value));
  $("finish").disabled = !(probed && capOk);
  $("status").textContent = !probed ? "Finish step 1 first."
    : !capOk ? "Set a cap to continue."
    : notifyTested ? "" : "You can finish without testing notifications, but you'd be trusting an untested alert path.";
}
document.addEventListener("input", gate);

$("finish").onclick = async () => {
  const patch = { setupComplete: true, marketId: chosen, sessionState: "ok" };
  if (probed.accrualDay) patch.accrualDay = probed.accrualDay;
  if (probed.accrualDate) patch.accrualDate = probed.accrualDate;
  if (probed.holdUntil) patch.holdUntil = probed.holdUntil;
  const capFix = $("capFix");
  if (capFix && capFix.value) patch.capOverride = parseInt(capFix.value, 10);
  for (const id of ["expiryWatchDate", "expiryWatchCount"]) {
    const e = $(id);
    if (e) patch[id] = e.value ? (e.type === "number" ? parseInt(e.value, 10) : e.value) : null;
  }
  await chrome.storage.local.set(patch);
  await send({ type: "connect", marketId: chosen });

  // Only the chosen site is kept. Any other site access granted along the way
  // (a wrong first guess, say) is handed back.
  for (const m of MARKETS) {
    if (m.id === chosen) continue;
    const origins = [m.origin + "/*"];
    if (await chrome.permissions.contains({ origins })) await chrome.permissions.remove({ origins }).catch(() => {});
  }

  $("finish").disabled = true;
  $("status").textContent = "Running the first check…";
  await send({ type: "check" });
  $("status").textContent = probed.accrualDate
    ? `Set up. Next credit ${probed.accrualDate}; the first scheduled check runs the day after. You can close this tab.`
    : "Set up. You can close this tab.";
};

init();
