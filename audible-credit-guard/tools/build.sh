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
( cd src && zip -r -X -q "../$OUT" . -x '.DS_Store' -x '*/.DS_Store' -x '__MACOSX/*' )
echo "built $OUT"
unzip -l "$OUT"
