// Opens the Chrome Web Store developer console in a headed Chrome driven by
// Playwright, on a dedicated profile directory that is NOT your everyday
// Chrome profile.
//
// Why this exists: Chrome refuses every extension (including the Claude in
// Chrome browser tool) on chrome.google.com/webstore/*, so the console cannot
// be automated through an extension. Playwright talks to Chrome over the
// DevTools protocol instead, which is not subject to that block. Chrome 136+
// refuses remote debugging on the default profile, hence the separate one.
//
// Usage (from audible-credit-guard/tools, after `npm install`):
//   node console.js            open the console, keep the window until you close it
//   node console.js --check    open, print the page title, close (non-interactive)
//
// First run: sign in to Google in the window that opens. The sign-in sticks to
// the profile directory, so later runs (and a Claude session using the same
// directory) are already signed in. If Google refuses to sign in with
// "this browser or app may not be secure", sign in once from a plain Chrome
// window on the same profile instead:
//   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:LOCALAPPDATA\cws-profile"
// then close it and run this script again.
//
// Profile directory: %LOCALAPPDATA%\cws-profile (override with CWS_PROFILE).
const path = require("path");
const os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const CONSOLE_URL = "https://chrome.google.com/webstore/devconsole";
const profile = process.env.CWS_PROFILE ||
  path.join(process.env.LOCALAPPDATA || os.homedir(), "cws-profile");
const check = process.argv.includes("--check");

(async () => {
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chrome",            // the installed Google Chrome, not Playwright's Chromium
    headless: false,
    viewport: null,               // use the window size
    args: ["--start-maximized"]
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(CONSOLE_URL, { waitUntil: "domcontentloaded" });
  console.log("profile:", profile);
  console.log("url:    ", page.url());
  console.log("title:  ", await page.title());
  if (check) {
    await ctx.close();
    return;
  }
  console.log("Window is open. Sign in if asked. Close the window to exit.");
  await new Promise(resolve => ctx.on("close", resolve));
})().catch(e => { console.error(e.message); process.exit(1); });
