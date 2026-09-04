# Privacy Policy — Credit Guard for Audible

_Last updated: 4 September 2026_

## Short version

Credit Guard for Audible collects nothing, transmits nothing, and has no
server. Everything it reads stays in your browser on your computer.

## What it accesses

During setup you choose which Audible site your membership is on
(audible.co.uk, audible.com, audible.ca, audible.com.au or audible.in), and
Chrome asks you to allow the extension to access that one site. No site access
is granted at install and no other site is ever requested.

On a schedule tied to your own credit date — once a month, or weekly while
your membership is paused, plus whenever you press "Check now" — the extension
requests your Audible account overview page, the same page your browser loads
when you visit it yourself, using the Audible session already present in your
browser. From that page it reads:

- your credit balance
- your membership plan and how many credits it grants
- the date your next credit arrives
- whether your membership is on hold, and until when

It reads nothing else from that page and visits no other page.

## What it stores

The values above, your own settings, and a short history of past readings are
stored with Chrome's `storage.local` API. That data lives in your Chrome
profile on your computer. It is not synced by the extension and is not sent
anywhere.

## What it sends

Nothing on its own. There is no server, no analytics, no telemetry, no crash
reporting and no third-party service of any kind. The only network request the
extension ever makes is to the Audible site you chose, for your own account
page.

The one exception is something you start yourself. If the account page loads
but the extension can't read it, it offers a **Report this on GitHub** button.
Pressing it opens a new-issue page on GitHub in a tab, pre-filled with a
summary the extension generated on your computer: which pieces of the page it
could and couldn't find, a few short phrases from the page around the words
"credit", "membership" and "bill" with every digit replaced by #, and the
extension, Chrome and operating-system versions. E-mail addresses are removed.
You can read and edit all of it on GitHub before pressing Submit there, and
nothing is sent anywhere unless you do. Anything you submit is a public GitHub
issue governed by GitHub's own privacy policy.

## Credentials

The extension never asks for, receives, reads or stores your Audible or Amazon
password or cookies. It has no account system. It relies entirely on the
session your browser already has, which the browser attaches to the request
itself.

## What it changes on your account

Nothing on its own. When you click through from a notification it can open
Audible's own pause dialog or highlight the resume control on the account
page. Confirming is always your click, inside Audible's own interface.

## Removing your data

Uninstalling the extension deletes everything it stored. There is nothing held
anywhere else to delete.

## Contact

Open an issue at https://github.com/Barbog/audible-credit-guard/issues.

## Not affiliated

Credit Guard for Audible is an independent project and is not affiliated with,
endorsed by or connected to Audible, Inc. or Amazon.com, Inc. Audible is a
trademark of Audible, Inc.
