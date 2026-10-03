# Montréal Tree Analytics

Application interactive d'analyse des arbres de Montréal à partir des données géographiques et temporelles disponibles.

L'application permet de visualiser les arbres de Montréal sur une carte et d'explorer leur évolution au fil du temps. L'objectif est notamment de créer une **timeline avec une fenêtre temporelle glissante (sliding window)** permettant de faire évoluer progressivement la carte et d'observer le **nombre d'arbres recensés au cours du temps**.

L'application devra éventuellement intégrer une composante de **Machine Learning** afin d'analyser les données et d'identifier des tendances ou de faire des prédictions à partir des caractéristiques des arbres, de leur localisation et de leur évolution temporelle.

### Fonctionnalités prévues

* Carte interactive des arbres de Montréal
* Sliding window permettant de parcourir l'évolution temporelle des données
* Affichage du nombre d'arbres pour chaque période
* Visualisation de l'évolution du nombre d'arbres dans le temps
* Filtres par arrondissement, espèce, année, etc.
* Statistiques descriptives sur les arbres
* Préparation des données pour de futurs modèles de Machine Learning
* Éventuellement, modèles ML pour analyser ou prédire certaines caractéristiques des arbres
* Possibilité d'explorer par la suite des approches de ML spatial et temporel

L'application sera donc développée progressivement : **visualisation et analyse temporelle → préparation des données → Machine Learning → analyse spatiale et prédictive**.

---

## Pipeline de données (architecture médaillon)

Les données suivent une progression `raw → gold` :

| Couche | Emplacement | Contenu |
|--------|-------------|---------|
| **raw** | `backend/data/raw/*.csv` | Données brutes telles que reçues (inventaire des arbres de Montréal, Windows-1252, ~335 k lignes). |
| **gold** | `backend/data/gold/` | Données nettoyées, typées et enrichies, prêtes pour la carte, la timeline et le ML. |

### Lancer la transformation

```bash
cd backend
uv run python src/main.py
```

### Artefacts gold produits

* **`trees.parquet`** — un arbre par ligne, nettoyé et typé (dates parsées, coordonnées validées sur la boîte englobante de Montréal, DHP borné, accents français corrigés), enrichi de la **couleur de son espèce**.
* **`species_colors.csv`** / `species_colors.parquet` — table de dimension des espèces : effectif, rang, et **un code couleur unique par type d'arbre** (voir ci-dessous).
* **`annual_counts.parquet`** — agrégat annuel (arbres plantés par an + cumul) qui alimente la **timeline à fenêtre glissante**.

### Code couleur par type d'arbre

Chaque espèce (`essence_latin`, 806 types) reçoit une **couleur hexadécimale unique et déterministe**, en mode clair (`color_hex`) et sombre (`color_hex_dark`). Les teintes sont réparties par l'angle d'or pour un espacement maximal, dans une bande de luminosité lisible sur un fond de carte.

Pour une **légende de carte** réellement distinguable à l'œil, la table fournit aussi une palette d'affichage (`display_group` / `display_color`) : les espèces les plus fréquentes reçoivent une couleur d'une palette catégorielle validée (sûre pour le daltonisme), les autres étant regroupées sous « Autres ».

## API (FastAPI)

L'API sert la couche gold au frontend (carte, timeline, filtres).

```bash
cd backend
uv run python src/main.py          # 1. générer le gold (si pas déjà fait)
uv run uvicorn api:app --app-dir src --reload   # 2. lancer l'API
```

Documentation interactive : <http://127.0.0.1:8000/docs>

| Endpoint | Rôle |
|----------|------|
| `GET /api/trees` | Points d'arbres pour la carte. Filtres : `annee_min`, `annee_max` (**fenêtre glissante**), `arrondissement`, `essence_latin`, `remarquable`, `limit`, `offset`. |
| `GET /api/species` | Table des espèces + code couleur unique (`?limit=N` pour le top N). |
| `GET /api/arrondissements` | Liste des arrondissements. |
| `GET /api/timeline` | Évolution annuelle (plantés par an + cumul). |
| `GET /api/stats` | Statistiques descriptives, filtrables. |

### Structure du backend

```
backend/
├── data/
│   ├── raw/     # CSV source (git-ignoré)
│   └── gold/    # artefacts générés (git-ignoré)
└── src/
    ├── config.py   # chemins, encodage, bornes de validation
    ├── colors.py   # attribution des couleurs par espèce
    ├── gold.py     # transformation raw → gold
    ├── main.py     # point d'entrée du pipeline
    └── api.py      # API FastAPI (sert la couche gold)
```
