# Credit Guard for Audible

A Chrome extension that checks your Audible credit balance once per accrual
cycle — the day after a credit lands — and warns you if you're at your plan's
cap, with one click through to Audible's own pause dialog. While your
membership is on hold it tracks the spend-down instead.

Free, local, no account. Not affiliated with Audible or Amazon.

```
src/      the extension (this is what gets zipped and uploaded)
test/     node test/test.js — 148 checks on scheduling, parsing, bookkeeping
tools/    build, headless smoke test, store-asset and video generators
store/    listing copy, privacy policy, screenshots, tiles, promo video
dist/     the uploadable zip
```

## The model it's built on

Audible credits **do not expire on a clock**. They **overflow**: at the accrual
event, anything above your plan's cap is lost. Caps are 6 (1 credit monthly),
12 (2 monthly), 18 (12 annually), 36 (24 annually).

So there is exactly one decision point per cycle, just after accrual. Polling
more often than that tells you nothing new — hence one check per cycle.

Pausing suspends billing *and* accrual, so nothing overflows while on hold.
Per Audible support (unverified): up to **3 months per hold**, with at least
**1 paid month between holds**. Both numbers are settings.

Goodwill / reinstated credits are a separate bucket and may carry a 12-month
expiry even though ordinary credits don't. Set the expiry watch for those.

## How it decides what to do

Credits arrive only at the accrual event, so a balance can only **fall**
between accruals. That single fact shapes the whole schedule: once a reading
comes back under the cap, nothing can put you back at risk before the date,
and the cycle is closed with no further checks and no notifications.

For an accrual on the 12th:

| When | What happens |
|---|---|
| 13th onward | First read, retried **weekly** until one succeeds |
| On first success, if at or over cap | **Notification 1** — spend down or pause, with ~4 weeks to act |
| On first success, if under cap | Cycle closed. Nothing further |
| 10th (2 days out) | Final read — only if the early read said you were at risk |
| If still at or over cap | **Notification 2** — last call |

**On hold:** nothing accrues, so the accrual schedule is irrelevant. It checks
weekly (daily in the last three days) and announces the spend-down at
60/30/14/7/3/1 days before the credit date, once per milestone. The deadline is
the **credit date**, not the hold end — Audible prints both and they differ.

**Manual checks** ("Check now") count as whichever scheduled read is current,
so pressing the button never adds notifications beyond the two.

**Failure is loud.** Every failure path — signed out, site access revoked,
markup changed, network — sets a red badge, replaces the popup's balance panel
with the reason and the last known balance, and notifies (rate-limited: weekly
in the early window, daily in the final days). A local watchdog with no network
dependency fires if no successful check has happened in 45 days or a cycle went
unrecorded.

## Permissions

Install-time: `alarms`, `storage`, `notifications`, `scripting`. **No site
access at install.** All five Audible domains are `optional_host_permissions`;
setup asks which site your membership is on and Chrome prompts for that one
origin. Any other grant is released when setup finishes.

The pause/resume helper (`content.js`) is registered at runtime with
`chrome.scripting.registerContentScripts` for the account overview page of that
one site, and only after the grant exists. It acts only when you've clicked
through from a notification in the last ten minutes, and never confirms
anything.

## Supported Audible marketplaces

audible.co.uk, audible.com, audible.ca, audible.com.au, audible.in.

The UK, Australian and Indian sites print dates day-first; the US and Canadian
sites month-first. Those are indistinguishable for the first twelve days of any
month, so the parser checks each date is plausible and, if it isn't, re-reads
it the other way round and flags that it did.

Non-English marketplaces (de, fr, it, es, co.jp) print these labels in other
languages and are deliberately unsupported rather than half-working.

## Install from source

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → the `src`
   folder.
2. The setup page opens. Pick your Audible site, press Connect, allow Chrome's
   prompt, sign in to Audible if it says you aren't, confirm what it read,
   send yourself a test notification, Finish.

Nothing is scheduled until setup completes. Re-open setup any time from the
popup's footer or from Details → Extension options on `chrome://extensions`.

## Development

```
cd tools && npm install          # playwright, ffmpeg-static, Inter (dev only)
node ../test/test.js             # unit checks
node smoke.js                    # loads src/ in headless Chromium
node assets.js                   # regenerates store/*.png from the real popup
node video.js                    # renders store/promo-video.mp4 (about 2 min)
bash build.sh                    # tests, then dist/credit-guard-for-audible-<version>.zip
```

Audible reshuffles its markup periodically. The patterns are isolated in
`parseOverview()` in `src/background.js`, verified against the live UK account
page (active and paused) on 3 Sept 2026:

- balance — `You have N Credits` (with fallbacks for `N credits available` and `Credit balance: N`)
- plan — `N credits a month` / `N credits a year`
- dates — `Your next bill date is:`, `Your next credit date:`, `Account on hold till:`
- pause control — `#pauseEligibleLink`, only rendered when Audible considers the account eligible

## Caveat

Amazon's Conditions of Use discourage automated access. This makes one request
a month, from your own browser, to your own account page — the same request
opening that page makes. Defensible, but it's your account and your risk.
