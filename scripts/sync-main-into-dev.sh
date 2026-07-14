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

PR_URL=$(gh pr create --repo "$REPO" \
  --base dev --head sync/main-into-dev \
  --title "Sync main into dev" \
  --body "Automated — merges automatically once required checks pass." 2>&1) ||
  PR_URL=$(gh pr view --repo "$REPO" sync/main-into-dev --json url --jq .url)

echo "Sync PR: $PR_URL"

# Un vrai conflit de fusion empêche même l'auto-merge d'être activé —
# on le détecte tout de suite plutôt que d'attendre inutilement.
MERGEABLE=$(gh pr view --repo "$REPO" sync/main-into-dev --json mergeable --jq .mergeable)

if [ "$MERGEABLE" = "CONFLICTING" ]; then
  echo "::error::Merge conflict between main and dev — cannot auto-resolve, needs manual review."
  echo "Resolve manually: $PR_URL"
  exit 1
fi

gh pr merge --repo "$REPO" sync/main-into-dev --merge \
  --subject "chore: sync main into dev" \
  --auto

# Attend que l'auto-merge se termine (ou échoue) plutôt que de sortir
# aveuglément — 10 tentatives, 30s d'intervalle, 5 min max.
for i in $(seq 1 10); do
  STATE=$(gh pr view --repo "$REPO" sync/main-into-dev --json state --jq .state 2>/dev/null || echo "MERGED")

  if [ "$STATE" = "MERGED" ]; then
    echo "Sync merged successfully into dev."
    exit 0
  fi

  CHECKS_STATE=$(gh pr checks --repo "$REPO" sync/main-into-dev --json state --jq '[.[].state] | if any(. == "FAILURE") then "FAILED" else "PENDING" end' 2>/dev/null || echo "PENDING")

  if [ "$CHECKS_STATE" = "FAILED" ]; then
    echo "::error::CI failed on sync PR — a real issue was introduced, needs manual review."
    echo "Review here: $PR_URL"
    exit 1
  fi

  sleep 30
done

echo "::error::Sync PR did not merge within the expected time — needs manual review."
echo "Review here: $PR_URL"
exit 1
