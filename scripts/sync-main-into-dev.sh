#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY}"

MAIN_SHA=$(gh api "repos/$REPO/git/refs/heads/main" --jq .object.sha)
DEV_SHA=$(gh api "repos/$REPO/git/refs/heads/dev" --jq .object.sha)

if [ "$MAIN_SHA" = "$DEV_SHA" ]; then
  echo "main and dev are already in sync — nothing to do."
  exit 0
fi

gh api "repos/$REPO/git/refs/heads/sync/main-into-dev" --silent &&
  gh api -X DELETE "repos/$REPO/git/refs/heads/sync/main-into-dev" || true

gh api "repos/$REPO/git/refs" \
  -f ref="refs/heads/sync/main-into-dev" \
  -f sha="$MAIN_SHA"

gh pr create --repo "$REPO" \
  --base dev --head sync/main-into-dev \
  --title "Sync main into dev" \
  --body "Automated — merges automatically once required checks pass." ||
  echo "PR may already exist — continuing"

gh pr merge --repo "$REPO" sync/main-into-dev --merge \
  --subject "chore: sync main into dev" \
  --auto
