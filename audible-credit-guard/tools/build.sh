#!/usr/bin/env bash
# Runs the tests, then packs src/ into dist/credit-guard-for-audible-<version>.zip
# with manifest.json at the zip root, which is what the Chrome Web Store expects.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./src/manifest.json').version")
OUT="dist/credit-guard-for-audible-$VERSION.zip"

node test/test.js >/dev/null || { echo "tests failed; not packaging"; node test/test.js | grep -E 'FAIL|got|want'; exit 1; }
mkdir -p dist
rm -f "$OUT"
if command -v zip >/dev/null 2>&1; then
  ( cd src && zip -r -X -q "../$OUT" . -x '.DS_Store' -x '*/.DS_Store' -x '__MACOSX/*' )
else
  # Git Bash on Windows has no zip and its GNU tar cannot write one. Windows
  # ships bsdtar as System32	ar.exe, which writes a real zip when the output
  # name ends in .zip. The glob keeps manifest.json at the zip root.
  BSDTAR="$(cygpath -u "$SYSTEMROOT" 2>/dev/null)/System32/tar.exe"
  [ -x "$BSDTAR" ] || { echo "no zip tool found (need zip or Windows tar.exe)"; exit 1; }
  ( cd src && "$BSDTAR" -a -cf "../$OUT" --exclude=.DS_Store * )
fi
echo "built $OUT"
unzip -l "$OUT"
