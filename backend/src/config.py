"""Chemins et constantes partagés par le pipeline de transformation.

Architecture médaillon : ``raw`` (données brutes, telles que reçues) ->
``gold`` (données nettoyées, typées et enrichies, prêtes pour l'analyse et la
visualisation : carte, timeline, filtres, futurs modèles ML).
"""

from __future__ import annotations

from pathlib import Path

# backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = BACKEND_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
GOLD_DIR = DATA_DIR / "gold"

# Le fichier source est encodé en UTF-8 (accents français corrects :
# « Érable argenté », « Frêne »...). On garde un repli « replace » au cas où un
# octet isolé serait invalide, plutôt que de planter.
RAW_ENCODING = "utf-8"
RAW_ENCODING_ERRORS = "replace"

# Clé d'identité d'un « type d'arbre ». Dans ce jeu de données ``Sigle`` et
# ``Essence_latin`` sont en correspondance 1:1 ; on prend l'espèce latine comme
# clé sémantique stable pour la couleur.
SPECIES_KEY = "essence_latin"

# Boîte englobante approximative de l'île de Montréal (filtre de coordonnées).
LON_MIN, LON_MAX = -74.05, -73.40
LAT_MIN, LAT_MAX = 45.38, 45.75

# Bornes de plausibilité temporelle.
YEAR_PLANTATION_MIN = 1850
YEAR_RELEVE_MIN = 1980

# Diamètre (DHP) plausible, en cm.
DHP_MAX_CM = 400


def find_raw_csv() -> Path:
    """Retourne l'unique CSV présent dans ``data/raw``."""
    csvs = sorted(RAW_DIR.glob("*.csv"))
    if not csvs:
        raise FileNotFoundError(f"Aucun fichier CSV trouvé dans {RAW_DIR}")
    if len(csvs) > 1:
        raise RuntimeError(
            f"Plusieurs CSV dans {RAW_DIR}, préciser lequel utiliser : "
            + ", ".join(p.name for p in csvs)
        )
    return csvs[0]
