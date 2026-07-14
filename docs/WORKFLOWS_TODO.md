# TODO — Refonte du pipeline de release (jamais commencée, à faire)

Ce document fige un plan discuté et validé en détail, pour ne pas avoir à le
reconstruire de zéro la prochaine fois. Rien de ce qui suit n'est encore codé.

## Le problème qui motive cette refonte

`semantic-release` n'est PAS transactionnel (confirmé par les mainteneurs
eux-mêmes sur une discussion GitHub officielle : "no rollback. semantic-release
tags before publish and won't delete the tag or GH release on failure").

Aujourd'hui, `release-version.yml` fait tourner `semantic-release` directement
sur `main`, avec un `git commit` + `git push` réel dessus. Deux vrais risques :

1. Un `git commit` peut réussir **localement** sur le runner sans que le
   `git push` derrière n'atteigne jamais `main` (réseau, permission). Notre
   détection actuelle (comparer `git rev-parse HEAD` avant/après, sur le même
   checkout) ne verrait pas la différence — elle donnerait un faux positif
   ("un bump a eu lieu") alors que `main` n'a en réalité jamais bougé.
2. Aucun moyen simple de revenir en arrière si quelque chose se passe mal
   pendant que `semantic-release` écrit directement sur `main` — contrairement
   à toutes nos autres branches de travail, jamais protégées par une vraie PR
   avec CI avant d'y toucher.

Le principe retenu : jamais toucher `main` en direct pour le bump de version,
exactement la même discipline qu'on applique déjà à tout le reste du repo.
Le "tout ou rien" doit être garanti par un vrai merge de PR (protégé, testé),
pas par une simple comparaison de SHA après coup.

## Séquence validée (dans cet ordre, pas d'autre)

1. `CI` réussit sur `main` (push) — inchangé.
2. `Release Version` se déclenche (`workflow_run` sur `CI`, `main`) :
   - crée/recrée une branche jetable (nom à trancher : `release/pending` ou
     équivalent stable, pas besoin de connaître la version à l'avance
     puisque `semantic-release` la calcule après coup)
   - lance `semantic-release` (config bump-only) sur cette branche, jamais
     sur `main` directement
   - ouvre une PR de cette branche vers `main`, avec auto-merge activé
   - attend l'issue du merge (même pattern que `sync-main-into-dev.sh` :
     boucle avec timeout, distingue conflit / CI cassée / timeout)
3. Une fois la PR mergée pour de vrai → `main` a bougé, garanti tout-ou-rien.
4. `Release Prepublish Check` se déclenche sur ce merge réel — fait son
   analyse, peut lui-même modifier `main` si besoin (ex: relancer un scan).
5. `Prepare sync main into dev` se déclenche **après** `Release Prepublish
   Check` (pas avant, pas en parallèle) — précisément parce que Prepublish
   Check peut modifier main lui-même ; sync doit refléter l'état final, pas
   un état intermédiaire.
6. `Release Publish` se déclenche aussi après `Release Prepublish Check`
   (en parallèle de 5, les deux sont indépendants l'un de l'autre).

## Le trou de concurrence identifié, et pourquoi la séquence ci-dessus le ferme

Si plusieurs workflows séparés peuvent chacun potentiellement écrire sur
`main` de façon asynchrone, rien ne garantit qu'ils ne se chevauchent pas
dans le temps (pas d'exclusion mutuelle native entre workflows différents,
`concurrency:` ne protège qu'à l'intérieur d'un même workflow).

Solution retenue : le bump de version entier (étapes création de branche +
semantic-release + ouverture PR + attente du merge) doit rester **un seul
job séquentiel**, jamais rendre la main entre ces étapes à un autre
déclencheur — pas une suite de workflows séparés qui se repasseraient le
relais. Ça élimine la fenêtre de concurrence par construction : tant que ce
job tourne, aucune autre écriture ne peut s'intercaler dans son propre
processus.

## CI séparées pour main et dev

`ci.yml` actuel est unique et sert les deux cibles (`dev` et `main`) avec
les mêmes commandes. À séparer en deux fichiers distincts, même si leur
contenu se ressemble aujourd'hui — parce qu'une PR de release
(`release/pending → main`) n'a pas vocation à demander exactement la même
chose qu'une PR de feature (`feat/xyz → dev`), et diverger plus tard sans
se marcher dessus doit rester possible sans tout réorganiser.

## Scripts à écrire, découpés pour être réutilisables (pas un seul monolithe)

- **`scripts/create-branch.sh`** — générique, déjà écrit et validé dans
  cette conversation :
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail

  BRANCH_NAME="$1"
  SOURCE_BRANCH="$2"
  REPO="${GITHUB_REPOSITORY}"

  gh api "repos/$REPO/git/refs/heads/$BRANCH_NAME" --silent && \
    gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH_NAME" || true

  SOURCE_SHA=$(gh api "repos/$REPO/git/refs/heads/$SOURCE_BRANCH" --jq .object.sha)

  gh api "repos/$REPO/git/refs" \
    -f ref="refs/heads/$BRANCH_NAME" \
    -f sha="$SOURCE_SHA"

  echo "Branch $BRANCH_NAME created from $SOURCE_BRANCH (sha: $SOURCE_SHA)"
  ```
  À utiliser aussi bien dans `sync-main-into-dev.sh` (remplacer sa logique
  de création de branche dupliquée) que dans le nouveau script de release.

- **`scripts/run-semantic-release-version-only.sh`** — lance
  `semantic-release` avec la config bump-only, sur la branche courante.
  Réutilisable indépendamment du contexte release/main.

- **`scripts/open-and-wait-pr-merge.sh`** — généralisation du bloc
  "ouvrir une PR + activer l'auto-merge + attendre avec diagnostic" déjà
  présent dans `sync-main-into-dev.sh`, mais paramétré (branches en
  argument) pour être réutilisé ici aussi, au lieu de dupliquer cette
  logique une deuxième fois.

## Pourquoi documenté plutôt que codé tout de suite

Discuté en détail en fin de session, avec plusieurs allers-retours pour
clarifier chaque point (transactionnalité de semantic-release vérifiée par
recherche, trou de concurrence identifié, découpage des scripts validé).
Fatigue de session réelle au moment de la décision — mieux vaut figer
proprement maintenant et reprendre à froid plutôt que de coder vite et mal
sur un sujet qui touche directement à `main` et à la publication réelle.
