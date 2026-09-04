#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs the dev tooling for audible-credit-guard/tools (Playwright, ffmpeg-static,
# Inter font) so the smoke test, asset and video generators work in a fresh container.
# The unit tests (node test/test.js) need nothing beyond Node and always work.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

TOOLS="$CLAUDE_PROJECT_DIR/audible-credit-guard/tools"
cd "$TOOLS"

# The web environment ships Chromium for Playwright under /opt/pw-browsers; don't
# re-download it. Elsewhere, let Playwright fetch its own browser.
if [ -d /opt/pw-browsers ]; then
  export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
  export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  echo "export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers" >> "${CLAUDE_ENV_FILE:-/dev/null}"
fi

npm install --no-audit --no-fund

if [ -z "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" ]; then
  npx playwright install chromium || echo "warning: could not install Chromium; smoke/assets/video need it, tests do not"
fi

echo "credit-guard tooling ready: node $(node --version), playwright $(node -p "require('playwright/package.json').version")"
