# Creating the store item — step by step

Ten minutes in the developer console. Nothing here publishes anything: the
item stays a draft until you press **Submit for review**, and even then you
can keep it from going live automatically (step 9).

Console: https://chrome.google.com/webstore/devconsole

This is a human job. Chrome blocks every extension, including browser-
automation extensions such as Claude in Chrome, from reading or scripting
anything under `chrome.google.com/webstore/*` ("The extensions gallery
cannot be scripted"), so a Claude session cannot fill the console for you
through that route; see HANDOFF.md §2.1.

## Before you start — two things only you can do

1. **Host the privacy policy at a public URL.** The console requires one once
   "Website content" is declared under data usage (which it must be — the
   extension reads your account page). `PRIVACY.md` is ready; it just needs to
   be reachable without signing in. Pick one:
   - Make the `Barbog/audible-credit-guard` repository public (Settings → General →
     Danger Zone → Change visibility). The URL is then
     `https://github.com/Barbog/audible-credit-guard/blob/main/audible-credit-guard/store/PRIVACY.md`
     (`main` exists since 4 September 2026 and carries this branch).
   - Or paste `PRIVACY.md` into a public GitHub Gist and use the gist's URL.
2. **Put the promo video on YouTube.** The console only accepts a YouTube
   link. Upload `promo-video.mp4` (Unlisted is fine), copy the watch URL.

## In the console

_Done on 4 Sept 2026 through the Playwright route (HANDOFF.md §3.9): item
`jgplmokidgckjicacaojeabbolhodddp` exists as a Draft with every step below
completed except the promo video URL, and Submit for review is enabled. Steps
1–5 are kept for future versions; what is left today is the video (optional)
and step 9._

1. **Items → New item.** Upload `../dist/credit-guard-for-audible-1.1.3.zip`
   as-is; don't unzip it. The console reads the name, summary, version and
   permissions from the manifest inside.
2. **Store listing tab.** Paste the description from `LISTING.md`, choose the
   category and language, and upload the graphics in the table in
   `LISTING.md` (icon, five screenshots, small tile, marquee). Paste the
   YouTube URL under Promo video. Fill the homepage and support URLs.
   Save draft.
3. **Privacy tab.** Paste the single purpose, then a justification for each
   permission the console lists (alarms, storage, notifications, scripting;
   it does not ask about the optional host permissions). All of them are in
   `LISTING.md`. Answer "No" to remote code — the console pre-selects
   "Yes", so check it. Under data usage tick **Website content** only, then
   tick the three certifications. Paste the privacy policy URL. Save draft.
4. **Distribution tab.** Free; Public; all regions; Non-trader. Save draft.
5. **Settings page** (once per publisher account): **Add email** under
   Profile, then click the verification link Google sends. Required before
   anything can be submitted; done and verified on 4 Sept 2026. The trader
   declaration there is set to non-trader.
6. Look at the item's **Status** card. Every section should show a green tick.
   Anything amber is a field the console wants; it names it.
7. **Preview** the listing (top right) and check it against the screenshots.
8. That is the draft. Stop here if you only want to review it.
9. When you do want it reviewed: press **Submit for review**. In the dialog,
   **untick "Publish automatically after it has passed review"** if you want
   the final say — the item then sits as "approved, unpublished" until you
   press Publish. Review usually takes a few days for a first submission.

## What review is likely to look at, and why this build should pass

- **Permissions.** Nothing broad is requested at install: only alarms,
  notifications, storage and scripting. Every Audible domain is an *optional*
  host permission granted by the user for one site during setup, with the
  others released. The justifications in `LISTING.md` say exactly this, and it
  matches what a reviewer sees when they install it.
- **Name.** "Credit Guard for Audible" uses the "for <brand>" pattern the
  store's impersonation policy allows for compatibility tools, and the
  description carries a not-affiliated statement. The icon is original
  artwork.
- **Single purpose.** One job, stated the same way in the manifest summary,
  the description, the single-purpose field and the privacy policy.
- **No remote code, no obfuscation.** Plain readable JavaScript; nothing is
  fetched and executed.
- **Data handling.** Website content declared, privacy policy provided,
  nothing transmitted.

If a reviewer does push back on the five optional host permissions, the
fallback is to ship UK-only and add the other marketplaces in a later
version; `MARKETS` in `background.js` and `optional_host_permissions` in the
manifest are the only two places to trim.

## Before every future upload

- Bump `version` in `src/manifest.json`. The store rejects a re-upload at the
  same version.
- `tools/build.sh` — runs the tests and builds `dist/…zip`. Refuses to package
  if a test fails.
- `node tools/smoke.js` — loads the build in headless Chromium and exercises
  install, setup, popup and messaging.
- Regenerate the screenshots with `node tools/assets.js` if the popup changed.
