#!/usr/bin/env bash
set -euo pipefail

HEAD_BRANCH="$1"
BASE_BRANCH="$2"
TITLE="$3"
MERGE_SUBJECT="$4"
REPO="${GITHUB_REPOSITORY}"

PR_URL=$(gh pr create --repo "$REPO" \
  --base "$BASE_BRANCH" --head "$HEAD_BRANCH" \
  --title "$TITLE" \
  --body "Automated — merges automatically once required checks pass." 2>&1) ||
  PR_URL=$(gh pr view --repo "$REPO" "$HEAD_BRANCH" --json url --jq .url)

echo "PR: $PR_URL"

MERGEABLE=$(gh pr view --repo "$REPO" "$HEAD_BRANCH" --json mergeable --jq .mergeable)

if [ "$MERGEABLE" = "CONFLICTING" ]; then
  echo "::error::Merge conflict between $HEAD_BRANCH and $BASE_BRANCH — cannot auto-resolve, needs manual review."
  echo "Resolve manually: $PR_URL"
  exit 1
fi

gh pr merge --repo "$REPO" "$HEAD_BRANCH" --merge \
  --subject "$MERGE_SUBJECT" \
  --auto

for i in $(seq 1 10); do
  STATE=$(gh pr view --repo "$REPO" "$HEAD_BRANCH" --json state --jq .state 2>/dev/null || echo "MERGED")

  if [ "$STATE" = "MERGED" ]; then
    echo "Merged successfully into $BASE_BRANCH."
    exit 0
  fi

  CHECKS_STATE=$(gh pr checks --repo "$REPO" "$HEAD_BRANCH" --json state --jq '[.[].state] | if any(. == "FAILURE") then "FAILED" else "PENDING" end' 2>/dev/null || echo "PENDING")

  if [ "$CHECKS_STATE" = "FAILED" ]; then
    echo "::error::CI failed on the PR — a real issue was introduced, needs manual review."
    echo "Review here: $PR_URL"
    exit 1
  fi

  sleep 30
done

echo "::error::PR did not merge within the expected time — needs manual review."
echo "Review here: $PR_URL"
exit 1
