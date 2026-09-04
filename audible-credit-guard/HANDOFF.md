# Handoff — Credit Guard for Audible

_Written 4 September 2026, at commit "Add Credit Guard for Audible, production-ready
for the Chrome Web Store" on branch `claude/chrome-extension-production-pzvr1v`.
Updated later the same day from a local Claude Code session on the owner's
Windows machine with the Claude in Chrome extension attached; see §2.1 for
what that session found and §8 for its log._

This is the document to read when picking the project up in a new container or a
new chat. It says what exists, what was verified, what could not be done and why,
what I recommend doing next, and gives a prompt to paste into a new session.

## 1. Where things stand

**Goal set by the owner:** make the extension production-worthy, create a Chrome
Web Store item with a fully complete draft (assets and video included), but do
**not** publish. Done when the owner can review it in the store and legitimately
expect it to go live when they press the release button.

| Piece | State |
|---|---|
| Extension code (`src/`) | Rewritten and hardened. Version 1.1.1 (1.1.0 plus the renamed `homepage_url`). See §4 for what changed. |
| Unit tests (`test/test.js`) | 163 checks, all passing. |
| Headless smoke test (`tools/smoke.js`) | Passes (web container, and locally on Windows on 4 Sept 2026): install opens setup, no site access at install, probe refuses without a grant, popup renders every state, messaging works. |
| Upload package | `dist/credit-guard-for-audible-1.1.1.zip` (12 files, manifest at root). |
| Store copy | `store/LISTING.md` — every console field, verbatim. |
| Privacy policy | `store/PRIVACY.md`, public at `https://github.com/Barbog/audible-credit-guard/blob/main/audible-credit-guard/store/PRIVACY.md` and entered in the console. |
| Console walkthrough | `store/SUBMISSION.md`. |
| Store icon | `store/icon-128.png` (96 px art on a transparent 128 px canvas). |
| Screenshots | `store/screenshot-1..5.png`, 1280×800, 24-bit PNG. |
| Promo tiles | `store/small-tile-440x280.png`, `store/marquee-1400x560.png`. |
| Promo video | `store/promo-video.mp4` (1280×720, 45 s, H.264) and `.webm`. **Not yet on YouTube.** |
| Store item in the developer console | **Created, filled and submittable, 4 Sept 2026**, via the Playwright route (§3.9). Item ID `jgplmokidgckjicacaojeabbolhodddp`, status Draft, unpublished, package 1.1.1. Every field on the Store listing, Privacy and Distribution tabs is filled except the promo video. **Submit for review is enabled**; nobody has pressed it. See §9. |
| Repo | Renamed to **`Barbog/audible-credit-guard`** and made **public** on 4 Sept 2026 (MIT licence added; GitHub redirects the old `ChromePlugins` name). `main` is the default branch and matches the working branch. The owner's local folder is still named `ChromePlugins`. |

## 2. What could not be done, and why

1. **Creating the item in the Chrome Web Store developer console.** Tried
   twice, and the second attempt shows it cannot be automated this way:
   - The Claude Code web session had no browser connector and the container
     blocked `chrome.google.com` (also `audible.*` and `developer.chrome.com`).
   - A local session on 4 Sept 2026 had the Claude in Chrome extension attached
     to the owner's signed-in Chrome. It navigated to the console and the
     dashboard loaded under the owner's account, but every tool call
     (screenshot, page read, DOM find, JavaScript) failed with Chrome's own
     error "The extensions gallery cannot be scripted". Chrome hard-codes that
     block for every extension on `chrome.google.com/webstore/*`; it is not a
     permission, login or network issue, and the console has no other host.
     Clicking blind was not attempted because the owner's rule is never to
     submit or publish without a go, and blind input could not honour it.
   So no extension-based browser tool can fill the console. The only automated
   routes left are (a) a DevTools-protocol driver (Playwright, already in
   `tools/`) launching a headed Chrome with a *dedicated* profile
   directory that the owner signs into once — Chrome refuses remote debugging
   on the default profile since Chrome 136 — written up as a recipe in §3.9
   with `tools/console.js`, or (b) the Publish API (§3.8), which uploads zips
   but cannot edit listing text or images. Otherwise the console fill is the
   owner's job: ten minutes with `store/SUBMISSION.md` open, every value in
   `store/LISTING.md`.
2. **Hosting the privacy policy publicly.** Requires either making the repo
   public or creating a public gist; both are the owner's call and were not done.
   The console will not show an all-green status card without it: the store's
   user-data policy (checked 4 Sept 2026 at developer.chrome.com/docs/webstore/user_data)
   says products that handle user data must post a privacy policy and lists
   "website content" as user data, which is what this extension declares.
3. **Putting the video on YouTube.** The console accepts only a YouTube URL.
   Needs the owner's YouTube account.
4. **Live verification against a signed-in Audible account.** `audible.*` was
   unreachable from the container, so the fetch/parse path was exercised only
   with captured markup (the UK account page, active and paused, captured
   3 Sept 2026 in the original chat) and with the failure paths. Specifically
   unverified on a real page: the sign-in bounce handling, the on-page pause
   dialog helper, the annual-plan wording, and the wording on the US, CA, AU
   and IN sites (the listing claims support for all five).
5. **The permission prompt in headed Chrome.** `chrome.permissions.request`
   shows a native dialog that headless Playwright cannot click. The code path is
   straightforward and the smoke test covers everything around it, but nobody
   has clicked "Allow" on it yet.

## 3. What I recommend doing, in order

1. **Install the build in your own Chrome and run the setup dry run once.**
   `chrome://extensions` → Developer mode → Load unpacked → `src/`. Pick your
   site, Connect, allow the prompt, confirm the balance and dates match your
   account page, send the test notification. This closes item 2.4 and 2.5 above
   in five minutes. If the page doesn't parse, `parseOverview()` in
   `src/background.js` is the only place to fix, and `test/test.js` has the
   captured markup to extend. The store build has a different extension ID from
   your original unpacked prototype, so they can coexist; remove the prototype
   once you trust this one.
2. **Make the repo public and add a licence.** The listing says "open source"
   and points at GitHub for the source, the support URL and the privacy policy;
   none of that works while the repo is private. MIT is the obvious licence for
   a free tool you want people to use; it is your decision, so no `LICENSE`
   file was added. `main` already exists and matches this branch, so the
   privacy URL in `store/LISTING.md` resolves the moment the repo is public:
   Settings → General → Danger Zone → Change visibility, or
   `gh repo edit Barbog/audible-credit-guard --visibility public --accept-visibility-change-consequences`.
   Optionally make `main` the default branch: `gh repo edit Barbog/audible-credit-guard --default-branch main`.
3. **Upload the video to YouTube** (Unlisted is fine) and keep the URL.
4. **Create the draft in the console** following `store/SUBMISSION.md`. This
   one is yours; no Claude session can do it through a browser extension
   (§2.1). It is about ten minutes: new item, upload the zip, paste the listing, upload the
   nine graphics, paste the YouTube URL, fill the privacy tab (single purpose,
   five permission justifications, "no remote code", tick **Website content**
   only, three certifications, privacy URL), distribution tab (free, public,
   all regions, non-trader). Check the status card is all green and preview the
   listing. That is the draft the original goal asked for.
5. **Submit for review with deferred publishing.** In the submit dialog untick
   "Publish automatically after it has passed review". Review of a first
   submission typically takes a few days. The item then sits as approved and
   unpublished until you press Publish, which is exactly the release button in
   the goal statement. If you would rather test the install flow on a second
   machine first, submit as **Unlisted** instead and flip to Public later; both
   go through the same review.
6. **If a reviewer pushes back**, the likely topic is the five optional host
   permissions. The prepared answer is in `store/LISTING.md` and
   `store/SUBMISSION.md`: none is granted at install, the user picks one site,
   the rest are released. If they still object, ship UK-only: trim `MARKETS` in
   `src/background.js` and `optional_host_permissions` in the manifest, bump the
   version, rebuild, re-upload. The tests cover the multi-market code, so
   trimming is safe.
7. **After it is live:** put the store link in both READMEs, tag the commit
   `v1.1.1`, and watch the console's reviews and the GitHub issues. The parser
   is the fragile part; when Audible changes its markup the extension will say
   so loudly (badge, popup, notification), and users will file issues.
8. **For future uploads from a container without a browser**, the Chrome Web
   Store Publish API can upload a new zip to an existing item and even publish
   it, but it cannot edit the listing text or images. It needs an OAuth client
   and refresh token that only you can create in Google Cloud Console. Worth
   setting up only if you expect frequent updates.
9. **Letting a Claude session fill the console for you (Playwright route).**
   This is the only automated way past the extension block in §2.1. Selenium
   would work on the same principle (chromedriver also drives Chrome from
   outside the extension system), but Playwright is already installed in
   `tools/` with a matching browser, so use that.
   1. Once, on the machine that will run the session: `cd audible-credit-guard/tools`,
      `npm install`, `npx playwright install chromium` (already done on the
      owner's Windows machine, 4 Sept 2026).
   2. Once, as the owner: `node console.js`. It opens the installed Google
      Chrome on a dedicated profile at `%LOCALAPPDATA%\cws-profile` (override
      with `CWS_PROFILE`) and loads the developer console. Sign in to Google
      in that window, confirm the dashboard shows your publisher account, then
      close the window. The sign-in is saved in that profile directory. If
      Google refuses with "this browser or app may not be secure", sign in
      from a plain Chrome window on the same profile instead — the command is
      in the header of `tools/console.js` — close it, and rerun the script.
      `node console.js --check` prints the page title and exits, which is how
      a session confirms the profile is still signed in.
   3. In a Claude Code session on this machine, say so in the prompt (§7 step
      2 already does). The session runs `node console-drive.js` in the
      background from `tools/` and talks to it over `127.0.0.1:9333`
      (`/eval` with a Playwright snippet, `/shot` for a screenshot, `/quit`);
      the header of that file lists the console's quirks that cost time the
      first time (ids regenerate, the remote-code radio defaults to Yes, file
      inputs are positional, the blockers dialog is only on some tabs, the
      ten-minute cap on background tasks). Follow `store/SUBMISSION.md` field
      by field with the values in `store/LISTING.md`, screenshot after each
      Save draft, and stop before **Submit for review**. Playwright screenshots
      work on the console because they come over the DevTools protocol, not
      an extension API. This is how the draft was filled on 4 Sept 2026 (§9).
   4. Keep the profile directory private: it holds a signed-in Google session.
      It is outside the repo. Delete it when the store work is finished.

## 4. Decisions made, and why (so they aren't accidentally reversed)

- **Name: "Credit Guard for Audible"**, not "Audible Credit Guard". The store's
  impersonation and intellectual-property policy treats "<Brand> X" names as
  implying affiliation; "X for <Brand>" is the pattern it accepts for
  compatibility tools. A not-affiliated line is in the popup footer, the setup
  page, the description and the privacy policy. Reverting is one line in the
  manifest plus the copy.
- **Optional host permissions, one marketplace.** The prototype requested all
  five Audible domains at install and declared a manifest content script on all
  five. That is the single most common reason for reviewer pushback and a scary
  install warning. Now: `optional_host_permissions` for the five, setup asks
  which site, Chrome prompts for that origin, the others are released, and the
  pause helper is registered at runtime via `chrome.scripting` for that one
  site's account page. Install-time permissions are only alarms, notifications,
  storage, scripting.
- **One read path.** Every read (manual, scheduled early/late, weekly on hold)
  goes through `attempt()`, so the popup, badge, session state and history can
  no longer disagree. The prototype had two paths and they did.
- **One cycle-naming scheme.** Cycles are named for the accrual they lead up to
  (`2026-10` = 13 Sept to 12 Oct). Months on hold are not counted as missed.
- **Alert budget.** Two per cycle when active (early and last call). On hold,
  once per milestone at 60/30/14/7/3/1 days, not every weekly check. Goodwill
  expiry watch uses the same milestones and now actually runs on the schedule.
- **Data usage declared as "Website content" only.** The extension reads the
  text of the user's account page. Declaring it, certifying the three Limited
  Use statements, and providing a privacy policy is the honest and safe reading;
  declaring "no data" invites a rejection for inconsistency with the
  permissions.
- **Category: Shopping** (Productivity if the console shows the old list).
  Debatable; Workflow & Planning would also fit.
- **Version 1.1.0** for the first store upload, to distinguish it from the 1.0.0
  prototype installed unpacked on the owner's machine. Bumped to **1.1.1** the
  same day when the repo was renamed, because `homepage_url` in the manifest
  changed; the store package was replaced with 1.1.1.
- **Annual plans**: parsed as "N credits a year", cap = 1.5 × N (18 for 12, 36
  for 24), per the owner's notes. Unverified against a real annual account.

## 5. Known gaps and risks

- Marketplaces other than the UK are unverified (see 2.4). Since 1.1.2 the
  listing says so ("verified on audible.co.uk, others best-effort"), and a
  parse failure in setup or the popup offers **Report this on GitHub**: a
  new-issue URL pre-filled by `diagnose()` and `reportUrl()` in
  `background.js` with which markers matched and masked snippets of the page
  wording. The issue lands with the `parse-failure` label;
  `.github/ISSUE_TEMPLATE/parse-failure.md` covers manual reports. The privacy
  policy and listing describe this as the one opt-in exception to "sends
  nothing".
- The "Official URL" field in the console needs a verified domain; GitHub
  cannot be verified. Leave it blank (the docs say so).
- Notification buttons: Chrome allows at most two; every notification here uses
  one. Notification appearance on Windows/macOS was not checked in this
  container.
- The content-script pause helper depends on Audible's `#pauseEligibleLink`
  element. If Audible renames it, the helper shows a banner saying pause isn't
  offered instead of doing nothing; the monthly warning still works.

## 6. Environment notes for a new container

- Node 22 is enough for the tests. `tools/` needs `npm install` (Playwright
  1.56.1 pinned to match the Chromium build under `/opt/pw-browsers` in the
  Claude Code web image; `ffmpeg-static`; Inter font files). The SessionStart
  hook in `.claude/hooks/session-start.sh` does this automatically on the web.
- On the owner's Windows machine: `cd tools && npm install` then
  `npx playwright install chromium` once (Playwright 1.56.1 wants Chromium
  build 1194; the machine had only 1208 from another project). `smoke.js` now
  resolves `playwright` from `tools/node_modules` unless `PLAYWRIGHT_MODULE`
  is set, so it runs unchanged in both places. Done and passing on 4 Sept 2026.
  `npm run lint` fails under cmd.exe on Windows (the script is a bash loop);
  run the same loop from Git Bash, or `bash -c "npm run lint"`.
- `tools/assets.js` and `tools/video.js` render from `file://` pages so that
  the local Inter font loads; don't switch them to `setContent`, fonts silently
  fall back to DejaVu.
- In the web container used so far: `registry.npmjs.org` and `github.com`
  reachable; `chrome.google.com`, `chromewebstore.google.com`, `audible.*`,
  `developer.chrome.com` blocked. Locally everything is reachable, but the
  console still cannot be driven through the Claude in Chrome extension (§2.1).
- The original prototype (source, first store assets) came from chat session
  `cse_01Dz4obyxZWSxpwyyozuvesN` as three zips; everything relevant from them is
  now in this repo, so that chat should not be needed.

## 7. Prompt to continue in a new container

Paste this into a new Claude Code session on this repository, filling in the
two bracketed values if you have them:

```
Repo Barbog/audible-credit-guard, branch claude/chrome-extension-production-pzvr1v
(merge it to main first if you can). Start by reading CLAUDE.md and
audible-credit-guard/HANDOFF.md; they describe the Chrome extension
"Credit Guard for Audible" and exactly where the Chrome Web Store submission
stands.

Goal: get the draft store item created and complete so I can press Publish
myself. NEVER submit for review, publish, or change visibility without my
explicit "go" in this conversation. Creating and filling in the draft is fine.

Facts you need:
- Privacy policy public URL: [PASTE, or "not yet hosted"]
- YouTube URL of store/promo-video.mp4: [PASTE, or "not yet uploaded"]

Do, in order:
1. Verify the build still passes: node test/test.js, then cd tools && node
   smoke.js. If you change anything in src/, bump the manifest version and
   rebuild with tools/build.sh, and regenerate assets with tools/assets.js if
   the popup or setup page changed.
2. Do NOT try to drive https://chrome.google.com/webstore/devconsole through
   the Claude in Chrome extension: Chrome blocks all extensions there
   (HANDOFF.md §2.1, verified 4 Sept 2026). Use the Playwright route in
   HANDOFF.md §3.9 instead: run `node tools/console.js --check` to confirm the
   dedicated profile is signed in [I have / have not signed in yet], then
   drive the console with Playwright on that profile, create the item exactly
   as store/SUBMISSION.md and store/LISTING.md describe, screenshot each tab,
   and stop before "Submit for review" and tell me what the status card shows.
3. Otherwise do not try to log in to Google or guess: say so, do everything
   else you can (check the privacy URL is public, proof-read the listing
   against the current console field limits, update HANDOFF.md), and give me
   the exact remaining steps. The item already exists (HANDOFF.md §9); open
   it rather than creating a second one, and re-check "Why can't I submit?".
4. Finish with: what changed, what you verified, what is still mine to do.
```

## 8. Session log — 4 September 2026, local Windows session

- Verified: `node test/test.js` (148 checks) and `tools/smoke.js` both pass on
  the owner's machine after `npm install` and `npx playwright install chromium`.
- Verified against the live docs: manifest description limit is 132 characters
  (ours is 106); the listing docs publish no limit for the detailed description
  or the privacy-tab fields (ours: description 2,361, single purpose 214,
  justifications 276–591 characters); privacy policy is required because
  website content is user data. Graphics re-checked from the PNG headers:
  icon 128×128 RGBA, five screenshots 1280×800 RGB, tiles 440×280 and
  1400×560 RGB, all 8-bit.
- Changed: `tools/smoke.js` resolves Playwright from `tools/node_modules`;
  listing copy now says "website link" instead of "official URL" (the Official
  URL field is left blank, the Homepage URL is what the store shows); the
  16,000-character claim was replaced with the measured length; SUBMISSION.md
  and this file record that the console cannot be automated via an extension.
- Created `main` from this branch. Did not change the default branch, repo
  visibility, or anything on the store.
- Later the same day, with the owner signed in on the dedicated profile: the
  console draft was created and filled end to end (§9). Then the repo was
  renamed to `audible-credit-guard`, given an MIT licence and made public,
  the manifest bumped to 1.1.1 and the package replaced, the three console
  URLs updated, and the owner verified the contact email. Submit for review is
  enabled. Not done, owner only: upload the video to YouTube and paste its
  URL (optional), then submit with deferred publishing.

## 9. Console draft — what is in it, and what cleared the blockers (4 Sept 2026)

Filled through Playwright on the dedicated profile (§3.9) in about fifteen
minutes. Nothing was submitted; the item is a Draft and the Submit for review
button was never pressed.

| Tab | State |
|---|---|
| Package | `credit-guard-for-audible-1.1.1.zip` (replaced 1.1.0 after the repo rename changed `homepage_url`). The Package tab shows version 1.1.1, item type Extension, permissions `alarms, storage, notifications, scripting` (the optional host permissions are not listed there). "Verified CRX uploads" was left at its default (not opted in). |
| Store listing | Description (2,361 chars), category Shopping, language English (United Kingdom), icon, five screenshots, small and marquee tiles, homepage `https://github.com/Barbog/audible-credit-guard` and support `…/issues`, mature content off, Official URL None. **Promo video empty** (needs the YouTube URL). |
| Privacy | Single purpose, four permission justifications (alarms, storage, notifications, scripting; the console asks nothing for optional host permissions), remote code **No** (the console defaults to Yes, watch for that on future versions), data usage Website content only, all three certifications ticked, privacy policy URL entered (the `main` GitHub URL). |
| Distribution | Free of charge, Public, all regions, no Google Group. These were the defaults. |
| Settings (publisher) | Trader declaration non-trader. Contact email added and **verified** by the owner later the same day; publisher display name set to "Unkind Studios" by the owner. Postal address not entered (never in the blocker list). |

Earlier that day the console's "Why can't I submit?" dialog listed five blockers:

1. Homepage URL is not reachable.
2. Support URL is not reachable.
3. "Privacy policy link is not reachable." (Re-read after the URL was
   entered and saved; the console sees the link, it just gets a 404 while the
   repo is private.)
4. A publisher contact email must be provided on the Settings page.
5. That contact email must be verified.

Items 1–3 cleared when the repository was renamed to `audible-credit-guard`
and made public (all three URLs return 200); items 4–5 cleared when the owner
added and verified the contact email. After that the "Why can't I submit?"
button disappeared and **Submit for review** became enabled (checked at the
end of the session, still unpressed). The only gap left is the promo video,
which is optional.

Also noted on the dashboard: a banner "We're updating publisher extension
limits" and a counter that read 0/2 before this item was created, so this
publisher account can hold at most two extensions until Google raises it.
The **Submit for review** button stayed greyed out throughout, so nothing
could have been submitted by accident.
