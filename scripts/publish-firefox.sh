#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")

echo "Publishing version $VERSION to AMO..."

pnpm release:firefox

gh release create "v${VERSION}" \
  --repo "${GITHUB_REPOSITORY}" \
  --title "v${VERSION}" \
  --notes-from-tag \
  artifacts/*.xpi
