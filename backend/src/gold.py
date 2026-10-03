"""Transformation ``raw`` -> ``gold`` des arbres de Montréal.

Produit trois artefacts dans ``data/gold`` :

* ``trees.parquet``          — un arbre par ligne, nettoyé, typé et enrichi de
                               sa couleur d'espèce ;
* ``species_colors.csv``     — table de dimension des espèces : effectif, rang,
                               couleur unique (claire/sombre) et palette
                               d'affichage. C'est la référence du « code couleur
                               par type d'arbre » ;
* ``annual_counts.parquet``  — agrégat annuel (plantés par an + cumul) pour la
                               timeline à fenêtre glissante.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd

import colors
import config

# Colonnes brutes -> colonnes gold (snake_case). Tout le reste est écarté.
COLUMN_RENAME = {
    "_id": "id",
    "INV_TYPE": "inv_type",
    "ARROND": "arrond_code",
    "ARROND_NOM": "arrondissement",
    "Rue": "rue",
    "Emplacement": "emplacement",
    "Sigle": "sigle",
    "Essence_latin": "essence_latin",
    "Essence_fr": "essence_fr",
    "Essence_ang": "essence_ang",
    "DHP": "dhp_cm",
    "Date_Releve": "date_releve",
    "Date_Plantation": "date_plantation",
    "NOM_PARC": "nom_parc",
    "Nom_secteur": "nom_secteur",
    "District": "district",
    "Arbre_remarquable": "arbre_remarquable",
    "Longitude": "longitude",
    "Latitude": "latitude",
}

_STRING_COLS = [
    "arrondissement",
    "rue",
    "emplacement",
    "sigle",
    "essence_latin",
    "essence_fr",
    "essence_ang",
    "nom_parc",
    "nom_secteur",
    "district",
]


def load_raw() -> pd.DataFrame:
    path = config.find_raw_csv()
    df = pd.read_csv(
        path,
        low_memory=False,
        encoding=config.RAW_ENCODING,
        encoding_errors=config.RAW_ENCODING_ERRORS,
    )
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Sélection, typage et nettoyage des lignes brutes."""
    df = df.rename(columns=COLUMN_RENAME)[list(COLUMN_RENAME.values())].copy()
    current_year = dt.date.today().year

    # Chaînes : trim + vide -> NA.
    for col in _STRING_COLS:
        s = df[col].astype("string").str.strip()
        df[col] = s.where(s.str.len() > 0, pd.NA)

    # Dates -> datetime, valeurs aberrantes -> NaT.
    plant = pd.to_datetime(df["date_plantation"], errors="coerce")
    releve = pd.to_datetime(df["date_releve"], errors="coerce")
    plant = plant.where(
        plant.dt.year.between(config.YEAR_PLANTATION_MIN, current_year)
    )
    releve = releve.where(
        releve.dt.year.between(config.YEAR_RELEVE_MIN, current_year)
    )
    df["date_plantation"] = plant
    df["date_releve"] = releve
    df["annee_plantation"] = plant.dt.year.astype("Int16")
    df["annee_releve"] = releve.dt.year.astype("Int16")

    # Diamètre : négatif ou invraisemblable -> NA.
    dhp = pd.to_numeric(df["dhp_cm"], errors="coerce")
    df["dhp_cm"] = dhp.where((dhp > 0) & (dhp <= config.DHP_MAX_CM)).astype("Float32")

    # Coordonnées : hors boîte de Montréal -> on marque la ligne.
    lon = pd.to_numeric(df["longitude"], errors="coerce")
    lat = pd.to_numeric(df["latitude"], errors="coerce")
    valid = (
        lon.between(config.LON_MIN, config.LON_MAX)
        & lat.between(config.LAT_MIN, config.LAT_MAX)
    )
    df["longitude"] = lon.where(valid)
    df["latitude"] = lat.where(valid)
    df["has_coords"] = valid.fillna(False)

    df["arbre_remarquable"] = (
        df["arbre_remarquable"].astype("string").str.strip().eq("O")
    )

    return df


def build_species_colors(df: pd.DataFrame) -> pd.DataFrame:
    """Table de dimension : une ligne par espèce avec son code couleur unique."""
    key = config.SPECIES_KEY

    agg = (
        df.groupby(key, dropna=True)
        .agg(
            sigle=("sigle", "first"),
            essence_fr=("essence_fr", "first"),
            essence_ang=("essence_ang", "first"),
            n_trees=("id", "count"),
        )
        .reset_index()
        .sort_values("n_trees", ascending=False, kind="stable")
        .reset_index(drop=True)
    )
    agg["rank"] = agg.index + 1

    keys = agg[key].tolist()
    light = colors.generate_unique_colors(keys, dark=False)
    dark = colors.generate_unique_colors(keys, dark=True)
    agg["color_hex"] = agg[key].map(light)
    agg["color_hex_dark"] = agg[key].map(dark)

    # Palette d'affichage (légende de carte) : top N + « Autres ».
    display = colors.assign_display_palette(keys)
    agg["display_group"] = [
        k if k in display else colors.OTHER_LABEL for k in agg[key]
    ]
    agg["display_color"] = [
        display.get(k, colors.OTHER_COLOR)[0] for k in agg[key]
    ]
    agg["display_color_dark"] = [
        display.get(k, colors.OTHER_COLOR)[1] for k in agg[key]
    ]

    cols = [
        key, "sigle", "essence_fr", "essence_ang", "n_trees", "rank",
        "color_hex", "color_hex_dark",
        "display_group", "display_color", "display_color_dark",
    ]
    return agg[cols]


def build_annual_counts(df: pd.DataFrame) -> pd.DataFrame:
    """Agrégat annuel pour la timeline : plantés par an + cumul."""
    planted = (
        df.dropna(subset=["annee_plantation"])
        .groupby("annee_plantation")
        .size()
        .rename("n_plantes")
        .reset_index()
        .rename(columns={"annee_plantation": "annee"})
        .sort_values("annee")
    )
    planted["annee"] = planted["annee"].astype(int)
    planted["n_cumule"] = planted["n_plantes"].cumsum()
    return planted.reset_index(drop=True)


def run_pipeline() -> dict[str, int]:
    """Exécute la transformation complète et écrit les artefacts gold."""
    config.GOLD_DIR.mkdir(parents=True, exist_ok=True)

    raw = load_raw()
    trees = clean(raw)

    species = build_species_colors(trees)
    annual = build_annual_counts(trees)

    # Enrichissement de la table de faits avec la couleur d'espèce.
    color_map = species.set_index(config.SPECIES_KEY)
    trees = trees.merge(
        color_map[["color_hex", "color_hex_dark", "display_group",
                   "display_color", "display_color_dark"]],
        left_on=config.SPECIES_KEY,
        right_index=True,
        how="left",
    )

    trees.to_parquet(config.GOLD_DIR / "trees.parquet", index=False)
    species.to_csv(
        config.GOLD_DIR / "species_colors.csv", index=False, encoding="utf-8"
    )
    species.to_parquet(config.GOLD_DIR / "species_colors.parquet", index=False)
    annual.to_parquet(config.GOLD_DIR / "annual_counts.parquet", index=False)

    return {
        "arbres": len(trees),
        "arbres_geolocalises": int(trees["has_coords"].sum()),
        "especes": len(species),
        "annees": len(annual),
    }
