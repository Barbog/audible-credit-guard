# Credit Guard for Audible

A Chrome extension that warns you before Audible credits overflow your plan's
cap and are lost, so you can spend or pause in time.

Audible caps how many credits you can hold (6 on a one-credit-a-month plan,
12 on two-a-month). On the day the next credit lands, anything above the cap is
forfeited, and Audible does not warn you. This extension reads your own account
page once per accrual cycle, using the Audible session already in your
browser, and sends at most two desktop notifications a month: one early, one
last call. While your membership is on hold it tracks the spend-down instead.

- No account, no password, no server. Everything stays in your browser.
- No site access at install. Setup asks which Audible site you use and Chrome
  prompts for that one site only.
- Supported: audible.co.uk, audible.com, audible.ca, audible.com.au,
  audible.in (English account pages).

Chrome Web Store listing: coming soon. Until then, load `audible-credit-guard/src/`
unpacked from `chrome://extensions` with Developer mode on.

## Layout

```
audible-credit-guard/
  src/       the extension (manifest, service worker, setup and popup pages)
  test/      node test/test.js — 148 unit checks, no dependencies
  tools/     smoke test, store-asset and promo-video renderers, build script
  store/     listing copy, privacy policy, icon, screenshots, tiles, video
  dist/      the zip uploaded to the Chrome Web Store
  HANDOFF.md status of the store submission and how to pick the work up
```

## Privacy

The extension reads the text of your own Audible account page and keeps what
it learns in `chrome.storage.local`. Nothing is transmitted anywhere. The full
policy is in [`audible-credit-guard/store/PRIVACY.md`](audible-credit-guard/store/PRIVACY.md).

## Issues and contributions

Bug reports and pull requests are welcome on this repository. If Audible
changes its account page and the extension stops parsing it, the popup and
badge will say so loudly; please open an issue with your Audible site and
plan type.

## Licence

MIT. See [`LICENSE`](LICENSE).

Credit Guard for Audible is an independent project and is not affiliated with,
endorsed by or connected to Audible, Inc. or Amazon.com, Inc. Audible is a
trademark of Audible, Inc.
