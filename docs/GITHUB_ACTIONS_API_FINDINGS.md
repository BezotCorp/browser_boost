# Ce que l'API GitHub Actions expose réellement (vérifié empiriquement)

Ce document existe parce qu'on a longtemps supposé, à tort, que rien du texte
affiché par un step (`echo`, message d'erreur d'un outil tiers, `::error::`)
n'était récupérable ailleurs que dans les logs bruts. C'est faux — mais ce
n'est vrai que pour un endroit précis, découvert après plusieurs faux essais.
Ce document existe pour ne pas avoir à refaire ce chemin.

## Comment on a vérifié (méthode, pas juste conclusion)

1. Créé un repo jetable (`bezotremi-ci-sandbox`), un seul workflow avec un
   seul step : `echo "::error::MON MESSAGE PERSONNALISE ABC123"` puis `exit 1`.
2. Déclenché via `workflow_dispatch`.
3. Interrogé le run à trois niveaux différents pour comparer.

## Ce qui NE contient PAS le texte du step (vérifié, pas supposé)

- `gh run view <run_id> --json jobs` — donne `name`, `status`, `conclusion`,
  `started_at`, `completed_at` par step. Jamais le texte affiché.
- `gh api repos/{owner}/{repo}/actions/jobs/{job_id}` — objet complet et brut
  du job. Même liste de champs que ci-dessus, rien de plus, même en
  l'absence de tout filtre `--jq`.
- `github.event.workflow_run.*` (contexte auto injecté par le trigger
  `workflow_run`) — seulement des métadonnées de haut niveau (SHA, branche,
  conclusion, `head_commit.message` = le message du COMMIT git, pas d'un
  step). Aucun lien avec ce qu'un step a affiché à l'écran.

## Ce qui CONTIENT le texte du step (vérifié avec preuve)

**`gh api repos/{owner}/{repo}/check-runs/{job_id}/annotations`**

Retourne un tableau d'objets, chacun avec un champ `message` en texte
lisible. Deux cas observés :

- Un message générique produit automatiquement par GitHub Actions quand un
  step échoue : `"Process completed with exit code 1."` — toujours présent
  sur un step qui a `exit != 0`, qu'on ait écrit quelque chose ou non.
- **Un message personnalisé**, si le step a fait `echo "::error::texte"` —
  le texte exact apparaît dans son propre objet d'annotation, distinct du
  message générique ci-dessus. Preuve : `"message": "MON MESSAGE
  PERSONNALISE ABC123"` retourné tel quel par l'API sur le run de test.

Note : `job_id` ici est le même identifiant que celui utilisé pour
`actions/jobs/{job_id}` — l'API "Checks" (`check-runs/...`) et l'API
"Actions" (`actions/jobs/...`) pointent vers le même objet sous-jacent,
juste avec des champs différents exposés selon l'endpoint interrogé.

## Comment combler les trous pour notre cas d'usage (chaîner deux workflows)

Un workflow B déclenché par `workflow_run` sur A reçoit nativement
`github.event.workflow_run.id` (le run ID de A). À partir de là :

```bash
JOB_ID=$(gh api repos/{owner}/{repo}/actions/runs/${{ github.event.workflow_run.id }}/jobs --jq '.jobs[0].id')
MESSAGE=$(gh api repos/{owner}/{repo}/check-runs/$JOB_ID/annotations --jq '[.[] | select(.message != "Process completed with exit code 1.")][0].message')
```

`MESSAGE` contient alors le texte exact du `::error::` écrit dans A, filtré
pour exclure le message générique GitHub — utilisable ensuite dans B pour
une vraie décision conditionnelle basée sur le contenu, pas juste sur
success/failure.

## Ce que ça ne change PAS

- Le code de sortie d'un step reste strictement binaire (0 = succès,
  non-zéro = échec) pour GitHub Actions lui-même — jamais un `exit 2` vs
  `exit 1` distinguable. La distinction fine ne peut se faire que via le
  contenu du message, pas via le code numérique.
- Ça reste un appel API en plus (latence, quota de rate-limit à surveiller
  sur un usage intensif) — pas gratuit comme l'est le contexte
  `workflow_run` de base.
