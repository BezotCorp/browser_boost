#!/usr/bin/env bash
set -euo pipefail

echo "Recording HEAD before semantic-release..."
BEFORE_SHA=$(git rev-parse HEAD)

npx semantic-release

AFTER_SHA=$(git rev-parse HEAD)

if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
  echo "::error::semantic-release found nothing to release (chore-only commits) — no version bump needed."
  exit 1
fi

NEW_VERSION=$(node -p "require('./package.json').version")
echo "::notice::Version bump confirmed — new version is $NEW_VERSION"
echo "Version bump confirmed — HEAD moved from $BEFORE_SHA to $AFTER_SHA, version $NEW_VERSION."
