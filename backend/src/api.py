"""API FastAPI exposant la couche gold des arbres de Montréal.

Lancer :
    cd backend
    uv run uvicorn api:app --app-dir src --reload

Pré-requis : avoir généré la couche gold via ``uv run python src/main.py``.
"""

from __future__ import annotations

import gzip
import json
from contextlib import asynccontextmanager
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware

import config

# Données gold chargées en mémoire au démarrage. Contient aussi le payload
# colonnaire pré-sérialisé des points (clé "points_bytes").
_DATA: dict[str, Any] = {}

# Colonnes renvoyées pour la carte (payload minimal).
_TREE_COLS = [
    "id", "longitude", "latitude", "essence_latin", "essence_fr",
    "arrondissement", "annee_plantation", "dhp_cm",
    "color_hex", "color_hex_dark", "display_group",
    "display_color", "display_color_dark",
]


def _load_gold() -> None:
    try:
        trees = pd.read_parquet(config.GOLD_DIR / "trees.parquet")
        species = pd.read_parquet(config.GOLD_DIR / "species_colors.parquet")
        annual = pd.read_parquet(config.GOLD_DIR / "annual_counts.parquet")
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Couche gold introuvable. Lancer d'abord : uv run python src/main.py"
        ) from exc
    _DATA["trees"] = trees
    _DATA["species"] = species
    _DATA["annual"] = annual
    raw = _build_points_payload()
    _DATA["points_bytes"] = raw
    _DATA["points_gzip"] = gzip.compress(raw, compresslevel=6)


def _build_points_payload() -> bytes:
    """Pré-sérialise TOUS les points géolocalisés en format colonnaire compact.

    Au lieu de 335 k objets JSON (clés + chaînes répétées), on renvoie des
    tableaux parallèles + une palette d'espèces envoyée une seule fois ; chaque
    point ne porte qu'un index d'espèce (petit entier). Chargé une fois par le
    front, puis filtré/animé côté client. Combiné à gzip, le volume est divisé
    par ~15 et la lecture devient instantanée (zéro réseau par année).
    """
    trees: pd.DataFrame = _DATA["trees"]
    species: pd.DataFrame = _DATA["species"].reset_index(drop=True)

    sp_index = {k: i for i, k in enumerate(species[config.SPECIES_KEY])}
    arronds = sorted(trees["arrondissement"].dropna().unique().tolist())
    arr_index = {a: i for i, a in enumerate(arronds)}

    # Axe temporel = ANNÉE DE PLANTATION. Les arbres sans date de plantation
    # reçoivent 0 : ils ne correspondront à aucune année du slider, donc ne sont
    # pas affichés (choix assumé de fidélité à la vraie date de plantation).
    df = trees[trees["has_coords"]].copy()
    df["_sp"] = df[config.SPECIES_KEY].map(sp_index).fillna(-1).astype("int32")
    df["_arr"] = df["arrondissement"].map(arr_index).fillna(-1).astype("int32")
    df["_annee"] = df["annee_plantation"].fillna(0).astype("int32")
    df = df.sort_values("_sp", kind="stable")

    payload = {
        "count": int(len(df)),
        "species": {
            "color": species["color_hex"].tolist(),
            "name": species["essence_fr"].fillna(species[config.SPECIES_KEY]).tolist(),
        },
        "arronds": arronds,
        "lon": df["longitude"].round(5).tolist(),
        "lat": df["latitude"].round(5).tolist(),
        "annee": df["_annee"].tolist(),
        "sp": df["_sp"].tolist(),
        "arr": df["_arr"].tolist(),
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


@asynccontextmanager
async def lifespan(_: FastAPI):
    _load_gold()
    yield
    _DATA.clear()


app = FastAPI(
    title="Montréal Tree Analytics API",
    description="Expose la couche gold : arbres, timeline et couleurs par espèce.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev : frontend sur un autre port
    allow_methods=["*"],
    allow_headers=["*"],
)


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """DataFrame -> liste de dicts JSON-safe.

    Gère les manquants pandas (NaN, NaT, pd.NA) -> None et convertit les
    scalaires numpy/pandas en types Python natifs sérialisables.
    """
    out: list[dict[str, Any]] = []
    for rec in df.to_dict(orient="records"):
        clean: dict[str, Any] = {}
        for key, value in rec.items():
            try:
                missing = bool(pd.isna(value))
            except (TypeError, ValueError):
                missing = False
            if missing:
                clean[key] = None
            elif hasattr(value, "item"):
                clean[key] = value.item()
            else:
                clean[key] = value
        out.append(clean)
    return out


def _filter_trees(
    annee_min: int | None,
    annee_max: int | None,
    arrondissement: str | None,
    essence_latin: str | None,
    remarquable: bool | None,
    geolocalises_only: bool,
) -> pd.DataFrame:
    df = _DATA["trees"]
    mask = pd.Series(True, index=df.index)

    if geolocalises_only:
        mask &= df["has_coords"]
    if annee_min is not None:
        mask &= df["annee_plantation"].notna() & (df["annee_plantation"] >= annee_min)
    if annee_max is not None:
        mask &= df["annee_plantation"].notna() & (df["annee_plantation"] <= annee_max)
    if arrondissement:
        mask &= df["arrondissement"] == arrondissement
    if essence_latin:
        mask &= df["essence_latin"] == essence_latin
    if remarquable is not None:
        mask &= df["arbre_remarquable"] == remarquable

    return df[mask]


@app.get("/")
def root() -> dict[str, Any]:
    trees = _DATA["trees"]
    return {
        "service": "Montréal Tree Analytics API",
        "arbres": len(trees),
        "especes": len(_DATA["species"]),
        "endpoints": [
            "/api/points", "/api/trees", "/api/species",
            "/api/arrondissements", "/api/timeline", "/api/stats", "/docs",
        ],
    }


@app.get("/api/points")
def get_points(request: Request) -> Response:
    """Tous les points géolocalisés en format colonnaire compact (chargement
    unique). Le front filtre ensuite par année/arrondissement côté client.

    Sert le blob gzip pré-calculé si le client l'accepte (tous les navigateurs),
    sinon la version brute."""
    if "gzip" in request.headers.get("accept-encoding", "").lower():
        return Response(
            content=_DATA["points_gzip"],
            media_type="application/json",
            headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"},
        )
    return Response(content=_DATA["points_bytes"], media_type="application/json")


@app.get("/api/trees")
def get_trees(
    annee_min: int | None = Query(None, description="Année de plantation minimale"),
    annee_max: int | None = Query(None, description="Année de plantation maximale"),
    arrondissement: str | None = None,
    essence_latin: str | None = None,
    remarquable: bool | None = None,
    limit: int = Query(50_000, ge=1, le=400_000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Points d'arbres pour la carte, filtrables (timeline à fenêtre glissante
    via ``annee_min`` / ``annee_max``)."""
    filtered = _filter_trees(
        annee_min, annee_max, arrondissement, essence_latin,
        remarquable, geolocalises_only=True,
    )
    total = len(filtered)
    page = filtered.iloc[offset: offset + limit][_TREE_COLS]
    return {
        "total": total,
        "count": len(page),
        "offset": offset,
        "limit": limit,
        "trees": _records(page),
    }


@app.get("/api/species")
def get_species(limit: int | None = Query(None, ge=1, description="Top N par effectif")) -> list[dict[str, Any]]:
    """Table des espèces avec leur code couleur unique (et palette d'affichage)."""
    df = _DATA["species"]
    if limit is not None:
        df = df.head(limit)
    return _records(df)


@app.get("/api/arrondissements")
def get_arrondissements() -> list[str]:
    s = _DATA["trees"]["arrondissement"].dropna().unique().tolist()
    return sorted(s)


@app.get("/api/timeline")
def get_timeline() -> list[dict[str, Any]]:
    """Évolution annuelle : arbres plantés par an et cumul."""
    return _records(_DATA["annual"])


@app.get("/api/stats")
def get_stats(
    annee_min: int | None = None,
    annee_max: int | None = None,
    arrondissement: str | None = None,
) -> dict[str, Any]:
    """Statistiques descriptives, filtrables."""
    df = _filter_trees(
        annee_min, annee_max, arrondissement, None, None,
        geolocalises_only=False,
    )
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucun arbre pour ces filtres")

    dhp = df["dhp_cm"].dropna()
    return {
        "arbres": len(df),
        "especes": int(df["essence_latin"].nunique()),
        "arrondissements": int(df["arrondissement"].nunique()),
        "dhp_moyen_cm": round(float(dhp.mean()), 1) if not dhp.empty else None,
        "top_especes": _records(
            df["essence_fr"].value_counts().head(10)
            .rename_axis("essence_fr").reset_index(name="n")
        ),
    }
