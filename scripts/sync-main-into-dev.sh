#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY}"

MAIN_SHA=$(gh api "repos/$REPO/git/refs/heads/main" --jq .object.sha)
DEV_SHA=$(gh api "repos/$REPO/git/refs/heads/dev" --jq .object.sha)

if [ "$MAIN_SHA" = "$DEV_SHA" ]; then
  echo "main and dev are already in sync — nothing to do."
  exit 0
fi

./scripts/create-branch.sh sync/main-into-dev main

./scripts/open-and-wait-pr-merge.sh \
  sync/main-into-dev dev \
  "Sync main into dev" \
  "chore: sync main into dev"
