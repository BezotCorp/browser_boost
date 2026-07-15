# TODO — Refonte du pipeline de release (jamais commencée, à faire)

Ce document remplace entièrement la version précédente, qui gardait l'ancien
découpage en plusieurs fichiers `workflow_run` chaînés — une architecture
abandonnée après discussion. Voici l'architecture réellement retenue.

## Le problème qui motive cette refonte

`semantic-release` n'est PAS transactionnel (confirmé par les mainteneurs
eux-mêmes sur une discussion GitHub officielle : "no rollback. semantic-release
tags before publish and won't delete the tag or GH release on failure").

Un `git commit` peut réussir localement sur un runner sans que le `git push`
derrière n'atteigne jamais `main` — aucun moyen fiable de le détecter après
coup par une simple comparaison de SHA. Et aucun moyen simple de revenir en
arrière si `semantic-release` écrit directement sur `main`.

Principe retenu : jamais toucher `main` en direct pour le bump de version.
Le "tout ou rien" doit être garanti par un vrai merge de PR (protégé, testé),
pas par une comparaison de SHA après coup.

## Architecture retenue (remplace tous les .yml existants)

Abandon complet du découpage précédent en 5 fichiers séparés reliés par
`workflow_run` (`release-version.yml`, `release-prepublish-check.yml`,
`release-publish.yml`, `prepare-sync-main-into-dev.yml`, `ci.yml`). Trop de
fichiers, trop de frontières où l'information se perd, trop de risques de
mal relier deux workflows par un nom qui change.

**Trois fichiers au lieu de cinq :**

### 1. Un CI générique commun

Rôle unique : contrôle avant merge de n'importe quelle PR, quelle que soit
la cible. C'est le socle que toute PR doit passer, dev ou main.

### 2. CI Main

Se déclenche sur les événements concernant main. Contient TOUT le
pipeline de release en un seul fichier, un seul job séquentiel (pas
plusieurs fichiers reliés par workflow_run — ça évite le trou de
concurrence identifié précédemment : tant qu'un seul job tourne sans
rendre la main à un autre déclencheur, aucune autre écriture ne peut
s'intercaler) :

1. Lance le contrôle générique (le CI commun) sur ce qui arrive vers main.
2. Si c'est le merge d'une PR de feature classique (dev vers main) qui vient
   d'arriver sur main : crée la branche de release jetable, lance
   semantic-release (bump only) DESSUS, jamais sur main directement.
3. Ouvre une PR de cette branche de release vers main, avec auto-merge.
4. Attend l'issue du merge (conflit / CI cassée / timeout — diagnostics
   déjà écrits dans open-and-wait-pr-merge.sh).
5. Une fois cette PR de release mergée pour de vrai (ou si rien n'y avait à
   publier — cas normal, pas une erreur), gère la suite : sync vers dev,
   publication AMO si une version existe réellement.

Point de vigilance à trancher au moment d'écrire ce fichier : comment
distinguer, à l'intérieur de ce même fichier, "je suis en train de valider
le premier merge dev vers main" de "je suis en train de valider ma propre PR de
release qui vient d'être ouverte" — les deux événements ciblent main et
pourraient tous les deux redéclencher ce fichier. Un déclenchement en
boucle est un vrai risque à éliminer avant d'écrire quoi que ce soit (par
exemple : ignorer explicitement les events où l'auteur du push/PR est le
bot de release lui-même, ou détecter via le nom de la branche head).

### 3. CI Dev

Se déclenche sur les événements concernant dev. Ne contient aucune des
étapes de branche/PR de release (ça ne concerne que main) — reste simple.
Question ouverte, pas encore tranchée : est-ce que ce fichier a encore une
raison d'exister séparément du CI générique commun, ou si le CI commun
suffit intégralement pour dev puisqu'il n'a besoin d'aucune étape
supplémentaire propre à lui. À décider au moment de l'écrire.

## Ce qui disparaît de l'ancienne architecture

- Plus de workflow_run en cascade entre plusieurs fichiers séparés pour
  le pipeline de release — tout vit dans un seul fichier, un seul job.
- Plus besoin de lire les annotations de l'API Checks pour faire transiter
  un message entre deux workflows séparés (cette technique reste
  documentée dans docs/GITHUB_ACTIONS_API_FINDINGS.md si un besoin futur
  s'en présente ailleurs, mais elle ne sert plus ici).

## Scripts déjà écrits, toujours valides et réutilisés tels quels

- scripts/create-branch.sh — générique, delete-if-exists + recrée une
  branche depuis une source.
- scripts/open-and-wait-pr-merge.sh — ouvre une PR, active l'auto-merge,
  attend son issue avec diagnostics.
- scripts/run-semantic-release-version.sh — lance semantic-release
  (config bump-only), compare HEAD avant/après, échoue explicitement si
  rien à bumper.
- scripts/sync-main-into-dev.sh — à réintégrer comme étape interne de
  CI Main plutôt que comme fichier .yml séparé déclenché par workflow_run.

## Pourquoi ce document a été réécrit une première fois

La version d'origine de ce document gardait l'architecture en 5 fichiers
workflow_run chaînés, découverte comme insuffisante en cours de discussion
(confusion entre CI générique et CI spécifique à main, risque de boucle de
déclenchement, complexité inutile de faire transiter un message entre
fichiers séparés). La section ci-dessus ("3 fichiers au lieu de cinq")
reflétait déjà une amélioration, mais elle aussi a fini par être
abandonnée — voir la section suivante.

## MISE À JOUR FINALE — changement de patron d'architecture (workflow_call, pas workflow_run)

Après une exploration encore plus poussée, même le patron "3 fichiers reliés
par workflow_run" (CI commun / CI Main / CI Dev, section ci-dessus) s'est
révélé structurellement mal adapté à ce qu'on veut vraiment construire : un
vrai orchestrateur qui appelle plusieurs workers spécialisés (version,
prepublish, sync, publish) et prend des décisions sur la base de leurs
résultats réels.

Le problème rencontré en essayant d'implémenter "CI Main" comme un seul
fichier avec deux jobs (gate + worker) reliés par needs: — même dans un
seul fichier, faire porter à un seul nom de workflow deux rôles distincts
(décideur et exécutant) pose un problème de cohérence : le nom doit dire la
fonction, pas mélanger deux fonctions différentes sous un seul chapeau.
Séparer gate et worker en deux fichiers reliés par workflow_run recrée le
problème de fond : workflow_run ne transmet jamais de données
personnalisées entre fichiers (confirmé dans
docs/GITHUB_ACTIONS_API_FINDINGS.md) — seulement des métadonnées natives
(conclusion, sha, etc.). Le contourner via les annotations de l'API Checks
fonctionne mais est lourd, indirect, et fragile (comparaison de texte).

### La vraie solution : workflow_call (reusable workflows)

Contrairement à workflow_run, workflow_call permet à un workflow
"appelant" d'invoquer un autre workflow comme une vraie sous-routine :
passage réel d'inputs, récupération réelle d'outputs, exécution
séquentielle sous contrôle direct de l'appelant. C'est le patron standard
pour "un orchestrateur qui pilote plusieurs workers spécialisés" — celui
qu'on cherchait depuis le début sans le nommer correctement.

### Architecture cible (à écrire, pas encore codée)

Remplace entièrement la section "3 fichiers au lieu de cinq" ci-dessus.

- **Main Orchestrator** — le seul fichier qui se déclenche sur push vers
  main (garde le CI générique commun comme premier appel interne, pas
  besoin d'un fichier séparé pour ça — à confirmer au moment d'écrire).
  Appelle, dans l'ordre, les workers dont il a besoin, via workflow_call.
  Reçoit leurs outputs réels et décide de la suite :
  - appelle le worker "version" (équivalent de l'ancien
    release-version.yml, retravaillé en reusable workflow qui retourne un
    vrai output, par exemple has_new_version: true/false et
    new_version: X.Y.Z — plus besoin de deviner via l'auteur du commit ou
    les annotations, l'output est directement disponible)
  - si pas de nouvelle version → déclenche directement le sync vers dev,
    s'arrête là, sans passer par les étapes de publication
  - si nouvelle version → enchaîne vers les workers suivants (prepublish,
    publish), avec la vraie version en main, sans avoir à la redeviner

- **Chaque worker** (version, prepublish, publish, sync) devient un
  reusable workflow (on: workflow_call), appelé explicitement par Main
  Orchestrator, jamais déclenché tout seul par un événement externe. Plus
  de risque de double déclenchement ou de boucle, puisqu'ils ne réagissent
  plus à des événements globaux (push, workflow_run) mais uniquement à un
  appel direct et contrôlé par l'orchestrateur.

- **CI Dev** reste un fichier séparé classique (pull_request vers dev),
  puisqu'il n'a jamais eu besoin de faire partie de l'orchestration —
  seul le pipeline lié à main en avait besoin.

### Pourquoi c'était le bon changement, pas une complication de plus

Les deux patrons précédents (5 fichiers, puis 3 fichiers, tous deux reliés
par workflow_run/needs: mal utilisé) rendaient presque impossible de
raisonner clairement sur "qui contrôle qui, dans quel ordre, avec quelles
garanties contre la concurrence" — chaque nouveau cas limite (boucle de
déclenchement, double exécution, transmission de données) demandait un
nouveau contournement bricolé. workflow_call remet le contrôle entièrement
entre les mains d'un seul point d'entrée, avec de vraies données qui
circulent, plutôt que des signaux pauvres (succès/échec binaire, texte de
log à parser) qu'il fallait sans cesse enrichir après coup.

### Pas encore fait

Rien de cette architecture finale n'est codé. Les scripts déjà écrits
(create-branch.sh, open-and-wait-pr-merge.sh, run-semantic-release-version.sh)
restent valides et réutilisables tels quels à l'intérieur des futurs
reusable workflows — c'est uniquement la couche .yml au-dessus qui change
de patron, pas la logique métier en shell. Les fichiers common-ci.yml et
main-orchestrator.yml (version gate/worker) créés en cours de session sont
à reprendre selon cette nouvelle architecture, pas à garder tels quels.
