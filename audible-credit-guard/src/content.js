/* Runs on the account overview page of the ONE Audible marketplace chosen in
 * setup. It is registered at runtime (chrome.scripting) after you grant site
 * access, and never runs anywhere else.
 *
 * Its only job: when you clicked through from a notification, open Audible's
 * own pause dialog or point at the resume control. It never confirms anything —
 * you complete Audible's flow yourself. Reaching this page on your own does
 * nothing at all. */

(async () => {
  const { pendingIntent } = await chrome.storage.local.get({ pendingIntent: null });
  if (!pendingIntent) return;
  const intent = typeof pendingIntent === "string" ? pendingIntent : pendingIntent.intent;
  const at = typeof pendingIntent === "string" ? 0 : (pendingIntent.at || 0);
  await chrome.storage.local.set({ pendingIntent: null });
  // A click-through that never arrived shouldn't fire on some later visit.
  if (!intent || Date.now() - at > 10 * 60 * 1000) return;

  if (intent === "pause") {
    const link = await waitFor(() => document.querySelector("#pauseEligibleLink"), 8000);
    if (!link) {
      return banner("Pause isn't offered on this account right now.",
        "Audible hides it during a hold, inside the paid-month gap between holds, " +
        "on annual plans, and in the first 30 days. Spending down to the cap still works.");
    }
    highlight(link);
    banner("Opening Audible's pause dialog…",
      "Confirm inside Audible's own flow. Nothing is changed until you do.");
    setTimeout(() => link.click(), 900);
    return;
  }

  if (intent === "resume") {
    const link = await waitFor(() => findByText(/resume (your )?membership|unpause|end (my )?hold/i), 8000);
    if (!link) {
      return banner("Couldn't find the resume control.",
        "Look for it under Your membership on this page and resume manually.");
    }
    highlight(link);
    banner("Found the resume control.",
      "Click it yourself — resuming restarts billing and monthly accrual.");
  }
})();

function findByText(re) {
  return [...document.querySelectorAll("a,button")].find(
    e => re.test((e.textContent || "").trim()) && e.offsetParent !== null
  ) || null;
}

function highlight(el) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.style.outline = "3px solid #f60";
  el.style.outlineOffset = "3px";
}

function waitFor(fn, ms) {
  return new Promise(resolve => {
    const t0 = Date.now();
    (function poll() {
      const v = fn();
      if (v) return resolve(v);
      if (Date.now() - t0 > ms) return resolve(null);
      setTimeout(poll, 200);
    })();
  });
}

function banner(title, body) {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;z-index:2147483647;top:16px;right:16px;max-width:340px;padding:14px 16px;" +
    "background:#111;color:#fff;font:14px/1.45 system-ui,sans-serif;border-radius:10px;" +
    "box-shadow:0 8px 28px rgba(0,0,0,.35)";
  const strong = document.createElement("strong");
  strong.style.cssText = "display:block;margin-bottom:4px";
  strong.textContent = title;
  const span = document.createElement("span");
  span.style.opacity = ".85";
  span.textContent = body;
  el.append(strong, span);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 15000);
}
