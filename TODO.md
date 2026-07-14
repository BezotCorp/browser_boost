# BrowserBoost — pistes futures

## Correspondance floue par confiance pour les sélecteurs de site (breaking change potentiel)

Actuellement, `ChatGptSite` cible des sélecteurs figés (`data-testid^="conversation-turn-"`,
`main`). Si OpenAI renomme ces attributs/balises, la détection casse silencieusement
jusqu'à mise à jour manuelle du sélecteur.

Piste : un système de correspondance par score de confiance — plusieurs indices
structurels (position dans l'arbre, attributs voisins stables, taille/forme similaire
à l'ancien élément) pondérés pour basculer automatiquement sur un nouveau sélecteur
candidat sans intervention humaine.

Ampleur : nouveau système à part entière, pas une extension mineure de l'existant.
À concevoir séparément — pas dans le cadre de la migration WXT en cours.
