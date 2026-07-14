# Pipeline CI/CD — BrowserBoost

## Vue d'ensemble

```text
PR ouverte (dev -> main, ou feat/* -> dev)
        |
        v
    CI (ci-checks)
        | (push sur main uniquement)
        v
  Release Version
        |
   +----+----+
   v         v
Release   Prepare sync
Publish   main into dev
```

## Les branches

- **main** — code publié. Protégée : `ci-checks` requis, à jour obligatoire (`strict: true`).
- **dev** — intégration continue. Même protection que `main`.
- **sync/main-into-dev** — branche tampon jetable, recréée à chaque sync, supprimée après usage.

## Les 4 workflows

### 1. `ci.yml` — job `ci-checks`

**Déclenché par** : `pull_request` (base = `dev` ou `main`) et `push` (vers `dev`, `main`, ou toute branche `feat/**`, `fix/**`, `test/**`, `chore/**`, `ci/**`).

**Fait** : `pnpm install --frozen-lockfile`, puis `pnpm check` (typecheck + build + lint + tests), puis `pnpm pack:xpi`.

**Rôle** : seul check exigé par la protection de branche. Bloque le merge de toute PR tant qu'il n'est pas vert.

### 2. `release-version.yml` — job `version`

**Déclenché par** : `workflow_run` sur `CI`, uniquement si `conclusion == success`, sur `main`.

**Fait** : lance `semantic-release` avec `.releaserc.json` — analyse les commits, calcule la version, génère le changelog, bump `package.json`, commit + push direct sur `main` (comportement standard de `@semantic-release/git`, documenté, pas une entorse à la discipline PR — c'est l'outil qui le fait, pas nous).

**Ne publie rien** — s'arrête après le bump.

### 3. `release-publish.yml` — job `publish`

**Déclenché par** : `workflow_run` sur `Release Version`, uniquement si `conclusion == success`.

**Fait** : lit la version depuis `package.json` (jamais depuis les tags Git — non fiable, dépend de l'historique local du clone), lance `scripts/publish-firefox.sh` qui appelle `pnpm release:firefox` (build, lint, signe, publie sur AMO) puis crée la release GitHub avec l'artefact `.xpi`.

**Si ça échoue** : aucun impact sur `main` (déjà mis à jour par l'étape précédente) ni sur le sync (indépendant).

### 4. `prepare-sync-main-into-dev.yml` — job `prepare-sync`

**Déclenché par** : `workflow_run` sur `Release Version`, peu importe sa conclusion (succès ou échec) — volontaire : `main` a avancé, `dev` doit le refléter, indépendamment du sort de la publication.

**Fait** : `scripts/sync-main-into-dev.sh` — recrée `sync/main-into-dev` depuis `main`, ouvre une PR vers `dev`, active l'auto-merge (attend `ci-checks` vert + à jour), boucle jusqu'à 5 min en surveillant l'issue, échoue explicitement (avec message clair dans les logs, ce qui déclenche une notification GitHub) si conflit détecté, CI cassée, ou timeout — jamais de résolution automatique silencieuse.

## Pourquoi `workflow_run` partout, jamais `needs:`

`needs:` ne fonctionne qu'entre jobs à l'intérieur d'un même fichier `.yml`. Pour faire dépendre un workflow entier de la fin d'un autre workflow (dans un fichier séparé), il faut `workflow_run`, qui écoute l'événement "tel workflow nommé X s'est terminé" plutôt qu'un événement brut (`push`).

**Piège à connaître** : le nom déclaré dans `workflows: ["X"]` doit correspondre **exactement** au champ `name:` du fichier ciblé — pas au nom du fichier, pas au nom du job. Une différence, même minime, fait que le déclenchement ne se produit jamais, sans aucune erreur visible (c'est ce qui nous est arrivé avec `validate` vs `ci-checks` vs `CI / validate (pull_request)` plus tôt).

## Pourquoi `semantic-release` n'est jamais coupé en plusieurs runs

`semantic-release` n'a pas de notion de "reprendre où il s'était arrêté" — chaque invocation recalcule tout depuis zéro (commits, version) à partir de l'état actuel du repo. Il est en revanche déjà découpé en phases internes fixes (`analyzeCommits` → `prepare` → `publish`), et c'est précisément la fin de la phase `prepare` (bump + push) qui nous intéresse comme point de séparation — d'où le split en deux fichiers `.releaserc` distincts (un pour le bump seul, un pour la publication seule), plutôt que de bricoler un seul run qui s'arrêterait à mi-chemin.

## Pourquoi le push direct sur `main` par le bot de release n'est pas une entorse à la discipline PR

`@semantic-release/git` pousse directement, sans PR — documenté comme le comportement standard de l'outil. Notre protection de branche (`restrictions: null`) n'empêche que les merges de PR non conformes, jamais un push direct effectué par un compte qui a les droits d'écriture (ici, le token du bot `bezotcorp-release-bot`). C'est un compromis assumé de l'écosystème `semantic-release`, pas une brèche qu'on a ouverte par erreur.

## Les deux bots GitHub App utilisés

- **`bezotcorp-release-bot`** (secrets `BEZOTCORP_RELEASE_BOT_APP_ID` / `BEZOTCORP_RELEASE_BOT_PRIVATE_KEY`) — utilisé par `release-version.yml` et `release-publish.yml`. Droits d'écriture sur `main`.
- **`automation-project-bot`** (secrets `BOT_APP_ID` / `BOT_APP_PRIVATE_KEY`) — utilisé par `prepare-sync-main-into-dev.yml`. Droits sur les branches/PR pour le sync.

Les deux tokens sont générés via `actions/create-github-app-token`, jamais stockés en clair — seuls l'App ID et la clé privée sont en secret, le token lui-même est temporaire, généré à chaque run.
