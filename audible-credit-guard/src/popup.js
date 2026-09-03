const $ = id => document.getElementById(id);
const FIELDS = ["accrualDay", "checkOffsetDays", "capOverride", "pauseMaxMonths", "minPaidMonthsBetweenPauses",
  "expiryWatchDate", "expiryWatchCount", "holdStartedOn", "resumeDateOverride", "spendTargetOverride", "pausedCheckDays"];
const esc = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const num = v => (typeof v === "number" && isFinite(v)) ? v : esc(v ?? "—");

let D = {};

function cycleLine(s, cs) {
  if (s.paused) return "on hold — nothing accruing";
  if (!cs || cs.key !== s.cycle) return s.phase === "late" ? "final check done" : "read done";
  if (cs.lateDoneAt) return "final check done";
  if (cs.earlyOkAt && cs.earlyAtRisk === false) return "closed, under cap";
  if (cs.earlyOkAt) return "at risk — final check due";
  return "first read pending";
}

function render(s) {
  if (!s) return `<div class="msg info">No check has run yet. Press <b>Check now</b>.</div>`;
  if (!s.ok) return `<div class="msg">${esc(s.error)}</div>`;

  const cap = s.cap == null ? "unknown" : s.cap;
  const tone = s.paused ? "hold" : (s.overflowing || s.atCap) ? "risk" : "ok";
  const label = s.paused ? "on hold" : s.overflowing ? `over cap of ${cap}` : s.atCap ? `at cap of ${cap}` : `cap ${cap}`;

  let note = "";
  const sp = s.spend;
  if (s.paused) {
    if (sp?.done) {
      note = `<div class="msg info">Spend-down complete — at or below your target of ${num(sp.target)}.
        Resuming puts you at ${num(s.balance + (s.perMonth || 1))}.</div>`;
    } else if (sp) {
      // Progress against the gap as it stood when the hold began.
      const total = Math.max(sp.startNeeded ?? D.spendStart?.needed ?? sp.needed, 1);
      const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - sp.needed / total))));
      note = `<div class="msg hold">
        <b>Spend ${num(sp.needed)} more by ${esc(sp.deadline ?? "the end of your hold")}</b>
        ${sp.holdEnds && sp.holdEnds !== sp.deadline ? `<span style="opacity:.75">(billing restarts ${esc(sp.holdEnds)}, but the credit lands later)</span>` : ""}
        ${sp.daysLeft != null ? `${num(sp.daysLeft)} days left${sp.perWeek != null ? ` — about ${num(sp.perWeek)}/week` : ""}.` : ""}
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span style="opacity:.75">You only need to <i>buy</i> the titles. You keep them regardless.</span>
      </div>`;
    } else {
      note = `<div class="msg info">On hold. Nothing accruing.</div>`;
    }
  } else if (s.cap == null) {
    note = `<div class="msg info">Your plan's cap couldn't be inferred, so overflow can't be judged. Set a cap override in Settings.</div>`;
  } else if (s.overflowing) {
    const over = s.balance - s.cap;
    note = `<div class="msg"><b>${over} credit${over === 1 ? "" : "s"} above the cap.</b> The excess is lost when the next credit lands.</div>`;
  } else if (s.atCap) {
    note = `<div class="msg"><b>At the cap.</b> The next credit will overflow and be lost.</div>`;
  }

  if (!s.paused && s.pause && !s.pause.canPause && s.pause.cooldownUntil) {
    note += `<div class="msg info">Pause unavailable until ${esc(s.pause.cooldownUntil)} (${num(s.pause.cooldownDays)} days) — needs a paid month between holds.</div>`;
  }
  if (s.orderTrusted === false) {
    note += `<div class="msg info">The date order on this page didn't match its marketplace; it was read the other way round. Check the next-credit date below.</div>`;
  }

  return `
    <div class="big ${tone}">${num(s.balance)} credits</div>
    <div class="sub ${tone}">${esc(label)}${s.annual ? " · annual plan" : ""}</div>
    ${note}
    ${sp?.target != null ? `<div class="row"><span>Spend-down target</span><span>${num(sp.target)}</span></div>` : ""}
    ${!s.paused && s.daysToAccrual != null ? `<div class="row"><span>Credit lands in</span><span>${num(s.daysToAccrual)} days</span></div>` : ""}
    <div class="row"><span>Next credit arrives</span><span>${esc(s.accrualDate ?? s.billDate ?? "—")}</span></div>
    ${s.holdUntil ? `<div class="row"><span>On hold until</span><span>${esc(s.holdUntil)}</span></div>` : ""}
    <div class="row"><span>Change since last cycle</span><span>${s.delta == null ? "—" : (s.delta >= 0 ? "+" : "") + num(s.delta)}</span></div>
    <div class="row"><span>This cycle</span><span>${esc(cycleLine(s, D.cycleState))}</span></div>
    <div class="row"><span>Last checked</span><span>${new Date(s.checkedAt).toLocaleDateString()}</span></div>`;
}

function renderCycles(cycles) {
  if (!cycles?.length) return;
  $("cycles").innerHTML = cycles.slice(-8).reverse().map(c => `
    <tr><td>${esc(c.cycle)}</td>
        <td style="opacity:.6">${c.paused ? "on hold" : c.cap != null && c.balance > c.cap ? "over cap" : c.cap != null && c.balance === c.cap ? "at cap" : "ok"}</td>
        <td><b>${num(c.balance)}</b>${c.delta == null ? "" : ` <span style="opacity:.55">(${c.delta >= 0 ? "+" : ""}${num(c.delta)})</span>`}</td></tr>`).join("");
}

function renderHealth(h) {
  if (!h) return "";
  if (!h.stale && !h.missed?.length && !h.failures) {
    return `<div class="row"><span>Health</span><span class="ok">checking normally${h.daysSinceOk != null ? ` (${h.daysSinceOk}d ago)` : ""}</span></div>`;
  }
  const bits = [];
  if (h.neverRan) bits.push("Never completed a successful check.");
  else if (h.stale) bits.push(`No successful check in ${h.daysSinceOk} days.`);
  if (h.missed?.length) bits.push(`Missed: ${h.missed.map(esc).join(", ")}.`);
  if (h.failures) bits.push(`${h.failures} consecutive failure${h.failures === 1 ? "" : "s"}.`);
  return `<div class="msg"><b>Not monitoring reliably.</b> ${bits.join(" ")}</div>`;
}

function button(text, onclick) {
  const b = document.createElement("button");
  b.textContent = text;
  b.className = "wide";
  b.onclick = onclick;
  return b;
}
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);

async function load() {
  const d = await chrome.storage.local.get(null);
  D = d;
  const h = await send({ type: "health" });
  $("market").textContent = h?.host ? h.host : "";

  // History stays visible in every state — a signed-out popup should still show
  // what it last knew, not an empty placeholder.
  renderCycles(d.cycles);

  if (!d.setupComplete) {
    $("out").innerHTML = `<div class="msg">Setup hasn't been completed, so nothing is being monitored yet.</div>`;
    $("out").append(button("Open setup", () => send({ type: "openSetup" })));
    $("act").hidden = true;
    return;
  }

  if (d.sessionState && d.sessionState !== "ok") {
    const kind = d.sessionState;
    const head = kind === "signedout" ? "Signed out of Audible."
               : kind === "permission" ? "Site access is missing."
               : "Can't read your account.";
    const body = kind === "signedout"
      ? "Your session expired, so your balance isn't being checked. Sign in and monitoring resumes automatically."
      : kind === "permission"
      ? "Chrome no longer lets this extension read your Audible account page, so nothing is being checked. Run setup to grant it again."
      : `${esc(d.state?.error || "The account page didn't parse.")} Your balance isn't being checked.`;
    $("out").innerHTML = `<div class="msg"><b>${head}</b> ${body}</div>`;
    $("out").append(kind === "permission"
      ? button("Run setup", () => send({ type: "openSetup" }))
      : button(kind === "signedout" ? "Sign in to Audible" : "Open Audible", () => send({ type: "intent", intent: null })));
    if (d.state?.balance != null) {
      const note = document.createElement("div");
      note.className = "sub";
      note.style.marginTop = "10px";
      note.textContent = `Last known: ${d.state.balance} credits, as of ${new Date(d.sessionCheckedAt || d.state.checkedAt).toLocaleDateString()}.`;
      $("out").append(note);
    }
    $("act").hidden = true;
    return;
  }

  $("out").innerHTML = render(d.state) + renderHealth(h);
  for (const f of FIELDS) $(f).value = d[f] == null ? "" : d[f];

  const s = d.state;
  const act = $("act");
  if (s?.ok && s.paused && s.spend?.done) {
    act.hidden = false; act.textContent = "Resume…"; act.dataset.intent = "resume";
  } else if (s?.ok && !s.paused && (s.atCap || s.overflowing) && s.pause?.canPause !== false && !s.annual) {
    act.hidden = false; act.textContent = "Pause…"; act.dataset.intent = "pause";
  } else {
    act.hidden = true;
  }
}

$("check").onclick = async () => {
  const b = $("check");
  b.disabled = true; b.textContent = "Checking…";
  try { await send({ type: "check" }); }
  finally { b.disabled = false; b.textContent = "Check now"; }
  load();
};

$("act").onclick = () => send({ type: "intent", intent: $("act").dataset.intent });
$("setup").onclick = e => { e.preventDefault(); send({ type: "openSetup" }); };

$("save").onclick = async () => {
  const patch = {};
  for (const f of FIELDS) {
    const v = $(f).value.trim();
    patch[f] = v === "" ? null : ($(f).type === "number" ? parseInt(v, 10) : v);
    if (Number.isNaN(patch[f])) patch[f] = null;
  }
  await chrome.storage.local.set(patch);
  $("save").textContent = "Saved";
  setTimeout(() => ($("save").textContent = "Save"), 1200);
  load();
};

load();
