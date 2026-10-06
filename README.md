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
| **raw** | `backend/data/raw/*.csv` | Données brutes telles que reçues (inventaire des arbres de Montréal, UTF-8, ~335 k lignes). |
| **gold** | `backend/data/gold/` | Données nettoyées, typées et enrichies, prêtes pour la carte, la timeline et le ML. |

### Lancer la transformation

```bash
cd backend
uv run python src/main.py
```

### Artefacts gold produits

* **`trees.parquet`** — un arbre par ligne, nettoyé et typé (dates parsées, coordonnées validées sur la boîte englobante de Montréal, DHP borné, accents français corrigés), enrichi de la **couleur de son espèce**.
* **`species_colors.csv`** / `species_colors.parquet` — table de dimension des espèces : effectif, rang, et **un code couleur unique par type d'arbre** (voir ci-dessous).
* **`annual_counts.parquet`** — agrégat annuel (arbres par an + cumul) qui alimente la **timeline à fenêtre glissante**.

> **Année de référence.** ~40 % des arbres n'ont pas de date de plantation dans la source. L'axe temporel utilise donc `annee_reference` = date de plantation si connue, **sinon date de relevé** (colonne `date_source` : `plantation` / `releve` / `inconnue`). La couverture temporelle passe ainsi de ~201 k à **335 383 / 335 499** arbres.

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
| `GET /api/points` | **Tous** les points géolocalisés en format colonnaire compact, pré-compressé gzip (~1,9 Mo). Chargé **une seule fois** par le front, qui filtre ensuite par année/arrondissement côté client. |
| `GET /api/trees` | Points filtrés côté serveur (requête ponctuelle). Filtres : `annee_min`, `annee_max`, `arrondissement`, `essence_latin`, `remarquable`, `limit`, `offset`. |
| `GET /api/species` | Table des espèces + code couleur unique (`?limit=N` pour le top N). |
| `GET /api/arrondissements` | Liste des arrondissements. |
| `GET /api/timeline` | Évolution annuelle (plantés par an + cumul). |
| `GET /api/stats` | Statistiques descriptives, filtrables. |

## Frontend (React + TypeScript + Vite)

Interface carte sobre et rectangulaire : navbar, fenêtre temporelle glissante (slider par année + bouton **Lire/Stop** qui déroule les années en ≤ 10 s), filtres et légende des essences. La carte (Leaflet, fond CARTO Positron) affiche chaque arbre avec la **couleur unique de son espèce**.

**Performance.** Les ~335 k points sont chargés **une seule fois** au démarrage via `/api/points` (format colonnaire + gzip, ~1,9 Mo). Tout le filtrage (année, arrondissement) et l'animation se font ensuite **côté client**, sans aucun aller-retour réseau — la lecture est instantanée.

```bash
cd frontend
npm install
cp .env.example .env     # puis renseigner VITE_CARTO_KEY (clé CARTO Basemaps)
npm run dev              # http://localhost:5173
```

Le backend doit tourner en parallèle sur le port 8000 ; les appels `/api/*` lui sont relayés par le proxy Vite (voir `vite.config.ts`).

> **Clé CARTO.** Le fond de carte CARTO exige une clé d'API. Elle se place dans `frontend/.env` (`VITE_CARTO_KEY=…`, fichier **non versionné** car c'est un secret) ; voir `.env.example`. Obtenir une clé : <https://carto.com/basemaps/apikey>.

### Mise en route complète

```bash
# Terminal 1 — backend
cd backend
uv run python src/main.py                         # génère le gold (une fois)
uv run uvicorn api:app --app-dir src --reload     # API sur :8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev                                        # UI sur :5173
```

## Déploiement (Railway)

L'application se déploie en **un seul service** : FastAPI sert à la fois l'API
(`/api/*`) et le frontend React compilé (à la racine `/`). Un `Dockerfile`
multi-étapes (à la racine du repo) construit le tout ; Railway le détecte
automatiquement.

**Mise en place :**

1. Associer le repo GitHub à un projet Railway (New Project → Deploy from GitHub).
2. Dans **Variables** du service, ajouter `VITE_CARTO_KEY` = votre clé CARTO
   (injectée au build du frontend ; sans elle, la carte fonctionne mais affiche
   le filigrane CARTO).
3. Déployer. Railway build le `Dockerfile`, expose `$PORT`, et sonde `/healthz`.

**Points importants :**

- La **couche gold** (`backend/data/gold/`, ~10 Mo) est **versionnée** : c'est la
  seule donnée nécessaire à l'exécution. Le CSV brut (98 Mo) reste git-ignoré.
- Pour **mettre à jour les données** : régénérer le gold en local
  (`cd backend && uv run python src/main.py`) puis commiter `backend/data/gold/`.
- Le frontend appelle `/api/...` en **chemin relatif** → même origine en prod,
  aucun réglage CORS ni URL d'API à configurer.

Tester l'image en local (identique à Railway) :

```bash
docker build -t mtl-trees --build-arg VITE_CARTO_KEY=... .
docker run --rm -e PORT=8000 -p 8085:8000 mtl-trees   # http://localhost:8085
```

## Structure du projet

```
montreal-tree-analytics/
├── Dockerfile          # build 1 service (frontend + API)
├── railway.json        # config déploiement Railway
├── backend/
│   ├── data/
│   │   ├── raw/     # CSV source 98 Mo (git-ignoré)
│   │   └── gold/    # artefacts ~10 Mo (VERSIONNÉS pour le déploiement)
│   └── src/
│       ├── config.py   # chemins, encodage, bornes de validation
│       ├── colors.py   # attribution des couleurs par espèce
│       ├── gold.py     # transformation raw → gold
│       ├── main.py     # point d'entrée du pipeline
│       └── api.py      # API FastAPI (sert la couche gold)
└── frontend/
    └── src/
        ├── api.ts            # client de l'API (types + fetch)
        ├── App.tsx           # état et orchestration
        ├── index.css         # thème sobre, rectangulaire
        └── components/
            ├── NavBar.tsx
            ├── ControlPanel.tsx   # slider, stats, filtre, légende
            ├── Legend.tsx
            └── TreeMap.tsx        # carte Leaflet (rendu canvas)
```
