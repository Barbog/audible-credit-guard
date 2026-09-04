# audible-credit-guard — notes for Claude Code

The GitHub repository was renamed from `Barbog/ChromePlugins` to
`Barbog/audible-credit-guard` on 4 Sept 2026 (GitHub redirects the old name).
The owner's local checkout folder is still called `ChromePlugins`; that is
fine, only the remote changed.

Read `audible-credit-guard/HANDOFF.md` before doing anything else: it records
the state of the Chrome Web Store submission, what is blocked and why, and the
next steps. Every session should start there.

## Layout

```
audible-credit-guard/
  src/       the extension: manifest.json, background.js (MV3 service worker),
             content.js, popup.*, setup.*, icons/  — this folder is what gets zipped
  test/      node test/test.js — pure-node unit checks, no dependencies
  tools/     package.json (Playwright, ffmpeg-static, Inter), smoke.js, assets.js,
             video.js, video.html, build.sh, icon.svg
  store/     LISTING.md (every console field), PRIVACY.md, SUBMISSION.md (console
             walkthrough), icon/screenshots/tiles/promo video
  dist/      the uploadable zip, built by tools/build.sh
  HANDOFF.md status, decisions, blockers, next steps, continuation prompt
```

## Commands (run from `audible-credit-guard/`)

```
node test/test.js                 # 163 checks; must print "all N checks passed"
cd tools && npm install           # once per container (the SessionStart hook does this on the web)
cd tools && npm run lint          # node --check over every script
cd tools && node smoke.js         # loads src/ in headless Chromium: install, setup, popup, messaging
cd tools && node assets.js        # regenerates store/*.png from the real popup and setup pages
cd tools && node video.js         # renders store/promo-video.mp4 (~3 min); node video.js 2,9,22 previews seconds
cd tools && node console.js       # opens the store developer console in Chrome on a dedicated profile (--check: print title and exit)
cd tools && node console-drive.js # background driver for that profile: POST /eval, /shot, /quit on 127.0.0.1:9333 (HANDOFF.md 3.9)
bash tools/build.sh               # runs tests, then builds dist/credit-guard-for-audible-<version>.zip
```

## Rules

- Never publish, submit for review, or change visibility on the Chrome Web
  Store without the owner's explicit go-ahead in the current conversation.
  Creating and filling in a draft item is fine.
- Bump `version` in `src/manifest.json` before building a zip that will be
  uploaded; the store rejects a repeat version. Current store package: 1.1.3.
- Keep `node test/test.js` green and re-run `tools/smoke.js` after touching
  `src/`. Re-run `tools/assets.js` if the popup or setup page changed, since the
  screenshots are rendered from them.
- The parser lives in `parseOverview()` in `src/background.js` and was verified
  against the live audible.co.uk account page (active and paused) on
  3 Sept 2026. Other marketplaces are supported on the assumption their
  English wording matches; see HANDOFF.md.
- No site access is granted at install (optional host permissions, one
  marketplace chosen at setup). Don't reintroduce static `host_permissions` or
  manifest `content_scripts`; that was deliberate for review and user trust.
- Work on branch `claude/chrome-extension-production-pzvr1v` unless told
  otherwise; never push elsewhere without permission.
- Do not put model identifiers in commits, code, or docs.
- The Chrome Web Store developer console cannot be driven through the Claude
  in Chrome extension: Chrome blocks all extensions on
  `chrome.google.com/webstore/*` ("The extensions gallery cannot be scripted").
  Don't spend a session trying; see HANDOFF.md §2.1. The working route is
  Playwright on a dedicated signed-in profile via `tools/console.js`
  (HANDOFF.md §3.9).
- Network in the Claude Code web container used so far blocked
  chrome.google.com, audible.* and developer.chrome.com; registry.npmjs.org
  and github.com worked. Check before assuming.
