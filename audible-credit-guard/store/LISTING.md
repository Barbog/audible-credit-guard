# Chrome Web Store listing — Credit Guard for Audible

Every field the developer console asks for, in the order the console shows
them. Copy and paste. Character limits are the console's.

---

## Store listing tab

### Product details

**Title** — taken from `manifest.json`, not editable in the console:

```
Credit Guard for Audible
```

**Summary** — taken from the manifest `description` (106 of 132 characters):

```
Warns you before Audible credits overflow your plan's cap and are lost, so you can spend or pause in time.
```

**Description** (detailed description; the console counter shows a 16,000 character limit — this text is 2,361 characters):

```
Audible caps how many credits you can hold: 6 on a one-credit-a-month plan, 12 on a two-a-month plan. On the day your next credit lands, anything above that cap is forfeited — and Audible neither warns you beforehand nor tells you afterwards. If you have been letting credits pile up, you may already be losing one every month.

Credit Guard for Audible watches for exactly that moment.

WHAT IT DOES

• Reads your credit balance, plan, cap and next-credit date from your own Audible account page, using the session already in your browser.
• Warns you once, early enough to do something about it, and once more shortly before the credit lands if you still haven't.
• Offers a shortcut into Audible's own pause dialog, so you can stop accrual instead of losing credits. You confirm inside Audible; the extension never does it for you.
• While your membership is on hold, tracks how many credits you still need to spend and by when.

AT MOST TWO NOTIFICATIONS A MONTH

One early alert with weeks of runway, one last-call reminder before the date. In a month where nothing is at risk it says nothing at all.

IT TELLS YOU WHEN IT CAN'T SEE YOUR ACCOUNT

Audible sessions expire, especially if you rarely sign in — which is exactly the situation this extension is built for. If it can't read your account it asks you to sign in, days ahead of the date rather than after it. The toolbar badge stays marked and the popup shows the last balance it knew and when it read it. A monitor that fails silently is worse than no monitor, so this one is deliberately loud.

NO ACCOUNT, NO PASSWORD, NO SERVER

It has no login of its own and never asks for your Audible or Amazon password. During setup you pick your Audible site and Chrome asks you to allow access to that one site only. Everything it reads and records stays in your browser. There is no server, no analytics and no third party.

SUPPORTED SITES

audible.co.uk, audible.com, audible.ca, audible.com.au and audible.in. Other Audible sites print their account pages in other languages and are not supported yet.

OPEN SOURCE

The full source is on GitHub (see the website link on this page). Issues and pull requests are welcome.

Credit Guard for Audible is an independent project and is not affiliated with, endorsed by or connected to Audible, Inc. or Amazon.com, Inc. Audible is a trademark of Audible, Inc.
```

**Category:** Shopping. (If the console still shows the older list, choose Productivity.)

**Language:** English (United Kingdom)

### Graphic assets

All files are in this folder. Upload in this order.

| Console field | File | Size | Notes |
|---|---|---|---|
| Store icon | `icon-128.png` | 128×128 PNG | 96px artwork on a transparent 128px canvas, per the store's guidance |
| Screenshot 1 | `screenshot-1.png` | 1280×800 | Hero: at-cap popup and the alert it sends |
| Screenshot 2 | `screenshot-2.png` | 1280×800 | The monthly schedule |
| Screenshot 3 | `screenshot-3.png` | 1280×800 | On hold: spend-down tracking |
| Screenshot 4 | `screenshot-4.png` | 1280×800 | Setup reads the account page; one-site permission |
| Screenshot 5 | `screenshot-5.png` | 1280×800 | Signed-out state is loud |
| Small promo tile | `small-tile-440x280.png` | 440×280 | |
| Marquee promo tile | `marquee-1400x560.png` | 1400×560 | |
| Promo video | `promo-video.mp4` | 1280×720, 45 s | The console takes a **YouTube URL**. Upload the file to YouTube first (Unlisted is fine), then paste the link. `promo-video.webm` is the same video for anyone who prefers it. |

Screenshots and tiles are 24-bit PNG with no alpha channel, which is what the
console requires. (The icon is allowed, and encouraged, to have transparency.)

### Additional fields

**Official URL:** `https://github.com/Barbog/audible-credit-guard` — only accepted once
that domain is verified in the console's Account tab, and GitHub can't be
verified. Left as **None**; the description already points at GitHub. The
dropdown does offer `barbon.ca` (already verified for this publisher), which
could be selected later if that site ever hosts a page about the extension.

**Homepage URL:** `https://github.com/Barbog/audible-credit-guard`

**Support URL:** `https://github.com/Barbog/audible-credit-guard/issues`

**Mature content:** No

---

## Privacy tab

### Single purpose

```
Warn the signed-in user before their Audible credits exceed their plan's rollover cap and are forfeited, by reading their own Audible account page on a monthly schedule and notifying them in time to spend or pause.
```

### Permission justifications

**alarms**
```
Wakes the service worker on a six-hourly local timer that compares today's date with the user's credit-accrual date and decides whether the once-per-cycle check is due. No other Manifest V3 mechanism survives service-worker eviction. The timer itself makes no network request.
```

**notifications**
```
The extension's entire output is a desktop notification warning the user that credits are about to be forfeited (or that it can no longer read their account). By definition the user is not looking at Audible at that moment, so there is no other way to deliver the warning. At most two are sent per month.
```

**storage**
```
Keeps the user's settings (chosen Audible site, plan cap, timing tweaks) and the extension's own state: the last balance read, which checks have already run this cycle, and a short history of past readings used to detect that scheduled checks have stopped running. chrome.storage.local only; nothing is synced or transmitted.
```

**scripting**
```
Used to register a single content script at runtime (chrome.scripting.registerContentScripts) for the account overview page of the one Audible site the user chose during setup. That script runs only on that page and does one thing: when the user has clicked through from a notification, it opens Audible's own pause dialog or highlights the resume control. It never submits anything. Registering at runtime rather than in the manifest keeps the extension from touching any Audible site the user doesn't use.
```

**Host permissions** (`https://www.audible.co.uk/*`, `https://www.audible.com/*`, `https://www.audible.ca/*`, `https://www.audible.com.au/*`, `https://www.audible.in/*`)

The console did not ask for this one (4 Sept 2026): optional host permissions
get no justification field, only `alarms`, `storage`, `notifications` and
`scripting` do. Keep the text for a reviewer question.
```
All five Audible domains are declared as OPTIONAL host permissions; none is granted at install. During setup the user picks their Audible marketplace and Chrome prompts for that one origin only; any other grant is released. The permission is needed to fetch the signed-in user's own account overview page and read their credit balance, plan, next-credit date and hold status — data that exists nowhere else and for which Audible provides no API. The fetch happens on a monthly schedule tied to the accrual date (weekly while the membership is paused), plus when the user presses "Check now".
```

**Are you using remote code?** No, I am not using remote code.

### Data usage

Tick **Website content** only (the extension reads the text of the user's own
Audible account page). Leave every other category unticked.

Then certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases — **tick**
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose — **tick**
- I do not use or transfer user data to determine creditworthiness or for lending purposes — **tick**

**Privacy policy URL:**
`https://github.com/Barbog/audible-credit-guard/blob/main/audible-credit-guard/store/PRIVACY.md`
— entered in the console on 4 Sept 2026. It returns 404 until the repository
is public, and the console's submit check flags it (and the homepage and
support URLs) as "not reachable" until then. Once the repo is public the
URL is
`https://github.com/Barbog/audible-credit-guard/blob/main/audible-credit-guard/store/PRIVACY.md`
(`main` exists since 4 September 2026). Once the repo is public the
URL is
`https://github.com/Barbog/audible-credit-guard/blob/main/audible-credit-guard/store/PRIVACY.md`
(`main` exists since 4 September 2026).

---

## Distribution tab

- **Payments:** Free of charge
- **Visibility:** Public (this only takes effect when you publish; a draft is invisible regardless)
- **Distribution regions:** All regions
- **Trader / non-trader declaration (EU DSA):** Non-trader — a free, personal, non-commercial project
