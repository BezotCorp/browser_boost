#!/usr/bin/env bash
set -euo pipefail

BRANCH_NAME="$1"
SOURCE_BRANCH="$2"
REPO="${GITHUB_REPOSITORY}"

gh api "repos/$REPO/git/refs/heads/$BRANCH_NAME" --silent &&
  gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH_NAME" || true

SOURCE_SHA=$(gh api "repos/$REPO/git/refs/heads/$SOURCE_BRANCH" --jq .object.sha)

gh api "repos/$REPO/git/refs" \
  -f ref="refs/heads/$BRANCH_NAME" \
  -f sha="$SOURCE_SHA"

echo "Branch $BRANCH_NAME created from $SOURCE_BRANCH (sha: $SOURCE_SHA)"
