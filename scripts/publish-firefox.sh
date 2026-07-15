#!/usr/bin/env bash
set -euo pipefail

if [ -n "${RELEASE_VERSION:-}" ]; then
  VERSION="$RELEASE_VERSION"
else
  VERSION=$(node -p "require('./package.json').version")
fi

echo "Publishing version $VERSION to AMO..."

pnpm release:firefox

gh release create "v${VERSION}" \
  --repo "${GITHUB_REPOSITORY}" \
  --title "v${VERSION}" \
  --notes-from-tag \
  artifacts/*.xpi
